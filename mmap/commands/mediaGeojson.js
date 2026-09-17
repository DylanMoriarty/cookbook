import { spawnSync } from "child_process";
import fs from "fs";
import path from "path";

export const meta = {
  usage: "mediaGeojson <media-folder> [--out media-locations.geojson] [--timestamps-out media-timestamps.json]",
  description: "Export GPS locations from MOV, MP4, HEIC, and JPG files as GeoJSON points",
};

function parseArgs(args) {
  const [input, ...options] = args;
  let output = "media-locations.geojson";
  let timestampsOutput = "media-timestamps.json";

  for (let index = 0; index < options.length; index += 1) {
    if (options[index] === "--out" && options[index + 1]) {
      output = options[index + 1];
      index += 1;
    } else if (options[index] === "--timestamps-out" && options[index + 1]) {
      timestampsOutput = options[index + 1];
      index += 1;
    } else {
      throw new Error(`Usage: mm ${meta.usage}`);
    }
  }

  if (!input) throw new Error(`Usage: mm ${meta.usage}`);
  return { input, output, timestampsOutput };
}

function checkExifTool() {
  const result = spawnSync("exiftool", ["-ver"], { encoding: "utf8" });
  if (result.error || result.status !== 0) {
    throw new Error("ExifTool is required. Install it with: brew install exiftool");
  }
}

function parseQuickTimeCoordinates(value) {
  if (typeof value !== "string") return null;
  const match = value.match(/^([+-]\d+(?:\.\d+)?)([+-]\d+(?:\.\d+)?)/);
  if (!match) return null;
  return { latitude: Number(match[1]), longitude: Number(match[2]) };
}

function getCoordinates(metadata) {
  const latitude = Number(metadata.GPSLatitude);
  const longitude = Number(metadata.GPSLongitude);
  if (Number.isFinite(latitude) && Number.isFinite(longitude)) return { latitude, longitude };
  return parseQuickTimeCoordinates(metadata.GPSCoordinates);
}

function getCreatedAt(metadata) {
  return metadata.DateTimeOriginal || metadata.CreateDate || null;
}

function getSourceFile(metadata, input) {
  return path.relative(input, metadata.SourceFile) || path.basename(metadata.SourceFile);
}

function makeFeature(metadata, input) {
  const coordinates = getCoordinates(metadata);
  if (!coordinates) return null;

  const properties = {
    file: getSourceFile(metadata, input),
    mediaType: path.extname(metadata.SourceFile).slice(1).toLowerCase(),
  };

  const createdAt = getCreatedAt(metadata);
  if (createdAt) properties.capturedAt = createdAt;

  return {
    type: "Feature",
    properties,
    geometry: {
      type: "Point",
      coordinates: [coordinates.longitude, coordinates.latitude],
    },
  };
}

function makeTimestampEntry(metadata, input) {
  return {
    file: getSourceFile(metadata, input),
    mediaType: path.extname(metadata.SourceFile).slice(1).toLowerCase(),
    createdAt: getCreatedAt(metadata),
  };
}

function readMetadata(input) {
  const result = spawnSync("exiftool", [
    "-j",
    "-n",
    "-r",
    "-ext", "mov",
    "-ext", "mp4",
    "-ext", "heic",
    "-ext", "jpg",
    "-ext", "jpeg",
    "-GPSLatitude",
    "-GPSLongitude",
    "-GPSCoordinates",
    "-DateTimeOriginal",
    "-CreateDate",
    input,
  ], { encoding: "utf8", maxBuffer: 50 * 1024 * 1024 });

  if (result.error) throw new Error(`Failed to run ExifTool: ${result.error.message}`);
  if (result.status !== 0) throw new Error(result.stderr.trim() || `ExifTool exited with status ${result.status}`);
  return JSON.parse(result.stdout);
}

export function execute(args, { dryRun = false } = {}) {
  const { input, output, timestampsOutput } = parseArgs(args);
  if (!fs.statSync(input).isDirectory()) throw new Error(`Not a directory: ${input}`);

  checkExifTool();
  const metadata = readMetadata(input);
  const features = metadata
    .map((metadata) => makeFeature(metadata, input))
    .filter(Boolean);
  const geojson = { type: "FeatureCollection", features };
  const timestamps = metadata.map((metadata) => makeTimestampEntry(metadata, input));

  console.log(`Found ${features.length} geotagged MOV, MP4, HEIC, or JPG file${features.length === 1 ? "" : "s"}.`);
  console.log(`Output: ${output}`);
  console.log(`Timestamps: ${timestampsOutput}`);
  if (dryRun) return;

  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, `${JSON.stringify(geojson, null, 2)}\n`);
  console.log(`Saved: ${output}`);
  fs.mkdirSync(path.dirname(timestampsOutput), { recursive: true });
  fs.writeFileSync(timestampsOutput, `${JSON.stringify(timestamps, null, 2)}\n`);
  console.log(`Saved: ${timestampsOutput}`);
}