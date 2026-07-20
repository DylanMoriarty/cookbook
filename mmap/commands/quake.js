/**
 * clipShp — clip a shapefile to a bounding box
 *
 * Usage: mm clipShp <input.shp> <output.shp> <xmin> <ymin> <xmax> <ymax>
 *
 * Wraps:
 *   ogr2ogr -clipsrc <xmin> <ymin> <xmax> <ymax> <output> <input>
 */
import { run } from "../lib/run.js";

export const meta = {
  usage: "quake <input.shp>",
  description: "Convert mi.shp data from USGS to a Datawrapper friendly version",
};

export function execute(args, opts) {
  const [input] = args;

  if (!input) {
    console.error(`Usage: mm ${meta.usage}`);
    process.exit(1);
  }

  const cmd = [
    "mapshaper",
      `"${input}.shp"`,
      `-each 'mmi=Math.round(PARAMVALUE)'`,
      `-dissolve2 mmi`,
      `-each 'mmi_label=(mmi==3?"Weak":mmi==4?"Light":mmi==5?"Moderate":mmi==6?"Strong":mmi==7?"Very Strong":mmi==8?"Severe":mmi==9?"Violent":mmi==10?"Extreme":"Unknown")'`,
      `-o format=geojson`,
      `"${input}.json"`,
  ].join(" ");

  run(cmd, opts);
}
