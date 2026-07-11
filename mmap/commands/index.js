/**
 * Command registry.
 * To add a new command:
 *   1. Create commands/yourCommand.js  (export meta + execute)
 *   2. Add one line here.
 */
export { meta as rasterizeShpMeta, execute as rasterizeShp } from "./rasterizeShp.js";
export { meta as clipShpMeta, execute as clipShp } from "./clipShp.js";

// ─── registry map ────────────────────────────────────────────────────────────
// Keys are the CLI command names users type.
import * as rasterizeShp from "./rasterizeShp.js";
import * as clipShp from "./clipShp.js";
import * as tfw from "./tfw.js";
import * as hot from "./hot.js";
import * as quake from "./quake.js";
import * as bluemarble from "./bluemarble.js";

export const commands = {
  rasterizeShp,
  clipShp,
  tfw,
  hot,
  quake,
  bluemarble,
};
