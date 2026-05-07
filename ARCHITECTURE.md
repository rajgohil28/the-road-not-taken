# Architecture

## What I Built

The tool is a static React/Vite application backed by precomputed JSON. I chose this shape because level designers need a fast browser experience, while parquet parsing and telemetry normalization are better handled once in a preprocessing step than repeatedly in the client.

## Data Flow

Raw `player_data/` parquet files are processed by `scripts/preprocess_data.py`. The script decodes event bytes, detects human players from UUID-like IDs and bots from numeric IDs, maps world coordinates to 1024x1024 minimap pixels, groups rows by match, and writes app-ready JSON under `public/data/`. The frontend first loads `manifest.json`, then fetches only the selected match file.

The app can also ingest data from the browser. Users can upload raw `.nakama-0` parquet files, which are parsed client-side with `hyparquet`, normalized with the same coordinate and event rules, and kept in memory. They can also upload a generated data folder containing `manifest.json` and `matches/*.json`; the app validates that all manifest matches have corresponding match payloads and then switches filters/playback to the uploaded dataset in memory.

## Coordinate Mapping

The game data records world coordinates as `(x, y, z)`, where `y` is elevation. For minimap plotting the tool uses only `(x, z)`:

```text
u = (x - origin_x) / scale
v = (z - origin_z) / scale
pixel_x = u * 1024
pixel_y = (1 - v) * 1024
```

The `1 - v` flip is required because image coordinates start in the top-left while world Z increases upward on the map.

## Assumptions And Tradeoffs

| Decision | Why |
| --- | --- |
| Precompute JSON instead of parsing parquet in-browser | Keeps the deployed app simple and fast. |
| Support both raw parquet and processed JSON uploads | Raw files are convenient for users; processed JSON remains faster for larger deployed datasets. |
| Downsample movement paths but preserve all non-position events | Maintains readable performance while keeping kills, deaths, storm deaths, and loot accurate. |
| Treat timestamps as match-relative | The README says timestamps represent elapsed match time rather than wall-clock time. |
| Skip invalid or out-of-bounds points and report diagnostics | Avoids misleading map marks while making data quality visible. |
