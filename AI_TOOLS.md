# LILA AI Tools

The app exposes an in-browser tool bridge for an LLM or browser agent:

```js
await window.lilaTools.callTool("user_control", { action: "next" });
await window.lilaTools.callTool("playback_control", { action: "play" });
await window.lilaTools.callTool("timeline_control", { action: "go_to_event", eventType: "Killed", occurrence: "next" });
```

## P0 Control Tools

- `match_control`: select/search matches by map, date, match key/id, or query.
- `user_control`: select, clear, next, or previous player/bot route.
- `playback_control`: play, pause, toggle, restart, step, and set speed.
- `timeline_control`: jump to a timestamp or event occurrence.
- `map_view_control`: pan, zoom, rotate, and reset the map.
- `map_layer_control`: select heatmap layer and visibility toggles.
- `screenshot`: returns a PNG data URL of the current map viewport.

## P1 Analysis Tools

- `event_query`: structured filtering over events by type, actor, player, and time window.
- `path_query`: route summary with distance, duration, idle estimate, and event counts.
- `compare_layer_stats`: route overlap estimate against traffic, kill, death, storm, or loot layers.
- `match_summary`: compact match stats for the selected or requested match.

Use `window.lilaTools.listTools()` for machine-readable schemas and `window.lilaTools.getState()` for current app state.
