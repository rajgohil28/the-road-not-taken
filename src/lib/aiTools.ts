import { HEATMAP_OPTIONS, MAX_ZOOM, MIN_ZOOM } from "../constants";
import type { RefObject } from "react";
import type { ActorType, HeatmapMode, JourneyEvent, Manifest, MatchPayload, MatchSummary, Participant, Toggles } from "../types";
import { clamp, normalizeDegrees } from "../utils";

type MapView = { zoom: number; rotation: number; x: number; y: number };
type StateSetter<T> = (value: T | ((current: T) => T)) => void;

export type AiToolName =
  | "get_state"
  | "match_control"
  | "user_control"
  | "playback_control"
  | "timeline_control"
  | "map_view_control"
  | "map_layer_control"
  | "screenshot"
  | "event_query"
  | "path_query"
  | "compare_layer_stats"
  | "match_summary";

export interface AiToolDefinition {
  name: AiToolName;
  priority: "P0" | "P1";
  description: string;
  input: Record<string, unknown>;
}

export interface AiToolResult<T = unknown> {
  ok: boolean;
  tool: AiToolName;
  data?: T;
  error?: string;
}

export interface LilaAiTools {
  listTools: () => AiToolDefinition[];
  getState: () => AiToolResult;
  callTool: (name: AiToolName, input?: Record<string, unknown>) => Promise<AiToolResult>;
}

export interface LilaToolRuntime {
  manifest: Manifest | null;
  match: MatchPayload | null;
  selectedMap: string;
  selectedDate: string;
  selectedMatchKey: string;
  selectedPlayerId: string;
  heatmap: HeatmapMode;
  time: number;
  duration: number;
  playbackSpeed: number;
  playing: boolean;
  mapView: MapView;
  toggles: Toggles;
  canvasRef: RefObject<HTMLCanvasElement | null>;
  setSelectedMap: StateSetter<string>;
  setSelectedDate: StateSetter<string>;
  setSelectedMatchKey: StateSetter<string>;
  setQuery: StateSetter<string>;
  setSelectedPlayerId: StateSetter<string>;
  setPlaying: StateSetter<boolean>;
  setTime: StateSetter<number>;
  setPlaybackSpeed: StateSetter<number>;
  setHeatmap: StateSetter<HeatmapMode>;
  setMapView: StateSetter<MapView>;
  setToggles: StateSetter<Toggles>;
}

const TOOL_DEFINITIONS: AiToolDefinition[] = [
  {
    name: "get_state",
    priority: "P0",
    description: "Return current app state, including selected match, selected user/player id, selected participant type, time, layer, playback, and map view.",
    input: {},
  },
  {
    name: "match_control",
    priority: "P0",
    description: "Select or search matches by map, date, match key/id, and query.",
    input: { action: "select | filter | search | next | previous", mapId: "optional", date: "optional", matchKey: "optional", matchId: "optional", query: "optional" },
  },
  {
    name: "user_control",
    priority: "P0",
    description: "Select the visible player/bot route.",
    input: { action: "select | next | previous | clear", userId: "optional", actorType: "human | bot optional" },
  },
  {
    name: "playback_control",
    priority: "P0",
    description: "Play, pause, restart, step, or change playback speed.",
    input: { action: "play | pause | toggle | restart | step_forward | step_back | set_speed", seconds: "optional", speed: "optional" },
  },
  {
    name: "timeline_control",
    priority: "P0",
    description: "Jump to a timestamp or to a matching event occurrence.",
    input: { action: "go_to_time | go_to_event", time: "optional seconds", eventType: "optional", occurrence: "first | next | previous | last", userId: "optional", selectPlayer: "optional boolean" },
  },
  {
    name: "map_view_control",
    priority: "P0",
    description: "Pan, zoom, rotate, or reset the map camera.",
    input: { action: "pan | zoom_in | zoom_out | set_zoom | rotate | reset", dx: "optional", dy: "optional", zoom: "optional", rotation: "optional" },
  },
  {
    name: "map_layer_control",
    priority: "P0",
    description: "Select a heatmap/layer and toggle path/event visibility.",
    input: { layer: "traffic | kills | deaths | storm | loot | off optional", toggles: "optional { humans, bots, paths, events }" },
  },
  {
    name: "screenshot",
    priority: "P0",
    description: "Capture the current map viewport as a PNG data URL for an LLM vision pass.",
    input: { includeOverlay: "optional boolean, defaults true" },
  },
  {
    name: "event_query",
    priority: "P1",
    description: "Return structured events filtered by event type, actor type, player, and time window.",
    input: { eventType: "optional", actorType: "human | bot optional", userId: "optional", fromSec: "optional", toSec: "optional", limit: "optional" },
  },
  {
    name: "path_query",
    priority: "P1",
    description: "Summarize a selected/player path: points, distance, duration, idle estimate, and events.",
    input: { userId: "optional, defaults selected player" },
  },
  {
    name: "compare_layer_stats",
    priority: "P1",
    description: "Estimate how much the selected/player path overlaps a chosen event-density layer.",
    input: { userId: "optional", layer: "traffic | kills | deaths | storm | loot optional", radiusPx: "optional" },
  },
  {
    name: "match_summary",
    priority: "P1",
    description: "Return compact stats for the selected match or a requested match key/id.",
    input: { matchKey: "optional", matchId: "optional" },
  },
];

const heatmapValues = new Set(HEATMAP_OPTIONS.map((option) => option.value));

declare global {
  interface Window {
    lilaTools?: LilaAiTools;
  }
}

export function createLilaAiTools(runtime: LilaToolRuntime): LilaAiTools {
  const callTool = async (name: AiToolName, input: Record<string, unknown> = {}): Promise<AiToolResult> => {
    try {
      switch (name) {
        case "match_control":
          return ok(name, handleMatchControl(runtime, input));
        case "get_state":
          return ok(name, getState(runtime));
        case "user_control":
          return ok(name, handleUserControl(runtime, input));
        case "playback_control":
          return ok(name, handlePlaybackControl(runtime, input));
        case "timeline_control":
          return ok(name, handleTimelineControl(runtime, input));
        case "map_view_control":
          return ok(name, handleMapViewControl(runtime, input));
        case "map_layer_control":
          return ok(name, handleMapLayerControl(runtime, input));
        case "screenshot":
          return ok(name, await captureMapScreenshot(runtime, input));
        case "event_query":
          return ok(name, handleEventQuery(runtime, input));
        case "path_query":
          return ok(name, handlePathQuery(runtime, input));
        case "compare_layer_stats":
          return ok(name, handleCompareLayerStats(runtime, input));
        case "match_summary":
          return ok(name, handleMatchSummary(runtime, input));
        default:
          return fail(name, `Unknown tool: ${String(name)}`);
      }
    } catch (error) {
      return fail(name, error instanceof Error ? error.message : "Tool call failed.");
    }
  };

  return {
    listTools: () => TOOL_DEFINITIONS,
    getState: () => ok("get_state", getState(runtime)),
    callTool,
  };
}

function handleMatchControl(runtime: LilaToolRuntime, input: Record<string, unknown>) {
  assertManifest(runtime);
  const action = str(input.action, "select");
  const matches = runtime.manifest?.matches ?? [];
  const mapId = str(input.mapId, runtime.selectedMap);
  const date = str(input.date, runtime.selectedDate);
  const query = str(input.query, "");

  if (input.mapId) runtime.setSelectedMap(mapId);
  if (input.date) runtime.setSelectedDate(date);
  if (input.query !== undefined) runtime.setQuery(query);

  const filtered = filterMatchSummaries(matches, mapId, date, query);
  let target: MatchSummary | undefined;

  if (action === "next" || action === "previous") {
    const index = Math.max(0, filtered.findIndex((item) => item.key === runtime.selectedMatchKey));
    const direction = action === "next" ? 1 : -1;
    target = filtered[clamp(index + direction, 0, Math.max(0, filtered.length - 1))];
  } else {
    target = findMatch(matches, input.matchKey, input.matchId) ?? filtered[0];
  }

  if ((action === "select" || action === "filter" || action === "search" || action === "next" || action === "previous") && target) {
    runtime.setSelectedMap(target.mapId);
    runtime.setSelectedDate(target.date);
    runtime.setSelectedMatchKey(target.key);
    runtime.setPlaying(false);
    runtime.setTime(0);
  }

  return {
    action,
    selectedMatchKey: target?.key ?? runtime.selectedMatchKey,
    availableMatches: filtered.length,
    target,
  };
}

function handleUserControl(runtime: LilaToolRuntime, input: Record<string, unknown>) {
  assertMatch(runtime);
  const action = str(input.action, "select");
  const actorType = optionalActorType(input.actorType);
  const participants = actorType ? runtime.match!.participants.filter((participant) => participant.type === actorType) : runtime.match!.participants;
  if (!participants.length) throw new Error(`No ${actorType ?? "matching"} participants in this match.`);

  let target: Participant | undefined;
  if (action === "clear") {
    runtime.setSelectedPlayerId("");
    return { action, selectedPlayerId: "", selectedParticipant: null };
  }

  if (input.userId) {
    target = participants.find((participant) => participant.userId === input.userId);
  } else if (action === "next" || action === "previous") {
    const index = Math.max(0, participants.findIndex((participant) => participant.userId === runtime.selectedPlayerId));
    const direction = action === "next" ? 1 : -1;
    target = participants[clamp(index + direction, 0, participants.length - 1)];
  } else {
    target = participants[0];
  }

  if (!target) throw new Error("Participant was not found.");
  runtime.setSelectedPlayerId(target.userId);
  return { action, selectedPlayerId: target.userId, selectedParticipant: summarizeParticipant(target) };
}

function handlePlaybackControl(runtime: LilaToolRuntime, input: Record<string, unknown>) {
  const action = str(input.action, "toggle");
  const step = num(input.seconds, 0.25);
  if (action === "play") runtime.setPlaying(true);
  if (action === "pause") runtime.setPlaying(false);
  if (action === "toggle") runtime.setPlaying((playing) => !playing);
  if (action === "restart") {
    runtime.setPlaying(false);
    runtime.setTime(0);
  }
  if (action === "step_forward") {
    runtime.setPlaying(false);
    runtime.setTime((time) => clamp(time + step, 0, runtime.duration));
  }
  if (action === "step_back") {
    runtime.setPlaying(false);
    runtime.setTime((time) => clamp(time - step, 0, runtime.duration));
  }
  if (action === "set_speed") {
    runtime.setPlaybackSpeed(clamp(num(input.speed, runtime.playbackSpeed), 0.1, 8));
  }
  return { action, time: runtime.time, duration: runtime.duration, playbackSpeed: action === "set_speed" ? num(input.speed, runtime.playbackSpeed) : runtime.playbackSpeed };
}

function handleTimelineControl(runtime: LilaToolRuntime, input: Record<string, unknown>) {
  assertMatch(runtime);
  const action = str(input.action, "go_to_time");
  if (action === "go_to_time") {
    const targetTime = clamp(num(input.time, runtime.time), 0, runtime.duration);
    runtime.setPlaying(false);
    runtime.setTime(targetTime);
    return { action, time: targetTime };
  }

  const event = findTimelineEvent(runtime, input);
  if (!event) throw new Error("No matching event found.");
  runtime.setPlaying(false);
  runtime.setTime(clamp(event.t, 0, runtime.duration));
  if (input.selectPlayer === true) runtime.setSelectedPlayerId(event.userId);
  return { action, time: event.t, event };
}

function handleMapViewControl(runtime: LilaToolRuntime, input: Record<string, unknown>) {
  const action = str(input.action, "reset");
  runtime.setMapView((view) => {
    if (action === "reset") return { zoom: 3, rotation: 0, x: 0, y: 0 };
    if (action === "pan") return { ...view, x: view.x + num(input.dx, 0), y: view.y + num(input.dy, 0) };
    if (action === "zoom_in") return { ...view, zoom: clamp(view.zoom + num(input.delta, 0.5), MIN_ZOOM, MAX_ZOOM) };
    if (action === "zoom_out") return { ...view, zoom: clamp(view.zoom - num(input.delta, 0.5), MIN_ZOOM, MAX_ZOOM) };
    if (action === "set_zoom") return { ...view, zoom: clamp(num(input.zoom, view.zoom), MIN_ZOOM, MAX_ZOOM) };
    if (action === "rotate") return { ...view, rotation: normalizeDegrees(num(input.rotation, view.rotation)) };
    return view;
  });
  return { action };
}

function handleMapLayerControl(runtime: LilaToolRuntime, input: Record<string, unknown>) {
  const layer = input.layer === undefined ? runtime.heatmap : String(input.layer);
  if (!heatmapValues.has(layer as HeatmapMode)) throw new Error(`Unknown layer: ${layer}`);
  runtime.setHeatmap(layer as HeatmapMode);
  if (input.toggles && typeof input.toggles === "object") {
    const requested = input.toggles as Partial<Toggles>;
    runtime.setToggles((current) => ({
      humans: typeof requested.humans === "boolean" ? requested.humans : current.humans,
      bots: typeof requested.bots === "boolean" ? requested.bots : current.bots,
      paths: typeof requested.paths === "boolean" ? requested.paths : current.paths,
      events: typeof requested.events === "boolean" ? requested.events : current.events,
    }));
  }
  return { layer, toggles: input.toggles ?? runtime.toggles };
}

async function captureMapScreenshot(runtime: LilaToolRuntime, input: Record<string, unknown>) {
  const overlay = runtime.canvasRef.current;
  const img = document.querySelector<HTMLImageElement>(".minimap");
  if (!overlay || !img) throw new Error("Map is not ready to capture.");
  if (!img.complete) await img.decode().catch(() => undefined);

  const width = Math.max(1, Math.round(overlay.clientWidth || img.clientWidth));
  const height = Math.max(1, Math.round(overlay.clientHeight || img.clientHeight));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create screenshot canvas.");
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  if (input.includeOverlay !== false) ctx.drawImage(overlay, 0, 0, width, height);
  return {
    format: "image/png",
    width,
    height,
    dataUrl: canvas.toDataURL("image/png"),
    state: getState(runtime),
  };
}

function handleEventQuery(runtime: LilaToolRuntime, input: Record<string, unknown>) {
  assertMatch(runtime);
  const fromSec = num(input.fromSec, 0);
  const toSec = num(input.toSec, runtime.duration || Number.POSITIVE_INFINITY);
  const limit = Math.max(1, Math.min(500, Math.floor(num(input.limit, 50))));
  const eventType = optionalString(input.eventType);
  const actorType = optionalActorType(input.actorType);
  const userId = optionalString(input.userId);
  const events = runtime.match!.events
    .filter((event) => event.t >= fromSec && event.t <= toSec)
    .filter((event) => !eventType || event.type === eventType)
    .filter((event) => !actorType || event.actorType === actorType)
    .filter((event) => !userId || event.userId === userId)
    .slice(0, limit);
  return {
    totalMatchedBeforeLimit: runtime.match!.events.filter((event) =>
      event.t >= fromSec &&
      event.t <= toSec &&
      (!eventType || event.type === eventType) &&
      (!actorType || event.actorType === actorType) &&
      (!userId || event.userId === userId)
    ).length,
    events,
  };
}

function handlePathQuery(runtime: LilaToolRuntime, input: Record<string, unknown>) {
  assertMatch(runtime);
  const participant = resolveParticipant(runtime, input.userId);
  if (!participant) throw new Error("No participant selected.");
  return summarizePath(participant);
}

function handleCompareLayerStats(runtime: LilaToolRuntime, input: Record<string, unknown>) {
  assertMatch(runtime);
  const participant = resolveParticipant(runtime, input.userId);
  if (!participant) throw new Error("No participant selected.");
  const layer = (optionalString(input.layer) ?? runtime.heatmap) as HeatmapMode;
  const radius = num(input.radiusPx, layer === "traffic" ? 28 : 40);
  const layerEvents = getLayerEvents(runtime.match!, layer);
  const routePoints = participant.path.filter((_, index) => index % 2 === 0);
  const hits = routePoints.filter((point) => hasNearbyEvent(point[1], point[2], layerEvents, radius)).length;
  return {
    userId: participant.userId,
    layer,
    radiusPx: radius,
    sampledPathPoints: routePoints.length,
    nearbyLayerEvents: layerEvents.length,
    overlapPointCount: hits,
    overlapPercent: routePoints.length ? Math.round((hits / routePoints.length) * 1000) / 10 : 0,
  };
}

function handleMatchSummary(runtime: LilaToolRuntime, input: Record<string, unknown>) {
  assertManifest(runtime);
  const summary = findMatch(runtime.manifest!.matches, input.matchKey, input.matchId) ??
    runtime.manifest!.matches.find((item) => item.key === runtime.selectedMatchKey);
  if (!summary) throw new Error("No match summary found.");
  const payload = summary.key === runtime.match?.key ? runtime.match : null;
  return {
    ...summary,
    loaded: !!payload,
    participantCount: payload?.participants.length,
    selectedPlayerId: runtime.selectedPlayerId || null,
    topEvents: Object.entries(summary.eventCounts).sort((a, b) => b[1] - a[1]).slice(0, 8),
  };
}

function getState(runtime: LilaToolRuntime) {
  const selectedParticipant = runtime.match?.participants.find((participant) => participant.userId === runtime.selectedPlayerId) ?? null;
  return {
    selectedMap: runtime.selectedMap,
    selectedDate: runtime.selectedDate,
    selectedMatchKey: runtime.selectedMatchKey,
    selectedPlayerId: runtime.selectedPlayerId || null,
    selectedParticipant: selectedParticipant ? summarizeParticipant(selectedParticipant) : null,
    heatmap: runtime.heatmap,
    time: runtime.time,
    duration: runtime.duration,
    playbackSpeed: runtime.playbackSpeed,
    playing: runtime.playing,
    mapView: runtime.mapView,
    toggles: runtime.toggles,
    loadedMatch: runtime.match ? {
      key: runtime.match.key,
      id: runtime.match.id,
      mapId: runtime.match.mapId,
      date: runtime.match.date,
      durationSec: runtime.match.durationSec,
      participants: runtime.match.participants.length,
      events: runtime.match.events.length,
    } : null,
  };
}

function filterMatchSummaries(matches: MatchSummary[], mapId: string, date: string, query: string) {
  const normalized = query.trim().toLowerCase();
  return matches
    .filter((item) => item.mapId === mapId)
    .filter((item) => date === "all" || item.date === date)
    .filter((item) => !normalized || item.id.toLowerCase().includes(normalized) || item.key.toLowerCase().includes(normalized))
    .sort((a, b) => b.durationSec - a.durationSec);
}

function findMatch(matches: MatchSummary[], matchKey: unknown, matchId: unknown) {
  const key = optionalString(matchKey);
  const id = optionalString(matchId);
  if (!key && !id) return undefined;
  return matches.find((item) => item.key === key || item.id === id || item.id.replace(".nakama-0", "") === id);
}

function findTimelineEvent(runtime: LilaToolRuntime, input: Record<string, unknown>) {
  const eventType = optionalString(input.eventType);
  const userId = optionalString(input.userId) ?? runtime.selectedPlayerId;
  const occurrence = str(input.occurrence, "next");
  const events = runtime.match!.events
    .filter((event) => !eventType || event.type === eventType)
    .filter((event) => !userId || event.userId === userId)
    .sort((a, b) => a.t - b.t);
  if (occurrence === "first") return events[0];
  if (occurrence === "last") return events[events.length - 1];
  if (occurrence === "previous") return [...events].reverse().find((event) => event.t < runtime.time - 0.001);
  return events.find((event) => event.t > runtime.time + 0.001) ?? events[0];
}

function resolveParticipant(runtime: LilaToolRuntime, userIdInput: unknown) {
  const userId = optionalString(userIdInput) ?? runtime.selectedPlayerId;
  return runtime.match?.participants.find((participant) => participant.userId === userId) ?? runtime.match?.participants[0] ?? null;
}

function summarizeParticipant(participant: Participant) {
  return {
    userId: participant.userId,
    type: participant.type,
    points: participant.path.length,
    events: participant.events.length,
    firstTime: participant.path[0]?.[0] ?? 0,
    lastTime: participant.path[participant.path.length - 1]?.[0] ?? 0,
  };
}

function summarizePath(participant: Participant) {
  let distanceWorld = 0;
  let idleSec = 0;
  for (let index = 1; index < participant.path.length; index += 1) {
    const previous = participant.path[index - 1];
    const current = participant.path[index];
    const distance = Math.hypot(current[3] - previous[3], current[4] - previous[4]);
    const deltaTime = Math.max(0, current[0] - previous[0]);
    distanceWorld += distance;
    if (distance < 30 && deltaTime > 0.25) idleSec += deltaTime;
  }
  const eventCounts = participant.events.reduce<Record<string, number>>((counts, event) => {
    counts[event.type] = (counts[event.type] ?? 0) + 1;
    return counts;
  }, {});
  const first = participant.path[0]?.[0] ?? 0;
  const last = participant.path[participant.path.length - 1]?.[0] ?? 0;
  return {
    userId: participant.userId,
    actorType: participant.type,
    pointCount: participant.path.length,
    durationSec: Math.max(0, last - first),
    distanceWorld: Math.round(distanceWorld),
    idleSec: Math.round(idleSec * 10) / 10,
    eventCounts,
    start: participant.path[0] ? pointToObject(participant.path[0]) : null,
    end: participant.path[participant.path.length - 1] ? pointToObject(participant.path[participant.path.length - 1]) : null,
  };
}

function getLayerEvents(match: MatchPayload, layer: HeatmapMode) {
  if (layer === "off") return [];
  if (layer === "traffic") {
    return match.participants.flatMap((participant) =>
      participant.path
        .filter((_, index) => index % 8 === 0)
        .map((point) => ({ t: point[0], type: "Traffic", userId: participant.userId, actorType: participant.type, px: point[1], py: point[2], x: point[3], z: point[4] } satisfies JourneyEvent)),
    );
  }
  const eventTypes: Record<Exclude<HeatmapMode, "traffic" | "off">, string[]> = {
    kills: ["Kill", "BotKill"],
    deaths: ["Killed", "BotKilled"],
    storm: ["KilledByStorm"],
    loot: ["Loot"],
  };
  return match.events.filter((event) => eventTypes[layer]?.includes(event.type));
}

function hasNearbyEvent(px: number, py: number, events: JourneyEvent[], radius: number) {
  const radiusSq = radius * radius;
  return events.some((event) => {
    const dx = event.px - px;
    const dy = event.py - py;
    return dx * dx + dy * dy <= radiusSq;
  });
}

function pointToObject(point: Participant["path"][number]) {
  return { t: point[0], px: point[1], py: point[2], x: point[3], z: point[4] };
}

function assertManifest(runtime: LilaToolRuntime) {
  if (!runtime.manifest) throw new Error("No manifest is loaded.");
}

function assertMatch(runtime: LilaToolRuntime) {
  if (!runtime.match) throw new Error("No match is loaded.");
}

function ok<T>(tool: AiToolName | "get_state", data: T): AiToolResult<T> {
  return { ok: true, tool, data };
}

function fail(tool: AiToolName, error: string): AiToolResult {
  return { ok: false, tool, error };
}

function str(value: unknown, fallback: string) {
  return typeof value === "string" && value.length ? value : fallback;
}

function optionalString(value: unknown) {
  return typeof value === "string" && value.length ? value : undefined;
}

function num(value: unknown, fallback: number) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function optionalActorType(value: unknown): ActorType | undefined {
  return value === "human" || value === "bot" ? value : undefined;
}
