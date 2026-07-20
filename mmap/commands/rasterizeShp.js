/**
 * rasterizeShp — burn a shapefile into a GeoTIFF
 *
 * Usage: mm rasterizeShp <input.shp> <output.tif> <resolution> [--color <name|#RRGGBB|R,G,B>]
 *
 * Wraps:
 *   gdal_rasterize -burn 1 -init 0 -a_nodata 0 -ot Byte -of GTiff
 *                  -tr <res> <res> -tap -co COMPRESS=LZW -co TILED=YES
 *                  <input> <output>
 */
import { run } from "../lib/run.js";

export const meta = {
  usage: "rasterizeShp <input.shp> <output.tif> <resolution> [--color <name|#RRGGBB|R,G,B>]",
  description: "Rasterize a shapefile to a compressed GeoTIFF at a given resolution (optionally colorized)",
};

const NAMED_COLORS = {
  black: [0, 0, 0],
  white: [255, 255, 255],
  red: [255, 0, 0],
  green: [0, 255, 0],
  blue: [0, 0, 255],
  yellow: [255, 255, 0],
  cyan: [0, 255, 255],
  magenta: [255, 0, 255],
};

function parseRgbColor(value) {
  if (!value) return null;

  const named = NAMED_COLORS[value.toLowerCase()];
  if (named) return named;

  const hexMatch = value.match(/^#?([0-9a-fA-F]{6})$/);
  if (hexMatch) {
    const hex = hexMatch[1];
    return [
      parseInt(hex.slice(0, 2), 16),
      parseInt(hex.slice(2, 4), 16),
      parseInt(hex.slice(4, 6), 16),
    ];
  }

  const parts = value.split(",").map((part) => Number(part.trim()));
  if (parts.length === 3 && parts.every((n) => Number.isInteger(n) && n >= 0 && n <= 255)) {
    return parts;
  }

  return null;
}

export function execute(args, opts) {
  const [input, output, resolution, ...rest] = args;

  let color = null;

  for (let i = 0; i < rest.length; i += 1) {
    const token = rest[i];
    if (token === "--color") {
      const colorValue = rest[i + 1];
      color = parseRgbColor(colorValue);
      if (!color) {
        console.error("Invalid color. Use a named color, #RRGGBB, or R,G,B.");
        console.error("Examples: --color red, --color #ff6600, --color 255,102,0");
        process.exit(1);
      }
      i += 1;
      continue;
    }

    console.error(`Unknown option: ${token}`);
    console.error(`Usage: mm ${meta.usage}`);
    process.exit(1);
  }

  if (!input || !output || !resolution) {
    console.error(`Usage: mm ${meta.usage}`);
    process.exit(1);
  }

  const cmd = color
    ? [
        `gdal_rasterize -burn ${color[0]} -burn ${color[1]} -burn ${color[2]} -init 0 0 0 -a_nodata 0 -ot Byte -of GTiff`,
        `-tr ${resolution} ${resolution}`,
        "-tap -co COMPRESS=LZW -co TILED=YES",
        `"${input}"`,
        `"${output}"`,
      ].join(" ")
    : [
        `gdal_rasterize -burn 1 -init 0 -a_nodata 0 -ot Byte -of GTiff`,
        `-tr ${resolution} ${resolution}`,
        "-tap -co COMPRESS=LZW -co TILED=YES",
        `"${input}"`,
        `"${output}"`,
      ].join(" ");

  run(cmd, opts);
}
