import fs from "fs";
import osmtogeojson from "osmtogeojson";
import path from "path";

export const meta = {
  usage: "overpass <bbox.geojson> [allroads|highway|water]",
  description: "Download a named Overpass query within a GeoJSON bounding box",
};

const OVERPASS_API_URL = "https://overpass-api.de/api/interpreter";
const OUTPUT_DIR = "overpass";
const OUTPUT_FILE = "highways.geojson";
const QUERY_PRESETS = {
  allroads: {
    description: "all roads",
    selector: 'way["highway"]',
  },
  highway: {
    description: "motorways and primary, secondary, and tertiary roads",
    selector: 'way["highway"~"^(primary|secondary|tertiary|motorway|motorway_link|trunk_link|primary_link|secondary_link|tertiary_link)$"]',
  },
  water: {
    description: "all water-tagged OpenStreetMap features",
    selector: 'nwr["water"]',
  },
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

function walkGeoJson(data, bounds) {
  if (data.type === "FeatureCollection") {
    for (const feature of data.features || []) walkGeoJson(feature, bounds);
    return;
  }

  if (data.type === "Feature") {
    if (data.geometry) walkGeoJson(data.geometry, bounds);
    return;
  }

  if (data.type === "GeometryCollection") {
    for (const geometry of data.geometries || []) walkGeoJson(geometry, bounds);
    return;
  }

  walkCoords(data.coordinates, bounds);
}

function getBounds(data) {
  if (Array.isArray(data.bbox) && data.bbox.length >= 4) {
    const [west, south, east, north] = data.bbox;
    return { west, south, east, north };
  }

  const bounds = { west: Infinity, south: Infinity, east: -Infinity, north: -Infinity };
  walkGeoJson(data, bounds);

  if (!Number.isFinite(bounds.west)) {
    throw new Error("GeoJSON file does not contain a bounding box or coordinates");
  }

  return bounds;
}

function validateBounds(bounds) {
  const { west, south, east, north } = bounds;

  if (![west, south, east, north].every(Number.isFinite)) {
    throw new Error("Bounding box contains non-numeric values");
  }

  if (west < -180 || east > 180 || south < -90 || north > 90) {
    throw new Error("Bounding box must use WGS84 longitude/latitude coordinates");
  }

  if (west >= east || south >= north) {
    throw new Error("Bounding box must have west < east and south < north");
  }
}

function makeQuery({ west, south, east, north }, preset) {
  const bbox = `${south},${west},${north},${east}`;
  return `[out:json][timeout:180];${preset.selector}(${bbox});out body geom;`;
}

export async function execute(args, { dryRun = false } = {}) {
  const [input, presetName = "allroads"] = args;

  if (!input || args.length > 2) {
    throw new Error(`Usage: mm ${meta.usage}`);
  }

  const preset = QUERY_PRESETS[presetName];
  if (!preset) {
    throw new Error(`Unknown query preset: ${presetName}. Choose from: ${Object.keys(QUERY_PRESETS).join(", ")}`);
  }

  const data = JSON.parse(fs.readFileSync(input, "utf8"));
  const bounds = getBounds(data);
  validateBounds(bounds);

  const outputPath = path.join(OUTPUT_DIR, OUTPUT_FILE);
  const query = makeQuery(bounds, preset);

  console.log(`Querying ${preset.description} in [${bounds.west}, ${bounds.south}, ${bounds.east}, ${bounds.north}]`);
  console.log(`Output: ${outputPath}`);

  if (dryRun) {
    console.log(`\n→ POST ${OVERPASS_API_URL}\n${query}\n`);
    return;
  }

  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  const response = await fetch(OVERPASS_API_URL, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8",
      "User-Agent": "mmap/0.1 (https://github.com/moriartyd/mmap)",
    },
    body: new URLSearchParams({ data: query }),
  });

  if (!response.ok) {
    const details = await response.text();
    throw new Error(`Overpass API request failed (${response.status}): ${details.slice(0, 500)}`);
  }

  const geojson = osmtogeojson(await response.json());
  fs.writeFileSync(outputPath, `${JSON.stringify(geojson, null, 2)}\n`);
  console.log(`Saved: ${outputPath}`);
}
