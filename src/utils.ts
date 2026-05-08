import type { ActorType, MatchSummary } from "./types";

export function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

export function formatTime(value: number) {
  if (value < 60) {
    return `${value.toFixed(value < 10 ? 2 : 1)}s`;
  }
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export function formatMapName(value: string) {
  return value.replace(/([a-z])([A-Z])/g, "$1 $2");
}

export function formatDateLabel(value: string) {
  if (value === "all") return "All dates";
  if (value === "uploaded") return "Uploaded";
  
  const date = new Date(`${value}T00:00:00`);
  if (isNaN(date.getTime())) {
    return value.charAt(0).toUpperCase() + value.slice(1);
  }
  
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

export function formatMatchLabel(item: MatchSummary, actorType = item.primaryActorType) {
  return `${item.id.replace(".nakama-0", "").slice(0, 8)} · ${formatActorType(actorType)} player`;
}

export function formatActorType(actorType?: ActorType) {
  if (actorType === "human") return "Human";
  if (actorType === "bot") return "Bot";
  return "Loading";
}

export function getMatchBadge(item: MatchSummary) {
  if ((item.eventCounts.KilledByStorm ?? 0) > 0) return { label: "Storm", tone: "storm" };
  if (item.humanCount > 0 && item.botCount > 0) return { label: "Mixed", tone: "mixed" };
  if (item.humanCount > 0) return { label: "Human", tone: "human" };
  return { label: "Bot", tone: "bot" };
}

export function getTimelinePercent(value: number, duration: number) {
  if (!duration) return 0;
  return clamp((value / duration) * 100, 0, 100);
}

export function getTimelineEventTone(type: string) {
  if (type === "KilledByStorm") return "storm";
  if (type === "Killed" || type === "BotKilled") return "death";
  if (type === "Kill" || type === "BotKill") return "kill";
  return "traffic";
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export function normalizeDegrees(value: number) {
  return ((value % 360) + 360) % 360;
}

export function shortestAngleDelta(a: number, b: number) {
  return ((a - b + 540) % 360) - 180;
}
