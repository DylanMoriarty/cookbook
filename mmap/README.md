# mmap

CLI for common geo/data processing commands. More intense scripts are written with Claude and then tinkering to make sure they actually work properly. Goal here is to automate INPUT / OUTPUT tasks, and tedious common gdal commands.

## Setup

```bash
cd mmap
npm install
npm link        # makes `mm` available globally in your terminal
```

`npm link` symlinks the bin into your global node prefix.

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
| `overpass` | Download a named OpenStreetMap query in a GeoJSON bounding box |
| `dem` | Download, merge, and clip SRTM or Terrarium elevation data to a GeoTIFF |
| `biomass` | Clip 300 m global 2010 biomass carbon density to a GeoTIFF |
| `mediaGeojson` | Export GPS locations from MOV, MP4, HEIC, and JPG files as GeoJSON points |

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

# Download all roads to overpass/highways.geojson
mm overpass area.geojson

# Download a built-in query: allroads, highway, or water
mm overpass area.geojson water

# Download and clip SRTM 30 m elevation data
mm dem area.geojson

# Download a coarser SRTM output; source tiles are still 1 arc-second
mm dem area.geojson --source srtm --res 90 --out dem/srtm_90m.tif

# Download Terrarium tiles; coarser resolutions pick lower zooms and fewer tiles
mm dem area.geojson --source terrarium --res 500 --out dem/terrarium_500m.tif

# Terrarium also writes a Float32 single-band Blender heightmap next to the output
# Example: dem/terrarium_500m_blend.tif

# Download the 2010 global above-ground biomass carbon-density layer at native 300 m
mm biomass area.geojson --out biomass/aboveground_2010.tif

# Download a coarser biomass layer or select below-ground biomass / uncertainty layers
mm biomass area.geojson --layer belowground --res 1000 --out biomass/belowground_1km.tif

# Export locations and creation timestamps from MOV, MP4, HEIC, and JPG metadata
mm mediaGeojson media/

# Print a project path shortcut
mm hot tehran

# Change directory in your current shell using eval
eval "$(mm hot tehran --cd)"
```

### Make mm hot cd directly in zsh

Add this to your `~/.zshrc` so `mm hot tehran` changes your current shell directory:

```zsh
mm() {
  if [[ "$1" == "hot" ]]; then
    shift

    # Let list/help-style calls behave normally.
    if [[ -z "$1" || "$1" == "--list" || "$1" == "-l" ]]; then
      command mm hot "$@"
      return
    fi

    # Ask mm for a shell-safe cd command and execute it in this shell.
    local cd_cmd
    cd_cmd="$(command mm hot "$1" --cd)" || return
    eval "$cd_cmd"
    return
  fi

  command mm "$@"
}
```

Then reload your shell:

```zsh
source ~/.zshrc
type mm    # should say "mm is a shell function"
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
- ExifTool for `mediaGeojson` (`brew install exiftool`)
