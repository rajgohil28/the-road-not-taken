# LILA Journey Lab

LILA Journey Lab is a map-intelligence tool for turning raw LILA BLACK telemetry into level-design decisions. It lets designers inspect how humans and bots moved through each map, where meaningful events happened, and which areas deserve design attention.

## Problem Statement

LILA BLACK produces rich gameplay telemetry, but the raw `.nakama-0` parquet files are difficult for level designers, game designers, and product managers to use directly. Each file contains player or bot movement, map position, timestamps, and gameplay events, but the raw format does not quickly answer the questions designers actually ask:

- Where do players naturally rotate?
- Which routes become chokepoints?
- Which parts of the map are ignored?
- Where do combat, loot, and storm deaths cluster?
- Are bots reinforcing player flow or distorting it?

Without a visual layer, teams have to rely on manual inspection, one-off scripts, or aggregate counts that lose spatial and temporal context.

## Proposed Solution

LILA Journey Lab turns raw telemetry into an interactive browser workbench. The tool overlays player and bot journeys on the correct minimap, supports match playback, separates humans from bots, marks gameplay events, and provides heatmaps for traffic, kills, deaths, storm deaths, and loot.

The goal is not just to show data. The goal is to help designers move from:

```text
raw telemetry -> spatial evidence -> design judgment
```

This is the Delta 4 version of the assignment: a tool that feels like a lightweight map-review cockpit instead of a static dashboard.

## Who It Helps

**Level designers** can inspect route usage, chokepoints, death zones, storm pressure areas, and ignored spaces.

**Game designers** can reason about pacing, bot pressure, loot pull, encounter frequency, and whether systems are creating the intended behavior.

**Product managers** can review evidence-backed insights, prioritize map/system changes, and share the same browser view with design and engineering.

## Core Features

- **Minimap journey playback**: replay a selected match over the actual map image.
- **Human vs bot separation**: distinguish real player movement from AI behavior.
- **Event markers**: show kills, deaths, bot combat, storm deaths, and loot pickups.
- **Heatmap overlays**: switch between traffic, kill, death, storm, and loot density.
- **Map/date/match filters**: focus on a specific map, day, or match.
- **Raw data upload**: upload `.nakama-0` parquet files or a full `player_data` folder directly in the browser.
- **Preprocessed dataset mode**: ship compact JSON for fast hosted review.
- **Insight documentation**: `INSIGHTS.md` captures evidence-backed findings and level-design actions.

## Data Provided

The assignment includes 5 days of production telemetry from February 10-14, 2026:

- 1,243 player/bot journey files
- About 89,000 event rows
- 339 unique players
- 796 unique matches
- 3 maps: `AmbroseValley`, `GrandRift`, `Lockdown`

Each `.nakama-0` file is one actor in one match:

```text
{user_id}_{match_id}.nakama-0
```

Human players use UUID IDs. Bots use short numeric IDs.

Available row fields:

```text
user_id, match_id, map_id, x, y, z, ts, event
```

There are no extra fields for health, weapons, inventory, killer ID, team, rank, objective status, or item type. The tool derives higher-level behavior such as actor type, routes, visited zones, movement density, and event hotspots from the available telemetry.

## Architecture

The project supports two ingestion paths:

1. **Build-time ingestion**
   - `scripts/preprocess_data.py` reads raw parquet files with PyArrow.
   - It decodes events, detects humans/bots, maps world coordinates to minimap pixels, groups data by match, and writes compact JSON to `public/data`.
   - This is the best path for hosted deployment.

2. **Browser upload ingestion**
   - The app can parse uploaded `.nakama-0` parquet files client-side with `hyparquet`.
   - It normalizes uploaded rows into the same manifest/match structure used by the bundled dataset.
   - This is useful for quick inspection without redeploying.

Coordinate mapping uses the config from the provided dataset README:

```text
u = (x - origin_x) / scale
v = (z - origin_z) / scale
pixel_x = u * 1024
pixel_y = (1 - v) * 1024
```

Only `x` and `z` are used for 2D minimap plotting. `y` is elevation.

## Tech Stack

- React + TypeScript + Vite
- Canvas rendering for paths, markers, playback positions, and heatmaps
- Python + PyArrow for preprocessing
- Hyparquet for browser-side parquet upload
- Static hosting friendly: no required backend, database, or API server

## Setup

```bash
npm install
python3 -m pip install pyarrow
python3 scripts/preprocess_data.py --input /path/to/player_data --output public/data
npm run dev
```

Open the Vite URL, usually:

```text
http://localhost:5173
```

## Uploading Data

The app supports both raw and processed uploads.

**Raw files**

Use **Data Source -> Files** to select one or more `.nakama-0` files.

Use **Data Source -> Folder** to select the full `player_data` folder.

**Processed JSON**

For larger datasets or repeatable builds:

```bash
python3 scripts/preprocess_data.py --input /path/to/player_data --output /tmp/lila_data
```

Then upload the generated folder containing:

```text
manifest.json
matches/*.json
```

## Build And Deploy

```bash
npm run build
```

The production app is emitted to `dist/` and can be hosted on Vercel, Netlify, GitHub Pages, or any static host.

Deployment URL:

```text
TODO: add hosted link before submission
```

## Validation

```bash
npm run test
npm run build
```

Tests cover:

- Ambrose Valley coordinate conversion using the README sample
- Human vs bot detection
- Event byte decoding

## Current Data Limitation

The provided timestamps span less than one second per reconstructed match in this telemetry slice. The tool therefore displays playback in seconds with decimals rather than assuming multi-minute match duration. The paths and event ordering are still useful for spatial review, but the dataset should be interpreted as dense journey/event samples rather than full cinematic match replays.
