/**
 * clipShp — clip a shapefile to a bounding box
 *
 * Usage: mmap clipShp <input.shp> <output.shp> <xmin> <ymin> <xmax> <ymax>
 *
 * Wraps:
 *   ogr2ogr -clipsrc <xmin> <ymin> <xmax> <ymax> <output> <input>
 */
import { run } from "../lib/run.js";

export const meta = {
  usage: "clipShp <input.shp> <output.shp> <xmin> <ymin> <xmax> <ymax>",
  description: "Clip a shapefile to a bounding box using ogr2ogr",
};

export function execute(args, opts) {
  const [input, output, xmin, ymin, xmax, ymax] = args;

  if (!input || !output || !xmin || !ymin || !xmax || !ymax) {
    console.error(`Usage: mmap ${meta.usage}`);
    process.exit(1);
  }

  const cmd = [
    "ogr2ogr",
    `-clipsrc ${xmin} ${ymin} ${xmax} ${ymax}`,
    `"${output}"`,
    `"${input}"`,
  ].join(" ");

  run(cmd, opts);
}
