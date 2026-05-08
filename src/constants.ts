import type { HeatmapMode } from "./types";

export const MAP_SIZE = 1024;
export const MIN_ZOOM = 1.5;
export const MAX_ZOOM = 8;
export const SPEED_OPTIONS = [0.25, 0.5, 1, 1.5];

export const EVENT_COLORS: Record<string, string> = {
  Kill: "#ff405c",
  Killed: "#ffd166",
  BotKill: "#ff8c42",
  BotKilled: "#2dd4bf",
  KilledByStorm: "#a78bfa",
  Loot: "#7dd3fc",
};

export const HEATMAP_OPTIONS: Array<{ value: HeatmapMode; label: string; image?: string }> = [
  { value: "traffic", label: "Traffic", image: "/images/traffick-map.png" },
  { value: "kills", label: "Kills", image: "/images/kill-map.png" },
  { value: "deaths", label: "Deaths" },
  { value: "storm", label: "Storm", image: "/images/storm-map.png" },
  { value: "loot", label: "Loot", image: "/images/loot-map.png" },
  { value: "off", label: "Off" },
];