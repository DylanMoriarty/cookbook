# mmap

CLI for common geo/data processing commands. More intense scripts are written with Claude and then tinkering to make sure they actually work properly. Goal here is to automate INPUT / OUTPUT tasks, and tedious common gdal commands.

## Setup

```bash
cd mmap
npm install
npm link        # makes `mmap` available globally in your terminal
```

`npm link` symlinks the bin into your global node prefix.

To uninstall later: `npm unlink -g mmap`

---

## Usage

```bash
mmap <command> [args...]
mmap help                    # list all commands
mmap help rasterizeShp       # describe one command
mmap --dry-run <command>     # print the shell command without running it
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
mmap rasterizeShp input.shp output.tif 10

# Rasterize with a custom color
mmap rasterizeShp input.shp output.tif 10 --color red

# Preview the gdal_rasterize command without running it
mmap --dry-run rasterizeShp input.shp output.tif 10

# Clip a shapefile to a bounding box
mmap clipShp input.shp clipped.shp -180 -90 180 90

# Check Blue Marble bbox parsing only
mmap bluemarble --bbox area.geojson --check-only

# Fetch Blue Marble imagery clipped to a GeoJSON bbox
mmap bluemarble --bbox area.geojson --res 0.01 --out output/blue_marble_clip.tif --layer BlueMarble_ShadedRelief_Bathymetry

# Print a project path shortcut
mmap hot tehran

# Change directory in your current shell using eval
eval "$(mmap hot tehran --cd)"
```

### Make mmap hot cd directly in zsh

Add this to your `~/.zshrc` so `mmap hot tehran` changes your current shell directory:

```zsh
mmap() {
  if [[ "$1" == "hot" ]]; then
    shift

    # Let list/help-style calls behave normally.
    if [[ -z "$1" || "$1" == "--list" || "$1" == "-l" ]]; then
      command mmap hot "$@"
      return
    fi

    # Ask mmap for a shell-safe cd command and execute it in this shell.
    local cd_cmd
    cd_cmd="$(command mmap hot "$1" --cd)" || return
    eval "$cd_cmd"
    return
  fi

  command mmap "$@"
}
```

Then reload your shell:

```zsh
source ~/.zshrc
type mmap    # should say "mmap is a shell function"
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
    console.error(`Usage: mmap ${meta.usage}`);
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
