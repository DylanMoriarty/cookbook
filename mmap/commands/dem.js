import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";
import { gunzipSync } from "zlib";

export const meta = {
  usage: "dem <bbox.geojson> [--source srtm|terrarium] [--res meters] [--out dem/elevation.tif]",
  description: "Download, merge, and clip SRTM or Terrarium elevation data to a GeoTIFF",
};

const SRTM_TILE_URL = "https://s3.amazonaws.com/elevation-tiles-prod/skadi";
const TERRARIUM_TILE_URL = "https://s3.amazonaws.com/elevation-tiles-prod/terrarium";
const ARC_SECOND_DEGREES = 1 / 3600;
const SRTM_RESOLUTION_METERS = 30;
const TERRARIUM_MAX_ZOOM = 15;
const WEB_MERCATOR_TILE_SIZE = 256;
const WEB_MERCATOR_HALF_WORLD = 20037508.342789244;
const WEB_MERCATOR_WORLD_METERS = WEB_MERCATOR_HALF_WORLD * 2;
const WEB_MERCATOR_MAX_LATITUDE = 85.05112878;
const METERS_PER_DEGREE = 111320;
const BYTES_PER_PIXEL = 2;
const WARNING_BYTES = 1 * 1024 ** 3;
const MAX_BYTES = 10 * 1024 ** 3;

function walkCoords(node, bounds) {
  if (!Array.isArray(node) || node.length === 0) return;
  if (typeof node[0] === "number") {
    const [longitude, latitude] = node;
    bounds.west = Math.min(bounds.west, longitude);
    bounds.south = Math.min(bounds.south, latitude);
    bounds.east = Math.max(bounds.east, longitude);
    bounds.north = Math.max(bounds.north, latitude);
    return;
  }
  for (const child of node) walkCoords(child, bounds);
}

function walkGeoJson(data, bounds) {
  if (data.type === "FeatureCollection") {
    for (const feature of data.features || []) walkGeoJson(feature, bounds);
  } else if (data.type === "Feature" && data.geometry) {
    walkGeoJson(data.geometry, bounds);
  } else if (data.type === "GeometryCollection") {
    for (const geometry of data.geometries || []) walkGeoJson(geometry, bounds);
  } else {
    walkCoords(data.coordinates, bounds);
  }
}

function getBounds(data) {
  if (Array.isArray(data.bbox) && data.bbox.length >= 4) {
    const [west, south, east, north] = data.bbox;
    return { west, south, east, north };
  }

  const bounds = { west: Infinity, south: Infinity, east: -Infinity, north: -Infinity };
  walkGeoJson(data, bounds);
  if (!Number.isFinite(bounds.west)) throw new Error("GeoJSON file does not contain a bounding box or coordinates");
  return bounds;
}

function validateBounds({ west, south, east, north }, source) {
  if (![west, south, east, north].every(Number.isFinite)) {
    throw new Error("Bounding box contains non-numeric values");
  }
  if (west < -180 || east > 180) {
    throw new Error("Bounding box longitude must be between -180 and 180 degrees");
  }
  if (source === "srtm" && (south < -60 || north > 60)) {
    throw new Error("SRTM 1 arc-second coverage is limited to WGS84 coordinates between 60 degrees south and north");
  }
  if (source === "terrarium" && (south < -WEB_MERCATOR_MAX_LATITUDE || north > WEB_MERCATOR_MAX_LATITUDE)) {
    throw new Error(`Terrarium coverage is limited to Web Mercator latitudes between ${WEB_MERCATOR_MAX_LATITUDE} degrees south and north`);
  }
  if (west >= east || south >= north) {
    throw new Error("Bounding box must have west < east and south < north; areas crossing the antimeridian are not supported");
  }
}

function parseArgs(args) {
  const [input, ...options] = args;
  let output = path.join("dem", "elevation.tif");
  let source = "srtm";
  let resolutionMeters = null;

  for (let index = 0; index < options.length; index += 1) {
    if (options[index] === "--out" && options[index + 1]) {
      output = options[index + 1];
      index += 1;
    } else if (options[index] === "--source" && options[index + 1]) {
      source = options[index + 1].toLowerCase();
      if (!["srtm", "terrarium"].includes(source)) throw new Error(`Usage: mm ${meta.usage}`);
      index += 1;
    } else if (options[index] === "--res" && options[index + 1]) {
      resolutionMeters = parseResolutionMeters(options[index + 1]);
      index += 1;
    } else {
      throw new Error(`Usage: mm ${meta.usage}`);
    }
  }

  if (!input) throw new Error(`Usage: mm ${meta.usage}`);
  return { input, output, source, resolutionMeters };
}

function parseResolutionMeters(value) {
  const match = String(value).trim().toLowerCase().match(/^(\d+(?:\.\d+)?)m?$/);
  if (!match) throw new Error("Resolution must be a positive number of meters, for example: --res 90");

  const resolutionMeters = Number(match[1]);
  if (!Number.isFinite(resolutionMeters) || resolutionMeters <= 0) {
    throw new Error("Resolution must be greater than zero meters");
  }
  return resolutionMeters;
}

function getTerrariumResolutionMeters(zoom) {
  return WEB_MERCATOR_WORLD_METERS / WEB_MERCATOR_TILE_SIZE / 2 ** zoom;
}

function getOutputResolutionDegrees(source, resolutionMeters) {
  if (resolutionMeters) return resolutionMeters / METERS_PER_DEGREE;
  if (source === "srtm") return ARC_SECOND_DEGREES;
  return getTerrariumResolutionMeters(TERRARIUM_MAX_ZOOM) / METERS_PER_DEGREE;
}

function estimateSize(bounds, resolutionDegrees) {
  const width = Math.ceil((bounds.east - bounds.west) / resolutionDegrees);
  const height = Math.ceil((bounds.north - bounds.south) / resolutionDegrees);
  return { width, height, bytes: width * height * BYTES_PER_PIXEL };
}

function formatBytes(bytes) {
  return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
}

function getBlendOutputPath(output) {
  const extension = path.extname(output);
  if (!extension) return `${output}_blend`;
  return `${output.slice(0, -extension.length)}_blend${extension}`;
}

function getTileNames(bounds) {
  const names = [];
  for (let latitude = Math.floor(bounds.south); latitude < Math.ceil(bounds.north); latitude += 1) {
    for (let longitude = Math.floor(bounds.west); longitude < Math.ceil(bounds.east); longitude += 1) {
      const latitudePart = `${latitude >= 0 ? "N" : "S"}${String(Math.abs(latitude)).padStart(2, "0")}`;
      const longitudePart = `${longitude >= 0 ? "E" : "W"}${String(Math.abs(longitude)).padStart(3, "0")}`;
      names.push(`${latitudePart}/${latitudePart}${longitudePart}.hgt`);
    }
  }
  return names;
}

function getTerrariumZoom(resolutionMeters) {
  if (!resolutionMeters) return TERRARIUM_MAX_ZOOM;
  for (let zoom = 0; zoom <= TERRARIUM_MAX_ZOOM; zoom += 1) {
    if (getTerrariumResolutionMeters(zoom) <= resolutionMeters) return zoom;
  }
  return TERRARIUM_MAX_ZOOM;
}

function longitudeToTileX(longitude, zoom) {
  return Math.floor(((longitude + 180) / 360) * 2 ** zoom);
}

function latitudeToTileY(latitude, zoom) {
  const radians = latitude * Math.PI / 180;
  return Math.floor((1 - Math.log(Math.tan(radians) + 1 / Math.cos(radians)) / Math.PI) / 2 * 2 ** zoom);
}

function clampTileIndex(value, zoom) {
  return Math.max(0, Math.min(2 ** zoom - 1, value));
}

function getTerrariumTiles(bounds, zoom) {
  const minX = clampTileIndex(longitudeToTileX(bounds.west, zoom), zoom);
  const maxX = clampTileIndex(longitudeToTileX(bounds.east, zoom), zoom);
  const minY = clampTileIndex(latitudeToTileY(bounds.north, zoom), zoom);
  const maxY = clampTileIndex(latitudeToTileY(bounds.south, zoom), zoom);
  const tiles = [];

  for (let x = minX; x <= maxX; x += 1) {
    for (let y = minY; y <= maxY; y += 1) {
      tiles.push({ x, y, zoom, name: `${zoom}-${x}-${y}.png` });
    }
  }
  return tiles;
}

function getTerrariumTileBounds({ x, y, zoom }) {
  const tileMeters = WEB_MERCATOR_WORLD_METERS / 2 ** zoom;
  const minX = -WEB_MERCATOR_HALF_WORLD + x * tileMeters;
  const maxX = minX + tileMeters;
  const maxY = WEB_MERCATOR_HALF_WORLD - y * tileMeters;
  const minY = maxY - tileMeters;
  return { minX, minY, maxX, maxY };
}

function createProgressBar(label, total) {
  const width = 28;

  return {
    update(completed, currentItem) {
      const ratio = total === 0 ? 1 : completed / total;
      const filled = Math.round(width * ratio);
      const bar = `${"#".repeat(filled)}${"-".repeat(width - filled)}`;
      const percent = String(Math.round(ratio * 100)).padStart(3, " ");
      process.stdout.write(`\r${label} [${bar}] ${completed}/${total} ${percent}% ${currentItem}`);
    },
    finish() {
      process.stdout.write("\n");
    },
  };
}

async function downloadTiles(tileNames, tileDir) {
  fs.mkdirSync(tileDir, { recursive: true });
  const progress = createProgressBar("Downloading SRTM", tileNames.length);

  for (let index = 0; index < tileNames.length; index += 1) {
    const tileName = tileNames[index];
    const tilePath = path.join(tileDir, path.basename(tileName));
    const response = await fetch(`${SRTM_TILE_URL}/${tileName}.gz`);
    if (!response.ok) throw new Error(`Failed to download SRTM tile ${tileName} (${response.status})`);
    fs.writeFileSync(tilePath, gunzipSync(Buffer.from(await response.arrayBuffer())));
    progress.update(index + 1, tileName);
  }
  progress.finish();
}

async function downloadTerrariumTiles(tiles, tileDir) {
  fs.mkdirSync(tileDir, { recursive: true });
  const progress = createProgressBar("Downloading Terrarium", tiles.length);

  for (let index = 0; index < tiles.length; index += 1) {
    const tile = tiles[index];
    const tilePath = path.join(tileDir, tile.name);
    const response = await fetch(`${TERRARIUM_TILE_URL}/${tile.zoom}/${tile.x}/${tile.y}.png`);
    if (!response.ok) throw new Error(`Failed to download Terrarium tile ${tile.zoom}/${tile.x}/${tile.y} (${response.status})`);
    fs.writeFileSync(tilePath, Buffer.from(await response.arrayBuffer()));
    progress.update(index + 1, `${tile.zoom}/${tile.x}/${tile.y}.png`);
  }
  progress.finish();
}

function runCommand(command, args) {
  const result = spawnSync(command, args.map(String), { stdio: "inherit" });
  if (result.error) throw new Error(`Failed to run ${command}: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`${command} exited with status ${result.status}`);
}

function runSrtmGdal(bounds, tilePaths, output, resolutionDegrees) {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  const args = [
    "-te", bounds.west, bounds.south, bounds.east, bounds.north,
    "-tr", resolutionDegrees, resolutionDegrees,
    "-tap",
    "-t_srs", "EPSG:4326",
    "-r", "bilinear",
    "-of", "GTiff",
    "-co", "COMPRESS=DEFLATE",
    "-co", "PREDICTOR=2",
    "-co", "TILED=YES",
    "-co", "BIGTIFF=IF_SAFER",
    "-overwrite",
    ...tilePaths,
    output,
  ];

  runCommand("gdalwarp", args);
}

function runTerrariumGdal(bounds, tiles, tileDir, output, blendOutput, resolutionDegrees) {
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.mkdirSync(path.dirname(blendOutput), { recursive: true });
  const tileVrtPaths = [];

  for (const tile of tiles) {
    const tilePath = path.join(tileDir, tile.name);
    const tileVrtPath = path.join(tileDir, `${path.basename(tile.name, ".png")}.vrt`);
    const tileBounds = getTerrariumTileBounds(tile);
    runCommand("gdal_translate", [
      "-of", "VRT",
      "-a_srs", "EPSG:3857",
      "-a_ullr", tileBounds.minX, tileBounds.maxY, tileBounds.maxX, tileBounds.minY,
      tilePath,
      tileVrtPath,
    ]);
    tileVrtPaths.push(tileVrtPath);
  }

  const rgbVrtPath = path.join(tileDir, "terrarium-rgb.vrt");
  const elevationPath = path.join(tileDir, "terrarium-elevation.tif");
  runCommand("gdalbuildvrt", [rgbVrtPath, ...tileVrtPaths]);
  runCommand("gdal_calc.py", [
    "-A", rgbVrtPath,
    "--A_band", 1,
    "-B", rgbVrtPath,
    "--B_band", 2,
    "-C", rgbVrtPath,
    "--C_band", 3,
    "--calc", "A.astype('float32')*256+B.astype('float32')+C.astype('float32')/256-32768",
    "--outfile", elevationPath,
    "--type", "Float32",
    "--NoDataValue", -32768,
    "--overwrite",
  ]);
  runCommand("gdalwarp", [
    "-te_srs", "EPSG:4326",
    "-te", bounds.west, bounds.south, bounds.east, bounds.north,
    "-tr", resolutionDegrees, resolutionDegrees,
    "-tap",
    "-t_srs", "EPSG:4326",
    "-r", "bilinear",
    "-of", "GTiff",
    "-co", "COMPRESS=DEFLATE",
    "-co", "PREDICTOR=2",
    "-co", "TILED=YES",
    "-co", "BIGTIFF=IF_SAFER",
    "-overwrite",
    elevationPath,
    output,
  ]);
  runCommand("gdal_translate", [
    "-of", "GTiff",
    "-ot", "Float32",
    "-b", 1,
    "-co", "COMPRESS=DEFLATE",
    "-co", "PREDICTOR=2",
    "-co", "TILED=YES",
    output,
    blendOutput,
  ]);
}

export async function execute(args, { dryRun = false } = {}) {
  const { input, output, source, resolutionMeters } = parseArgs(args);
  const bounds = getBounds(JSON.parse(fs.readFileSync(input, "utf8")));
  validateBounds(bounds, source);

  const resolutionDegrees = getOutputResolutionDegrees(source, resolutionMeters);
  const estimate = estimateSize(bounds, resolutionDegrees);
  console.log(`Estimated uncompressed output: ${formatBytes(estimate.bytes)} (${estimate.width} x ${estimate.height} pixels)`);
  if (estimate.bytes >= MAX_BYTES) {
    throw new Error(`Estimated output exceeds the 10 GB limit. Reduce the bounding box before downloading.`);
  }
  if (estimate.bytes >= WARNING_BYTES) console.warn("Warning: estimated output is at least 1 GB.");

  const tileDir = path.join(path.dirname(output), `.${source}-tiles`);
  console.log(`Source: ${source === "srtm" ? "SRTM 1 arc-second" : "Terrarium"}`);
  console.log(`Output resolution: ${resolutionMeters || (source === "srtm" ? SRTM_RESOLUTION_METERS : getTerrariumResolutionMeters(TERRARIUM_MAX_ZOOM).toFixed(1))} m`);
  console.log(`Output: ${output}`);

  if (source === "srtm") {
    const tileNames = getTileNames(bounds);
    const tilePaths = tileNames.map((tileName) => path.join(tileDir, path.basename(tileName)));
    console.log(`Tiles: ${tileNames.length}`);

    if (dryRun) {
      console.log(`\n→ download ${tileNames.join(", ")} from ${SRTM_TILE_URL}`);
      console.log(`→ gdalwarp -tr ${resolutionDegrees} ${resolutionDegrees} ${tilePaths.join(" ")} ${output}\n`);
      return;
    }

    try {
      await downloadTiles(tileNames, tileDir);
      runSrtmGdal(bounds, tilePaths, output, resolutionDegrees);
    } finally {
      fs.rmSync(tileDir, { recursive: true, force: true });
    }
    console.log(`Saved: ${output}`);
    return;
  }

  const zoom = getTerrariumZoom(resolutionMeters);
  const tiles = getTerrariumTiles(bounds, zoom);
  const blendOutput = getBlendOutputPath(output);
  console.log(`Terrarium zoom: ${zoom} (${getTerrariumResolutionMeters(zoom).toFixed(1)} m source pixels)`);
  console.log(`Tiles: ${tiles.length}`);
  console.log(`Blender heightmap: ${blendOutput}`);

  if (dryRun) {
    const tileList = tiles.slice(0, 20).map((tile) => `${tile.zoom}/${tile.x}/${tile.y}.png`).join(", ");
    const suffix = tiles.length > 20 ? `, ... ${tiles.length - 20} more` : "";
    console.log(`\n→ download ${tileList}${suffix} from ${TERRARIUM_TILE_URL}`);
    console.log("→ gdal_translate georeference PNG tiles");
    console.log("→ gdalbuildvrt + gdal_calc.py Terrarium RGB elevation decode");
    console.log(`→ gdalwarp -tr ${resolutionDegrees} ${resolutionDegrees} terrarium-elevation.tif ${output}\n`);
    console.log(`→ gdal_translate -ot Float32 -b 1 ${output} ${blendOutput}\n`);
    return;
  }

  try {
    await downloadTerrariumTiles(tiles, tileDir);
    runTerrariumGdal(bounds, tiles, tileDir, output, blendOutput, resolutionDegrees);
  } finally {
    fs.rmSync(tileDir, { recursive: true, force: true });
  }
  console.log(`Saved: ${output}`);
  console.log(`Saved: ${blendOutput}`);
}
