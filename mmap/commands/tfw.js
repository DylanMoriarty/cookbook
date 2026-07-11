/**
 * tfw — generate a tfw file for a given raster file
 *
 * Usage: mmap tfw <input.tif> <output.tfw>
 *
 * Wraps:
 *   gdal_translate -of GTiff -co TFW=YES <input> <output>
 */
import { run } from "../lib/run.js";

export const meta = {
  usage: "tfw <input.tif> <output.tfw>",
  description: "Generate a TFW file for a given raster file",
};

export function execute(args, opts) {
  const [input, output] = args;

  if (!input || !output) {
    console.error(`Usage: mmap ${meta.usage}`);
    process.exit(1);
  }

  const cmd = [
    `gdal_translate -of GTiff -co TFW=YES`,
    `"${input}"`,
    `"${output}"`,
  ].join(" ");

  run(cmd, opts);
}
