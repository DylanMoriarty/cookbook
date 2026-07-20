# mmap

Personal CLI for common geo/data processing commands. Wraps GDAL, OGR, and eventually Node scripts into short, memorable commands.

## Setup

```bash
cd mmap
npm install
npm link        # makes `mm` available globally in your terminal
```

That's it. No config files, no PATH editing — `npm link` symlinks the bin into your global node prefix.

To uninstall later: `npm unlink -g mmap`

---

## Usage

```bash
mm <command> [args...]
mm help                    # list all commands
mm help rasterizeShp       # describe one command
mm --dry-run <command>     # print the shell command without running it
```

### Commands

| Command | Description |
|---|---|
| `rasterizeShp` | Burn a shapefile to a compressed GeoTIFF (optional color) |
| `clipShp` | Clip a shapefile to a bounding box |
| `bluemarble` | Fetch and clip NASA Blue Marble imagery to a GeoJSON bbox |

### Examples

```bash
# Rasterize a shapefile at 10m resolution
mm rasterizeShp input.shp output.tif 10

# Rasterize with a custom color
mm rasterizeShp input.shp output.tif 10 --color red

# Preview the gdal_rasterize command without running it
mm --dry-run rasterizeShp input.shp output.tif 10

# Clip a shapefile to a bounding box
mm clipShp input.shp clipped.shp -180 -90 180 90

# Check Blue Marble bbox parsing only
mm bluemarble --bbox area.geojson --check-only

# Fetch Blue Marble imagery clipped to a GeoJSON bbox
mm bluemarble --bbox area.geojson --res 0.01 --out output/blue_marble_clip.tif --layer BlueMarble_ShadedRelief_Bathymetry

# Print a project path shortcut
mm hot tehran

# Change directory in your current shell using eval
eval "$(mm hot tehran --cd)"
```

### Make mm hot cd directly in zsh

Add this to your `~/.zshrc` so `mm hot tehran` changes your current shell directory:

```zsh
mm() {
  if [[ "$1" == "hot" && -n "$2" && "$2" != "--list" && "$2" != "-l" ]]; then
    local target
    target="$(command mm hot "$2")" || return
    cd "$target" || return
    return
  fi

  command mm "$@"
}
```

---

## Adding a new command

1. Create `commands/yourCommand.js`:

```js
import { run } from "../lib/run.js";

export const meta = {
  usage: "yourCommand <input> <output>",
  description: "What this command does",
};

export function execute(args, opts) {
  const [input, output] = args;

  if (!input || !output) {
    console.error(`Usage: mm ${meta.usage}`);
    process.exit(1);
  }

  run(`some-cli-tool "${input}" "${output}"`, opts);
}
```

2. Register it in `commands/index.js`:

```js
import * as yourCommand from "./yourCommand.js";

export const commands = {
  // ...existing commands...
  yourCommand,
};
```

That's all. The help text and dispatch are automatic.

---

## Adding a Node script command

Same pattern — just use Node APIs instead of `run()`:

```js
import fs from "fs";
import path from "path";

export const meta = {
  usage: "countFeatures <input.geojson>",
  description: "Print the feature count of a GeoJSON file",
};

export function execute(args) {
  const [input] = args;
  const data = JSON.parse(fs.readFileSync(input, "utf8"));
  console.log(`Features: ${data.features.length}`);
}
```

---

## Requirements

- Node.js 18+
- GDAL installed (`brew install gdal`)
