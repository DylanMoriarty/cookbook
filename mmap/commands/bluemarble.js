/**
 * bluemarble
 * ============================================================
 * Fetches NASA Blue Marble imagery (via GIBS WMTS) clipped to a
 * GeoJSON bounding box, at a given output resolution, and saves
 * it as a single GeoTIFF.
 *
 * Under the hood this shells out to GDAL's `gdalwarp`, using
 * GDAL's WMTS driver to treat the GIBS endpoint as one giant
 * virtual global raster. gdalwarp only requests the tiles that
 * fall within the bbox at the given resolution, and mosaics them
 * into the output file itself - so there's no separate
 * "download tiles" + "merge" step; GDAL does both as part of
 * the warp.
 *
 * ------------------------------------------------------------
 * USAGE
 * ------------------------------------------------------------
 *   mmap bluemarble --bbox area.geojson --res 0.01 --out clip.tif
 *
 * Options:
 *   --bbox    <path>   Path to a GeoJSON file (Polygon, Feature,
 *                       FeatureCollection - any of these work).
 *                       Required.
 *   --res     <number> Output resolution in degrees/pixel.
 *                       Default: 0.01
 *   --out     <path>   Output GeoTIFF path.
 *                       Default: output/blue_marble_clip.tif
 *   --layer   <name>   GIBS layer name.
 *                       Default: BlueMarble_NextGeneration
 *   --check-only       Just print the parsed bbox and exit.
 *
 * RES is in degrees/pixel (the GIBS EPSG:4326 endpoint is in
 * lat/lon, not meters). Roughly:
 *   0.1     ~11 km/pixel  (very coarse, fast)
 *   0.01    ~1.1 km/pixel (Blue Marble's native ballpark)
 *   0.005   ~550 m/pixel  (Blue Marble's native res is ~500m/px,
 *                          so going finer than this just
 *                          interpolates - it doesn't add detail)
 *
 * ------------------------------------------------------------
 * REQUIREMENTS
 * ------------------------------------------------------------
 *   - GDAL command-line tools (gdalwarp) with WMTS driver support.
 *     Confirm with: gdalinfo --formats | grep -i wmts
 *   - Node.js (built-ins only - no npm install needed)
 * ============================================================
 */

import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";

export const meta = {
  usage: "bluemarble --bbox <area.geojson> [--res 0.01] [--out output.tif] [--layer BlueMarble_ShadedRelief_Bathymetry] [--check-only]",
  description: "Fetch and clip NASA Blue Marble imagery to a GeoJSON bbox via GDAL/WMTS",
};

const WMTS_CAPABILITIES = "https://gibs.earthdata.nasa.gov/wmts/epsg4326/best/1.0.0/WMTSCapabilities.xml";
const SRS = "EPSG:4326";

// ------------------------------------------------------------
// CLI argument parsing (no dependencies)
// ------------------------------------------------------------
function parseArgs(argv) {
  const args = {
    bbox: null,
    res: "0.01",
    out: path.join("output", "blue_marble_clip.tif"),
    layer: "BlueMarble_ShadedRelief_Bathymetry",
    checkOnly: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    switch (arg) {
      case "--bbox":
        args.bbox = argv[++i];
        break;
      case "--res":
        args.res = argv[++i];
        break;
      case "--out":
        args.out = argv[++i];
        break;
      case "--layer":
        args.layer = argv[++i];
        break;
      case "--check-only":
        args.checkOnly = true;
        break;
      case "--help":
      case "-h":
        printUsageAndExit(0);
        break;
      default:
        console.error(`Unknown argument: ${arg}`);
        printUsageAndExit(1);
    }
  }

  return args;
}

function printUsageAndExit(code) {
  console.log(`
Usage:
  mmap bluemarble --bbox area.geojson [--res 0.01] [--out clip.tif] [--layer BlueMarble_ShadedRelief_Bathymetry]

Options:
  --bbox <path>     Path to a GeoJSON file defining the area of interest. Required.
  --res <number>    Output resolution in degrees/pixel. Default: 0.01
  --out <path>      Output GeoTIFF path. Default: output/blue_marble_clip.tif
  --layer <name>    GIBS WMTS layer name. Default: BlueMarble_ShadedRelief_Bathymetry
  --check-only      Print the parsed bounding box and exit without running gdalwarp.
`);
  process.exit(code);
}

// ------------------------------------------------------------
// GeoJSON bbox extraction
// ------------------------------------------------------------
// Recursively walks nested coordinate arrays (works for Point,
// Polygon, MultiPolygon, etc.) and tracks min/max x/y.
function walkCoords(node, bounds) {
  if (!node || node.length === 0) return;
  if (typeof node[0] === 'number') {
    const [x, y] = node;
    if (x < bounds.xmin) bounds.xmin = x;
    if (y < bounds.ymin) bounds.ymin = y;
    if (x > bounds.xmax) bounds.xmax = x;
    if (y > bounds.ymax) bounds.ymax = y;
  } else {
    for (const child of node) walkCoords(child, bounds);
  }
}

// Yields geometry objects out of a Feature, FeatureCollection,
// GeometryCollection, or bare geometry.
function* extractGeometries(obj) {
  const gtype = obj.type;
  if (gtype === "FeatureCollection") {
    for (const feature of obj.features || []) yield* extractGeometries(feature);
  } else if (gtype === "Feature") {
    if (obj.geometry) yield* extractGeometries(obj.geometry);
  } else if (gtype === "GeometryCollection") {
    for (const geom of obj.geometries || []) yield* extractGeometries(geom);
  } else {
    yield obj;
  }
}

function getBboxFromGeojson(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const data = JSON.parse(raw);

  // Trust an explicit top-level bbox if present - cheaper than
  // walking every coordinate.
  if (Array.isArray(data.bbox) && data.bbox.length >= 4) {
    const [xmin, ymin, xmax, ymax] = data.bbox;
    return { xmin, ymin, xmax, ymax };
  }

  const bounds = { xmin: Infinity, ymin: Infinity, xmax: -Infinity, ymax: -Infinity };
  for (const geom of extractGeometries(data)) {
    if (geom.coordinates) walkCoords(geom.coordinates, bounds);
  }

  if (!isFinite(bounds.xmin)) {
    throw new Error(`No coordinates found in ${filePath}`);
  }

  return bounds;
}

function normalizeBounds(bounds) {
  let { xmin, ymin, xmax, ymax } = bounds;

  if ([xmin, ymin, xmax, ymax].some((v) => !Number.isFinite(v))) {
    throw new Error("Parsed bbox contains non-finite values");
  }

  if (xmin > xmax) {
    [xmin, xmax] = [xmax, xmin];
  }
  if (ymin > ymax) {
    [ymin, ymax] = [ymax, ymin];
  }

  // Blue Marble WMS here is EPSG:4326. Large values usually mean projected meters.
  if (xmin < -180 || xmax > 180 || ymin < -90 || ymax > 90) {
    throw new Error(
      "BBox is outside lon/lat bounds for EPSG:4326. Ensure your GeoJSON coordinates are in EPSG:4326.",
    );
  }

  return { xmin, ymin, xmax, ymax };
}

// ------------------------------------------------------------
// GDAL checks + invocation
// ------------------------------------------------------------
function checkGdal() {
  const check = spawnSync("gdalwarp", ["--version"], { encoding: "utf8" });
  if (check.error || check.status !== 0) {
    console.error("gdalwarp not found - install GDAL first.");
    process.exit(1);
  }

  const formats = spawnSync("gdalinfo", ["--formats"], { encoding: "utf8" });
  if (formats.error || !/wmts/i.test(formats.stdout || "")) {
    console.error("GDAL appears to be missing WMTS driver support.");
    process.exit(1);
  }
}

function runGdalwarp({ xmin, ymin, xmax, ymax, res, out, layer }) {
  fs.mkdirSync(path.dirname(out), { recursive: true });

  const wmtsSource = `WMTS:${WMTS_CAPABILITIES},layer=${layer}`;

  const gdalArgs = [
    "-te", xmin, ymin, xmax, ymax,
    "-tr", res, res,
    "-t_srs", SRS,
    "-r", "bilinear",
    "-dstalpha",
    "-of", "GTiff",
    "-co", "COMPRESS=DEFLATE",
    "-overwrite",
    wmtsSource,
    out,
  ].map(String);

  console.log(`Clipping ${layer} to [${xmin}, ${ymin}, ${xmax}, ${ymax}] at ${res} deg/px`);
  console.log(`Running: gdalwarp ${gdalArgs.join(' ')}`);

  const result = spawnSync("gdalwarp", gdalArgs, { stdio: "inherit" });

  if (result.error) {
    console.error("Failed to run gdalwarp:", result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) {
    console.error(`gdalwarp exited with status ${result.status}`);
    process.exit(result.status);
  }

  console.log(`Saved: ${out}`);
}

export function execute(args) {
  const parsed = parseArgs(args);

  if (!parsed.bbox) {
    console.error("Error: --bbox is required.\n");
    printUsageAndExit(1);
  }

  let bounds;
  try {
    bounds = normalizeBounds(getBboxFromGeojson(parsed.bbox));
  } catch (err) {
    console.error(`Failed to parse bounding box from ${parsed.bbox}: ${err.message}`);
    process.exit(1);
  }

  console.log(`Input:  ${parsed.bbox}`);
  console.log(`Bounds: xmin=${bounds.xmin} ymin=${bounds.ymin} xmax=${bounds.xmax} ymax=${bounds.ymax}`);

  if (parsed.checkOnly) {
    return;
  }

  checkGdal();

  runGdalwarp({
    xmin: bounds.xmin,
    ymin: bounds.ymin,
    xmax: bounds.xmax,
    ymax: bounds.ymax,
    res: parsed.res,
    out: parsed.out,
    layer: parsed.layer,
  });
}
