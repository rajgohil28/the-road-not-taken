import type { MutableRefObject } from "react";
import type { HeatmapMode, JourneyEvent, MatchPayload, Participant, Toggles } from "../types";
import { EVENT_COLORS } from "../constants";

export function drawPaths(ctx: CanvasRenderingContext2D, participants: Participant[], time: number, scale: number, toggles: Toggles, zoom: number = 1) {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  const zScale = Math.max(1, Math.sqrt(zoom));
  for (const participant of participants) {
    if (!actorVisible(participant.type, toggles)) continue;
    let started = false;
    
    if (participant.type === "human") {
      ctx.strokeStyle = "rgba(255, 255, 255, 0.85)";
      ctx.lineWidth = 2.5 / zScale;
      ctx.shadowColor = "rgba(255, 255, 255, 0.6)";
      ctx.shadowBlur = 8 / zScale;
    } else {
      ctx.strokeStyle = "rgba(56, 189, 248, 0.45)";
      ctx.lineWidth = 1.5 / zScale;
      ctx.shadowColor = "rgba(56, 189, 248, 0.4)";
      ctx.shadowBlur = 5 / zScale;
    }

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
    
    // Reset shadow so it doesn't bleed into other draw calls
    ctx.shadowBlur = 0;
  }
}

export function drawCurrentPositions(ctx: CanvasRenderingContext2D, participants: Participant[], time: number, scale: number, toggles: Toggles, zoom: number = 1) {
  const zScale = Math.max(1, Math.sqrt(zoom));
  for (const participant of participants) {
    if (!actorVisible(participant.type, toggles)) continue;
    const point = latestPoint(participant.path, time);
    if (!point) continue;
    
    ctx.beginPath();
    if (participant.type === "human") {
      ctx.fillStyle = "#ffffff";
      ctx.strokeStyle = "rgba(10, 132, 255, 0.9)"; // vivid blue rim
      ctx.lineWidth = 2.5 / zScale;
      ctx.shadowColor = "rgba(10, 132, 255, 0.8)";
      ctx.shadowBlur = 12 / zScale;
      ctx.arc(point[1] * scale, point[2] * scale, 5.5 / zScale, 0, Math.PI * 2);
    } else {
      ctx.fillStyle = "#38bdf8";
      ctx.strokeStyle = "rgba(2, 6, 23, 0.9)";
      ctx.lineWidth = 2 / zScale;
      ctx.shadowColor = "rgba(56, 189, 248, 0.6)";
      ctx.shadowBlur = 8 / zScale;
      ctx.arc(point[1] * scale, point[2] * scale, 4 / zScale, 0, Math.PI * 2);
    }
    
    ctx.fill();
    ctx.stroke();
    
    // Reset shadow
    ctx.shadowBlur = 0;
  }
}

export function drawEvents(ctx: CanvasRenderingContext2D, events: JourneyEvent[], time: number, scale: number, toggles: Toggles, zoom: number = 1) {
  const zScale = Math.max(1, zoom);
  for (const event of events) {
    if (event.t > time || !actorVisible(event.actorType, toggles)) continue;
    const x = event.px * scale;
    const y = event.py * scale;
    ctx.beginPath();
    ctx.fillStyle = EVENT_COLORS[event.type] ?? "#ffffff";
    ctx.strokeStyle = "rgba(2,6,23,.85)";
    ctx.lineWidth = 2 / zScale;
    if (event.type === "Loot") {
      const s = 8 / zScale;
      ctx.rect(x - s / 2, y - s / 2, s, s);
    } else {
      const r = (event.type === "KilledByStorm" ? 6 : 5) / zScale;
      ctx.arc(x, y, r, 0, Math.PI * 2);
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
    ctx.drawImage(
      cacheRef.current.canvas, 
      0, 0, cacheRef.current.canvas.width, cacheRef.current.canvas.height, 
      0, 0, ctx.canvas.width, ctx.canvas.height
    );
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