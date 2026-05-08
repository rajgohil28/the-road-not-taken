import type { MutableRefObject } from "react";
import type { HeatmapMode, JourneyEvent, MatchPayload, Participant, Toggles } from "../types";
import { EVENT_COLORS } from "../constants";

export function drawPaths(ctx: CanvasRenderingContext2D, participants: Participant[], time: number, scale: number, toggles: Toggles) {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  for (const participant of participants) {
    if (!actorVisible(participant.type, toggles)) continue;
    let started = false;
    ctx.strokeStyle = participant.type === "human" ? "rgba(248,250,252,.62)" : "rgba(56,189,248,.38)";
    ctx.lineWidth = participant.type === "human" ? 2.2 : 1.4;
    ctx.beginPath();
    for (const point of participant.path) {
      if (point[0] > time) break;
      if (!started) {
        ctx.moveTo(point[1] * scale, point[2] * scale);
        started = true;
      } else {
        ctx.lineTo(point[1] * scale, point[2] * scale);
      }
    }
    if (started) ctx.stroke();
  }
}

export function drawCurrentPositions(ctx: CanvasRenderingContext2D, participants: Participant[], time: number, scale: number, toggles: Toggles) {
  for (const participant of participants) {
    if (!actorVisible(participant.type, toggles)) continue;
    const point = latestPoint(participant.path, time);
    if (!point) continue;
    ctx.beginPath();
    ctx.fillStyle = participant.type === "human" ? "#ffffff" : "#38bdf8";
    ctx.strokeStyle = "rgba(15,23,42,.9)";
    ctx.lineWidth = 2;
    ctx.arc(point[1] * scale, point[2] * scale, participant.type === "human" ? 4.6 : 3.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  }
}

export function drawEvents(ctx: CanvasRenderingContext2D, events: JourneyEvent[], time: number, scale: number, toggles: Toggles) {
  for (const event of events) {
    if (event.t > time || !actorVisible(event.actorType, toggles)) continue;
    const x = event.px * scale;
    const y = event.py * scale;
    ctx.beginPath();
    ctx.fillStyle = EVENT_COLORS[event.type] ?? "#ffffff";
    ctx.strokeStyle = "rgba(2,6,23,.85)";
    ctx.lineWidth = 2;
    if (event.type === "Loot") {
      ctx.rect(x - 4, y - 4, 8, 8);
    } else {
      ctx.arc(x, y, event.type === "KilledByStorm" ? 6 : 5, 0, Math.PI * 2);
    }
    ctx.fill();
    ctx.stroke();
  }
}

export function drawCachedHeatmap(
  ctx: CanvasRenderingContext2D,
  match: MatchPayload,
  mode: HeatmapMode,
  scale: number,
  toggles: Toggles,
  width: number,
  height: number,
  ratio: number,
  cacheRef: MutableRefObject<{ key: string; canvas: HTMLCanvasElement | null }>,
) {
  if (mode === "off") {
    cacheRef.current = { key: "", canvas: null };
    return;
  }

  const key = [
    match.key,
    mode,
    Math.round(width),
    Math.round(height),
    ratio,
    toggles.humans,
    toggles.bots,
  ].join(":");

  if (cacheRef.current.key !== key || !cacheRef.current.canvas) {
    const cache = document.createElement("canvas");
    cache.width = Math.round(width * ratio);
    cache.height = Math.round(height * ratio);
    const cacheCtx = cache.getContext("2d");
    if (cacheCtx) {
      cacheCtx.setTransform(ratio, 0, 0, ratio, 0, 0);
      drawHeatmap(cacheCtx, match, mode, scale, toggles);
    }
    cacheRef.current = { key, canvas: cache };
  }

  if (cacheRef.current.canvas) {
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(cacheRef.current.canvas, 0, 0);
    ctx.restore();
  }
}

function drawHeatmap(ctx: CanvasRenderingContext2D, match: MatchPayload, mode: HeatmapMode, scale: number, toggles: Toggles) {
  if (mode === "off") return;
  const points: Array<[number, number]> = [];
  if (mode === "traffic") {
    for (const participant of match.participants) {
      if (!actorVisible(participant.type, toggles)) continue;
      for (const point of participant.path) points.push([point[1], point[2]]);
    }
  } else {
    for (const event of match.events) {
      if (!actorVisible(event.actorType, toggles)) continue;
      if (mode === "kills" && !["Kill", "BotKill"].includes(event.type)) continue;
      if (mode === "deaths" && !["Killed", "BotKilled", "KilledByStorm"].includes(event.type)) continue;
      if (mode === "storm" && event.type !== "KilledByStorm") continue;
      if (mode === "loot" && event.type !== "Loot") continue;
      points.push([event.px, event.py]);
    }
  }

  if (points.length === 0) return;

  const particleRadius = 26 * scale;
  const particleSize = particleRadius * 2;
  const particle = document.createElement("canvas");
  particle.width = particleSize;
  particle.height = particleSize;
  const pctx = particle.getContext("2d");
  if (pctx) {
    const gradient = pctx.createRadialGradient(particleRadius, particleRadius, 0, particleRadius, particleRadius, particleRadius);
    gradient.addColorStop(0, "rgba(255, 90, 95, .28)");
    gradient.addColorStop(0.42, "rgba(255, 209, 102, .16)");
    gradient.addColorStop(1, "rgba(255, 209, 102, 0)");
    pctx.fillStyle = gradient;
    pctx.fillRect(0, 0, particleSize, particleSize);
  }

  for (const [px, py] of points) {
    ctx.drawImage(particle, px * scale - particleRadius, py * scale - particleRadius, particleSize, particleSize);
  }
}

export function latestPoint(path: Participant["path"], time: number) {
  let best: Participant["path"][number] | null = null;
  for (const point of path) {
    if (point[0] > time) break;
    best = point;
  }
  return best;
}

export function actorVisible(type: "human" | "bot", toggles: Toggles) {
  return type === "human" ? toggles.humans : toggles.bots;
}