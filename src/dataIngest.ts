import { parquetReadObjects } from "hyparquet";
import type { Manifest, MatchPayload, MapId, Participant } from "./types";

const MAP_CONFIG = {
  AmbroseValley: { scale: 900, origin_x: -370, origin_z: -473, image: "AmbroseValley_Minimap.png" },
  GrandRift: { scale: 581, origin_x: -290, origin_z: -290, image: "GrandRift_Minimap.png" },
  Lockdown: { scale: 1000, origin_x: -500, origin_z: -500, image: "Lockdown_Minimap.jpg" },
} satisfies Record<MapId, { scale: number; origin_x: number; origin_z: number; image: string }>;

const MOVEMENT_EVENTS = new Set(["Position", "BotPosition"]);
const DISCRETE_EVENTS = new Set(["Kill", "Killed", "BotKill", "BotKilled", "KilledByStorm", "Loot"]);
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_PATH_POINTS = 220;

interface RawRow {
  user_id: string;
  match_id: string;
  map_id: MapId;
  x: number;
  z: number;
  ts: Date | number | bigint | string;
  event: string | Uint8Array | ArrayBuffer | number[];
}

interface WorkingPlayer {
  userId: string;
  type: "human" | "bot";
  pathRaw: RawPoint[];
  eventsRaw: RawEvent[];
}

interface RawPoint {
  tRaw: number;
  px: number;
  py: number;
  x: number;
  z: number;
}

interface RawEvent extends RawPoint {
  type: string;
}

interface WorkingMatch {
  key: string;
  id: string;
  date: string;
  mapId: MapId;
  players: globalThis.Map<string, WorkingPlayer>;
  eventCounts: Record<string, number>;
  minTs: number;
  maxTs: number;
}

export interface BrowserDataset {
  manifest: Manifest;
  matches: globalThis.Map<string, MatchPayload>;
}

export async function ingestRawParquetFiles(files: File[]): Promise<BrowserDataset> {
  const matches = new globalThis.Map<string, WorkingMatch>();
  const diagnostics: Record<string, number> = {
    files_seen: 0,
    files_failed: 0,
    rows_seen: 0,
    movement_rows: 0,
    event_rows: 0,
    out_of_bounds_rows: 0,
  };

  for (const file of files) {
    diagnostics.files_seen += 1;
    try {
      const rows = await parquetReadObjects({ file: await file.arrayBuffer() }) as RawRow[];
      let date = dateFromPath(file.webkitRelativePath || file.name);
      if (date === "uploaded" && rows.length > 0) {
        const firstTs = timestampMs(rows[0].ts);
        if (firstTs > 0 && firstTs < 3000000000000) {
           date = new Date(firstTs).toISOString().split("T")[0];
        }
      }
      for (const row of rows) {
        diagnostics.rows_seen += 1;
        if (!isMapId(row.map_id)) continue;
        const event = decodeEvent(row.event);
        const mapped = worldToPixel(row.map_id, row.x, row.z);
        if (!mapped.inBounds) {
          diagnostics.out_of_bounds_rows += 1;
          continue;
        }
        const userId = String(row.user_id);
        const matchId = String(row.match_id);
        const key = matchKey(matchId);
        const tRaw = timestampMs(row.ts);
        const match = getWorkingMatch(matches, key, matchId, date, row.map_id);
        match.minTs = Math.min(match.minTs, tRaw);
        match.maxTs = Math.max(match.maxTs, tRaw);
        match.eventCounts[event] = (match.eventCounts[event] ?? 0) + 1;
        const player = getWorkingPlayer(match, userId);
        const point = {
          tRaw,
          px: round(mapped.px),
          py: round(mapped.py),
          x: round(row.x),
          z: round(row.z),
        };
        if (MOVEMENT_EVENTS.has(event)) {
          player.pathRaw.push(point);
          diagnostics.movement_rows += 1;
        }
        if (DISCRETE_EVENTS.has(event)) {
          player.eventsRaw.push({ ...point, type: event });
          diagnostics.event_rows += 1;
        }
      }
    } catch {
      diagnostics.files_failed += 1;
    }
  }

  if (!matches.size) {
    throw new Error("No readable LILA parquet rows found. Upload .nakama-0 files or the player_data folder.");
  }

  return buildDataset(matches, diagnostics);
}

function buildDataset(workingMatches: globalThis.Map<string, WorkingMatch>, diagnostics: Record<string, number>): BrowserDataset {
  const manifestMatches: Manifest["matches"] = [];
  const payloads = new globalThis.Map<string, MatchPayload>();
  const dates = new Set<string>();
  const mapCounts: Record<string, number> = {};
  const eventTotals: Record<string, number> = {};

  const sorted = [...workingMatches.values()].sort((a, b) => `${a.date}${a.mapId}${a.id}`.localeCompare(`${b.date}${b.mapId}${b.id}`));
  for (const match of sorted) {
    dates.add(match.date);
    mapCounts[match.mapId] = (mapCounts[match.mapId] ?? 0) + 1;
    for (const [event, count] of Object.entries(match.eventCounts)) {
      eventTotals[event] = (eventTotals[event] ?? 0) + count;
    }

    const minTs = Number.isFinite(match.minTs) ? match.minTs : 0;
    const maxTs = Number.isFinite(match.maxTs) ? match.maxTs : minTs;
    const participants: Participant[] = [...match.players.values()].map((player) => {
      const path = downsamplePath(player.pathRaw.sort((a, b) => a.tRaw - b.tRaw), MAX_PATH_POINTS)
        .map((point) => [round((point.tRaw - minTs) / 1000), point.px, point.py, point.x, point.z] as [number, number, number, number, number]);
      const events = player.eventsRaw.sort((a, b) => a.tRaw - b.tRaw).map((event) => ({
        t: round((event.tRaw - minTs) / 1000),
        type: event.type,
        userId: player.userId,
        actorType: player.type,
        px: event.px,
        py: event.py,
        x: event.x,
        z: event.z,
      }));
      return { userId: player.userId, type: player.type, path, events };
    });
    const events = participants.flatMap((player) => player.events).sort((a, b) => a.t - b.t);
    const humanCount = participants.filter((player) => player.type === "human").length;
    const botCount = participants.length - humanCount;
    const pathPointCount = participants.reduce((total, player) => total + player.path.length, 0);
    const durationSec = round((maxTs - minTs) / 1000);

    payloads.set(match.key, {
      key: match.key,
      id: match.id,
      date: match.date,
      mapId: match.mapId,
      durationSec,
      participants,
      events,
    });
    manifestMatches.push({
      key: match.key,
      id: match.id,
      date: match.date,
      mapId: match.mapId,
      durationSec,
      humanCount,
      botCount,
      eventCounts: match.eventCounts,
      pathPointCount,
    });
  }

  return {
    manifest: {
      generatedAt: new Date().toISOString(),
      maps: Object.entries(MAP_CONFIG).map(([id, cfg]) => ({ id: id as MapId, ...cfg })),
      dates: [...dates].sort(),
      matches: manifestMatches,
      stats: {
        matches: manifestMatches.length,
        maps: mapCounts,
        dates: Object.fromEntries([...dates].sort().map((date) => [date, manifestMatches.filter((match) => match.date === date).length])),
        events: eventTotals,
        diagnostics,
      },
    },
    matches: payloads,
  };
}

function getWorkingMatch(matches: globalThis.Map<string, WorkingMatch>, key: string, id: string, date: string, mapId: MapId) {
  const existing = matches.get(key);
  if (existing) return existing;
  const created: WorkingMatch = {
    key,
    id,
    date,
    mapId,
    players: new globalThis.Map(),
    eventCounts: {},
    minTs: Number.POSITIVE_INFINITY,
    maxTs: Number.NEGATIVE_INFINITY,
  };
  matches.set(key, created);
  return created;
}

function getWorkingPlayer(match: WorkingMatch, userId: string) {
  const existing = match.players.get(userId);
  if (existing) return existing;
  const created: WorkingPlayer = {
    userId,
    type: UUID_RE.test(userId) ? "human" : "bot",
    pathRaw: [],
    eventsRaw: [],
  };
  match.players.set(userId, created);
  return created;
}

function worldToPixel(mapId: MapId, x: number, z: number) {
  const cfg = MAP_CONFIG[mapId];
  const u = (x - cfg.origin_x) / cfg.scale;
  const v = (z - cfg.origin_z) / cfg.scale;
  const px = u * 1024;
  const py = (1 - v) * 1024;
  return { px, py, inBounds: px >= 0 && px <= 1024 && py >= 0 && py <= 1024 };
}

function decodeEvent(value: RawRow["event"]) {
  if (typeof value === "string") return value;
  if (value instanceof ArrayBuffer) return new TextDecoder().decode(value);
  if (value instanceof Uint8Array) return new TextDecoder().decode(value);
  return new TextDecoder().decode(new Uint8Array(value));
}

function timestampMs(value: RawRow["ts"]) {
  if (value instanceof Date) return value.getTime();
  if (typeof value === "bigint") return Number(value);
  if (typeof value === "number") return value;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? Number(value) : parsed;
}

function downsamplePath(points: RawPoint[], maxPoints: number) {
  if (points.length <= maxPoints) return points;
  const step = (points.length - 1) / (maxPoints - 1);
  return Array.from({ length: maxPoints }, (_, index) => points[Math.round(index * step)]);
}

function dateFromPath(path: string) {
  const match = path.match(/February_(\d{2})/);
  return match ? `2026-02-${match[1]}` : "uploaded";
}

function matchKey(matchId: string) {
  return matchId.replace(".nakama-0", "");
}

function isMapId(value: string): value is MapId {
  return value === "AmbroseValley" || value === "GrandRift" || value === "Lockdown";
}

function round(value: number) {
  return Math.round(value * 100) / 100;
}
