import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";

export const meta = {
  usage: "biomass <bbox.geojson> [--layer aboveground|belowground|aboveground-uncertainty|belowground-uncertainty] [--res meters] [--out biomass/aboveground_2010.tif]",
  description: "Clip 300 m global 2010 biomass carbon density to a GeoTIFF",
};

const HGB_BASE_URL = "https://cpdataeuwest.blob.core.windows.net/cpdata/raw/2010-harmonized-biomass/global/300m";
const PLANETARY_COMPUTER_SIGN_URL = "https://planetarycomputer.microsoft.com/api/sas/v1/sign";
const HGB_LATITUDE_LIMITS = { south: -61.002778, north: 84 };
const NATIVE_RESOLUTION_DEGREES = 1 / 360;
const METERS_PER_DEGREE = 111320;
const LAYERS = {
  aboveground: "aboveground.tif",
  belowground: "belowground.tif",
  "aboveground-uncertainty": "aboveground_uncertainty.tif",
  "belowground-uncertainty": "belowground_uncertainty.tif",
};

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

function getBounds(data) {
  if (Array.isArray(data.bbox) && data.bbox.length >= 4) {
    const [west, south, east, north] = data.bbox;
    return { west, south, east, north };
  }

  const bounds = { west: Infinity, south: Infinity, east: -Infinity, north: -Infinity };
  if (data.type === "FeatureCollection") {
    for (const feature of data.features || []) walkCoords(feature.geometry?.coordinates, bounds);
  } else if (data.type === "Feature") {
    walkCoords(data.geometry?.coordinates, bounds);
  } else {
    walkCoords(data.coordinates, bounds);
  }
  if (!Number.isFinite(bounds.west)) throw new Error("GeoJSON file does not contain a bounding box or coordinates");
  return bounds;
}

function validateBounds({ west, south, east, north }) {
  if (![west, south, east, north].every(Number.isFinite)) throw new Error("Bounding box contains non-numeric values");
  if (west < -180 || east > 180 || south < HGB_LATITUDE_LIMITS.south || north > HGB_LATITUDE_LIMITS.north) {
    throw new Error(`Harmonized Global Biomass coverage is limited to ${HGB_LATITUDE_LIMITS.south} to ${HGB_LATITUDE_LIMITS.north} degrees latitude`);
  }
  if (west >= east || south >= north) {
    throw new Error("Bounding box must have west < east and south < north; areas crossing the antimeridian are not supported");
  }
}

function parseResolutionMeters(value) {
  const match = String(value).trim().toLowerCase().match(/^(\d+(?:\.\d+)?)m?$/);
  if (!match || Number(match[1]) <= 0) throw new Error("Resolution must be a positive number of meters, for example: --res 1000");
  return Number(match[1]);
}

function parseArgs(args) {
  const [input, ...options] = args;
  let layer = "aboveground";
  let output = path.join("biomass", "aboveground_2010.tif");
  let resolutionMeters = null;

  for (let index = 0; index < options.length; index += 1) {
    if (options[index] === "--layer" && options[index + 1]) {
      layer = options[index + 1].toLowerCase();
      if (!LAYERS[layer]) throw new Error(`Usage: mm ${meta.usage}`);
      index += 1;
    } else if (options[index] === "--res" && options[index + 1]) {
      resolutionMeters = parseResolutionMeters(options[index + 1]);
      index += 1;
    } else if (options[index] === "--out" && options[index + 1]) {
      output = options[index + 1];
      index += 1;
    } else {
      throw new Error(`Usage: mm ${meta.usage}`);
    }
  }

  if (!input) throw new Error(`Usage: mm ${meta.usage}`);
  return { input, layer, output, resolutionMeters };
}

function runGdal(args) {
  const result = spawnSync("gdalwarp", args.map(String), { stdio: "inherit" });
  if (result.error) throw new Error(`Failed to run gdalwarp: ${result.error.message}`);
  if (result.status !== 0) throw new Error(`gdalwarp exited with status ${result.status}`);
}

async function getSignedUrl(url) {
  const response = await fetch(`${PLANETARY_COMPUTER_SIGN_URL}?href=${encodeURIComponent(url)}`);
  if (!response.ok) throw new Error(`Failed to authorize biomass dataset access (${response.status})`);

  const data = await response.json();
  if (typeof data.href !== "string") throw new Error("Planetary Computer did not return a signed biomass dataset URL");
  return data.href;
}

export async function execute(args, { dryRun = false } = {}) {
  const { input, layer, output, resolutionMeters } = parseArgs(args);
  const bounds = getBounds(JSON.parse(fs.readFileSync(input, "utf8")));
  validateBounds(bounds);

  const resolutionDegrees = resolutionMeters ? resolutionMeters / METERS_PER_DEGREE : NATIVE_RESOLUTION_DEGREES;
  const sourceUrl = `${HGB_BASE_URL}/${LAYERS[layer]}`;
  const source = `/vsicurl/${dryRun ? sourceUrl : await getSignedUrl(sourceUrl)}`;
  const gdalArgs = [
    "-te", bounds.west, bounds.south, bounds.east, bounds.north,
    "-tr", resolutionDegrees, resolutionDegrees,
    "-tap",
    "-t_srs", "EPSG:4326",
    "-r", "average",
    "-of", "GTiff",
    "-co", "COMPRESS=DEFLATE",
    "-co", "PREDICTOR=2",
    "-co", "TILED=YES",
    "-co", "BIGTIFF=IF_SAFER",
    "-overwrite",
    source,
    output,
  ];

  console.log("Dataset: Harmonized Global Biomass (2010, 300 m)");
  console.log(`Layer: ${layer}`);
  console.log(`Output resolution: ${resolutionMeters || "native (~300)"} m`);
  console.log(`Output: ${output}`);
  if (dryRun) {
    console.log(`\n→ gdalwarp ${gdalArgs.join(" ")}\n`);
    return;
  }

  fs.mkdirSync(path.dirname(output), { recursive: true });
  runGdal(gdalArgs);
  console.log(`Saved: ${output}`);
}