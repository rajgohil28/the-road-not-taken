#!/usr/bin/env python3
"""Convert LILA BLACK parquet telemetry into static JSON for the web app."""

from __future__ import annotations

import argparse
import hashlib
import json
import math
import re
from collections import Counter, defaultdict
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

MAP_CONFIG = {
    "AmbroseValley": {"scale": 900.0, "origin_x": -370.0, "origin_z": -473.0, "image": "AmbroseValley_Minimap.png"},
    "GrandRift": {"scale": 581.0, "origin_x": -290.0, "origin_z": -290.0, "image": "GrandRift_Minimap.png"},
    "Lockdown": {"scale": 1000.0, "origin_x": -500.0, "origin_z": -500.0, "image": "Lockdown_Minimap.jpg"},
}

MOVEMENT_EVENTS = {"Position", "BotPosition"}
KILL_EVENTS = {"Kill", "BotKill"}
DEATH_EVENTS = {"Killed", "BotKilled", "KilledByStorm"}
DISCRETE_EVENTS = {"Kill", "Killed", "BotKill", "BotKilled", "KilledByStorm", "Loot"}
UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", re.I)


def decode_event(value: Any) -> str:
    if isinstance(value, bytes):
        return value.decode("utf-8")
    return str(value)


def is_human_user(user_id: str) -> bool:
    return bool(UUID_RE.match(str(user_id)))


def world_to_pixel(map_id: str, x: float, z: float) -> tuple[float, float, bool]:
    cfg = MAP_CONFIG[map_id]
    u = (float(x) - cfg["origin_x"]) / cfg["scale"]
    v = (float(z) - cfg["origin_z"]) / cfg["scale"]
    px = u * 1024.0
    py = (1.0 - v) * 1024.0
    return px, py, 0.0 <= px <= 1024.0 and 0.0 <= py <= 1024.0


def timestamp_ms(value: Any) -> int:
    if isinstance(value, datetime):
        return int(value.timestamp() * 1000)
    if hasattr(value, "as_py"):
        return timestamp_ms(value.as_py())
    return int(value)


def downsample_path(points: list[list[float]], max_points: int) -> list[list[float]]:
    if len(points) <= max_points:
        return points
    if max_points < 2:
        return points[:max_points]
    step = (len(points) - 1) / (max_points - 1)
    return [points[round(i * step)] for i in range(max_points)]


def date_from_folder(folder_name: str) -> str:
    return folder_name.replace("February_", "2026-02-").replace("_", "-")


def match_key(match_id: str) -> str:
    digest = hashlib.sha1(match_id.encode("utf-8")).hexdigest()[:10]
    readable = match_id.replace(".nakama-0", "")[:8]
    return f"{readable}-{digest}"


def read_rows(input_dir: Path) -> tuple[dict[str, Any], Counter]:
    try:
        import pyarrow.parquet as pq
    except ImportError as exc:
        raise SystemExit("pyarrow is required. Install with: python3 -m pip install pyarrow") from exc

    matches: dict[str, Any] = {}
    diagnostics: Counter = Counter()
    files = sorted(path for path in input_dir.glob("February_*/*") if path.is_file() and path.name != ".DS_Store")

    for path in files:
        diagnostics["files_seen"] += 1
        try:
            table = pq.read_table(path)
        except Exception:
            diagnostics["files_failed"] += 1
            continue

        rows = table.to_pylist()
        if not rows:
            diagnostics["empty_files"] += 1
            continue

        date = date_from_folder(path.parent.name)
        for row in rows:
            diagnostics["rows_seen"] += 1
            event = decode_event(row["event"])
            user_id = str(row["user_id"])
            match_id = str(row["match_id"])
            map_id = str(row["map_id"])
            if map_id not in MAP_CONFIG:
                diagnostics["unknown_map_rows"] += 1
                continue

            px, py, in_bounds = world_to_pixel(map_id, row["x"], row["z"])
            if not in_bounds:
                diagnostics["out_of_bounds_rows"] += 1
                continue

            key = match_key(match_id)
            match = matches.setdefault(
                key,
                {
                    "key": key,
                    "id": match_id,
                    "date": date,
                    "mapId": map_id,
                    "players": {},
                    "eventCounts": Counter(),
                    "minTs": None,
                    "maxTs": None,
                },
            )
            ts = timestamp_ms(row["ts"])
            match["minTs"] = ts if match["minTs"] is None else min(match["minTs"], ts)
            match["maxTs"] = ts if match["maxTs"] is None else max(match["maxTs"], ts)
            match["eventCounts"][event] += 1

            player_type = "human" if is_human_user(user_id) else "bot"
            player = match["players"].setdefault(
                user_id,
                {"userId": user_id, "type": player_type, "pathRaw": [], "eventsRaw": []},
            )
            raw_point = [ts, round(px, 2), round(py, 2), round(float(row["x"]), 2), round(float(row["z"]), 2)]
            if event in MOVEMENT_EVENTS:
                player["pathRaw"].append(raw_point)
                diagnostics["movement_rows"] += 1
            if event in DISCRETE_EVENTS:
                player["eventsRaw"].append(
                    {
                        "tRaw": ts,
                        "type": event,
                        "px": round(px, 2),
                        "py": round(py, 2),
                        "x": round(float(row["x"]), 2),
                        "z": round(float(row["z"]), 2),
                    }
                )
                diagnostics["event_rows"] += 1

    return matches, diagnostics


def build_outputs(matches: dict[str, Any], diagnostics: Counter, max_path_points: int) -> tuple[dict[str, Any], dict[str, Any], dict[str, Any]]:
    match_payloads: dict[str, Any] = {}
    manifest_matches = []
    global_event_counts: Counter = Counter()
    map_counts: Counter = Counter()
    date_counts: Counter = Counter()
    traffic_grid: dict[str, Counter] = defaultdict(Counter)
    kill_grid: dict[str, Counter] = defaultdict(Counter)
    death_grid: dict[str, Counter] = defaultdict(Counter)

    for key, match in sorted(matches.items(), key=lambda item: (item[1]["date"], item[1]["mapId"], item[1]["id"])):
        min_ts = match["minTs"] or 0
        max_ts = match["maxTs"] or min_ts
        duration = max(0.0, (max_ts - min_ts) / 1000.0)
        participants = []
        all_events = []
        human_count = 0
        bot_count = 0
        path_points = 0

        for player in match["players"].values():
            player["pathRaw"].sort(key=lambda point: point[0])
            player["eventsRaw"].sort(key=lambda event: event["tRaw"])
            path = [
                [round((point[0] - min_ts) / 1000.0, 2), point[1], point[2], point[3], point[4]]
                for point in downsample_path(player["pathRaw"], max_path_points)
            ]
            events = []
            for event in player["eventsRaw"]:
                normalized = {
                    "t": round((event["tRaw"] - min_ts) / 1000.0, 2),
                    "type": event["type"],
                    "userId": player["userId"],
                    "actorType": player["type"],
                    "px": event["px"],
                    "py": event["py"],
                    "x": event["x"],
                    "z": event["z"],
                }
                events.append(normalized)
                all_events.append(normalized)

            if player["type"] == "human":
                human_count += 1
            else:
                bot_count += 1
            path_points += len(path)
            participants.append({"userId": player["userId"], "type": player["type"], "path": path, "events": events})

            for point in path:
                traffic_grid[match["mapId"]][grid_key(point[1], point[2])] += 1
            for event in events:
                if event["type"] in KILL_EVENTS:
                    kill_grid[match["mapId"]][grid_key(event["px"], event["py"])] += 1
                if event["type"] in DEATH_EVENTS:
                    death_grid[match["mapId"]][grid_key(event["px"], event["py"])] += 1

        event_counts = dict(match["eventCounts"])
        global_event_counts.update(event_counts)
        map_counts[match["mapId"]] += 1
        date_counts[match["date"]] += 1
        participants.sort(key=lambda p: (p["type"], p["userId"]))
        all_events.sort(key=lambda event: event["t"])

        match_payloads[key] = {
            "key": key,
            "id": match["id"],
            "date": match["date"],
            "mapId": match["mapId"],
            "durationSec": round(duration, 2),
            "participants": participants,
            "events": all_events,
        }
        manifest_matches.append(
            {
                "key": key,
                "id": match["id"],
                "date": match["date"],
                "mapId": match["mapId"],
                "durationSec": round(duration, 2),
                "humanCount": human_count,
                "botCount": bot_count,
                "eventCounts": event_counts,
                "pathPointCount": path_points,
            }
        )

    manifest = {
        "generatedAt": datetime.now(UTC).isoformat(timespec="seconds").replace("+00:00", "Z"),
        "maps": [{"id": key, **value} for key, value in MAP_CONFIG.items()],
        "dates": sorted(date_counts),
        "matches": manifest_matches,
        "stats": {
            "matches": len(manifest_matches),
            "maps": dict(map_counts),
            "dates": dict(date_counts),
            "events": dict(global_event_counts),
            "diagnostics": dict(diagnostics),
        },
    }
    insights = build_insights(traffic_grid, kill_grid, death_grid, manifest)
    return manifest, match_payloads, insights


def grid_key(px: float, py: float, cells: int = 16) -> str:
    gx = min(cells - 1, max(0, math.floor(px / 1024.0 * cells)))
    gy = min(cells - 1, max(0, math.floor(py / 1024.0 * cells)))
    return f"{gx},{gy}"


def top_grid(counter: Counter) -> dict[str, Any]:
    total = sum(counter.values())
    if not total:
        return {"cell": None, "count": 0, "share": 0}
    cell, count = counter.most_common(1)[0]
    return {"cell": cell, "count": count, "share": round(count / total, 4)}


def build_insights(traffic_grid: dict[str, Counter], kill_grid: dict[str, Counter], death_grid: dict[str, Counter], manifest: dict[str, Any]) -> dict[str, Any]:
    by_map = {}
    for map_id in MAP_CONFIG:
        by_map[map_id] = {
            "trafficHotspot": top_grid(traffic_grid[map_id]),
            "killHotspot": top_grid(kill_grid[map_id]),
            "deathHotspot": top_grid(death_grid[map_id]),
        }
    return {
        "summary": {
            "matchCount": manifest["stats"]["matches"],
            "eventCounts": manifest["stats"]["events"],
            "diagnostics": manifest["stats"]["diagnostics"],
        },
        "byMap": by_map,
    }


def write_json(path: Path, payload: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, separators=(",", ":"), ensure_ascii=False), encoding="utf-8")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--input", default="player_data", help="Path to the raw player_data folder")
    parser.add_argument("--output", default="public/data", help="Output directory for JSON files")
    parser.add_argument("--max-path-points", type=int, default=220, help="Maximum movement points per participant")
    args = parser.parse_args()

    input_dir = Path(args.input)
    output_dir = Path(args.output)
    matches, diagnostics = read_rows(input_dir)
    manifest, match_payloads, insights = build_outputs(matches, diagnostics, args.max_path_points)

    write_json(output_dir / "manifest.json", manifest)
    write_json(output_dir / "insights.json", insights)
    for key, payload in match_payloads.items():
        write_json(output_dir / "matches" / f"{key}.json", payload)

    print(f"Processed {diagnostics['files_seen']} files into {len(match_payloads)} matches")
    print(f"Wrote {output_dir / 'manifest.json'}")


if __name__ == "__main__":
    main()
