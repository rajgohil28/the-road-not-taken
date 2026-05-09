import { Gauge, Pause, Play, RefreshCcw, SkipBack, SkipForward, User } from "lucide-react";
import type { JourneyEvent } from "../types";
import { SPEED_OPTIONS } from "../constants";
import { formatTime, getTimelinePercent, getTimelineEventTone } from "../utils";

export interface PlaybackPanelProps {
  timelineVisible: boolean;
  onMouseEnterTimeline: () => void;
  onMouseLeaveTimeline: () => void;
  time: number;
  duration: number;
  onTimelinePointerDown: (e: React.PointerEvent<HTMLDivElement>) => void;
  onTimelinePointerMove: (e: React.PointerEvent<HTMLDivElement>) => void;
  onTimelinePointerUp: (e: React.PointerEvent<HTMLDivElement>) => void;
  onTimeChange: (time: number) => void;
  selectedEvents: JourneyEvent[];
  onHoverEvent: (event: JourneyEvent | null) => void;
  onOpenMobileSettings: () => void;
  playing: boolean;
  onTogglePlay: () => void;
  onReset: () => void;
  onStepBack: () => void;
  onStepForward: () => void;
  hasMatch: boolean;
  playbackSpeed: number;
  onSpeedChange: (speed: number) => void;
}

export function PlaybackPanel({
  timelineVisible,
  onMouseEnterTimeline,
  onMouseLeaveTimeline,
  time,
  duration,
  onTimelinePointerDown,
  onTimelinePointerMove,
  onTimelinePointerUp,
  onTimeChange,
  selectedEvents,
  onHoverEvent,
  onOpenMobileSettings,
  playing,
  onTogglePlay,
  onReset,
  onStepBack,
  onStepForward,
  hasMatch,
  playbackSpeed,
  onSpeedChange,
}: PlaybackPanelProps) {
  return (
    <div className={`bottomPanels ${timelineVisible ? "timeline-visible" : ""} ${hasMatch ? "has-match" : ""}`.trim()}>
      <div className="floatingTimeline"
        onMouseEnter={onMouseEnterTimeline}
        onMouseLeave={onMouseLeaveTimeline}
      >
        <span className="timelineTime">{formatTime(time)}</span>
        <div
          className="timelineRail"
          onPointerDown={onTimelinePointerDown}
          onPointerMove={onTimelinePointerMove}
          onPointerUp={onTimelinePointerUp}
          onPointerCancel={onTimelinePointerUp}
        >
          <div className="playedProgress" style={{ width: `${getTimelinePercent(time, duration)}%` }} />
          <div className="timelinePlayhead" style={{ left: `${getTimelinePercent(time, duration)}%` }} />
          <input
            type="range"
            min={0}
            max={Math.max(0.001, duration)}
            step={duration < 1 ? 0.001 : 0.25}
            value={Math.min(time, duration)}
            onChange={(e) => onTimeChange(Number(e.target.value))}
          />
          <div className="eventTicks">
            {selectedEvents.map((event, index) => {
              const percent = getTimelinePercent(event.t, duration);
              const className = `tick ${getTimelineEventTone(event.type)}`;
              
              return (
                <div 
                  key={index} 
                  className={className} 
                  style={{ left: `${percent}%` }}
                  onMouseEnter={() => onHoverEvent(event)}
                  onMouseLeave={() => onHoverEvent(null)}
                />
              );
            })}
          </div>
        </div>
        <span className="timelineTime duration">{formatTime(duration)}</span>
      </div>

      <div 
        className="playbackControls"
        onMouseEnter={onMouseEnterTimeline}
        onMouseLeave={onMouseLeaveTimeline}
      >
        <button
          className="iconButton mobileSettingsButton"
          type="button"
          aria-label="Profile"
          onClick={onOpenMobileSettings}
        >
          <User size={18} />
        </button>
        <div className="transportGroup">
          <button className={`playButton ${playing ? "active" : ""}`} onClick={onTogglePlay} disabled={!hasMatch} data-tooltip={playing ? "Pause" : "Play"}>
            {playing ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
          </button>
          <button className="iconButton" onClick={onReset} disabled={!hasMatch} data-tooltip="Reset">
            <RefreshCcw size={18} />
          </button>
          <button className="iconButton" onClick={onStepBack} disabled={!hasMatch} data-tooltip="Step Back">
            <SkipBack size={18} />
          </button>
          <button className="iconButton" onClick={onStepForward} disabled={!hasMatch} data-tooltip="Step Forward">
            <SkipForward size={18} />
          </button>
        </div>
        <label className={`speedControl ${!hasMatch ? "disabled" : ""}`}>
          <Gauge size={14} />
          <span>{playbackSpeed.toFixed(1)}x</span>
          <select value={playbackSpeed} onChange={(e) => onSpeedChange(Number(e.target.value))} disabled={!hasMatch}>
            {SPEED_OPTIONS.map((speed) => <option key={speed} value={speed}>{speed.toFixed(1)}x</option>)}
          </select>
        </label>
      </div>
    </div>
  );
}