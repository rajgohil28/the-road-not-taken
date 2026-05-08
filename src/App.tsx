import { useCallback, useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
import {
  CalendarDays,
  ChevronDown,
  PanelLeft,
  PanelRight,
  Gauge,
  Map as MapIcon,
  Minus,
  Pause,
  Play,
  Plus,
  RefreshCcw,
  Search,
  SkipBack,
  SkipForward,
  Sun,
  Trash2,
  Upload,
  X,
} from "lucide-react";
import { ingestRawParquetFiles } from "./dataIngest";
import type { HeatmapMode, JourneyEvent, Manifest, MatchPayload, MatchSummary, Participant } from "./types";

const MAP_SIZE = 1024;
const MIN_ZOOM = 0.5;
const MAX_ZOOM = 6;
const SPEED_OPTIONS = [0.25, 0.5, 1, 1.5];
const EVENT_COLORS: Record<string, string> = {
  Kill: "#ff405c",
  Killed: "#ffd166",
  BotKill: "#ff8c42",
  BotKilled: "#2dd4bf",
  KilledByStorm: "#a78bfa",
  Loot: "#7dd3fc",
};

const HEATMAP_OPTIONS: Array<{ value: HeatmapMode; label: string; image?: string }> = [
  { value: "traffic", label: "Traffic", image: "/images/traffick-map.png" },
  { value: "kills", label: "Kills", image: "/images/kill-map.png" },
  { value: "deaths", label: "Deaths" },
  { value: "storm", label: "Storm", image: "/images/storm-map.png" },
  { value: "loot", label: "Loot", image: "/images/loot-map.png" },
  { value: "off", label: "Off" },
];

interface Toggles {
  humans: boolean;
  bots: boolean;
  paths: boolean;
  events: boolean;
}

interface UploadedDataset {
  manifest: Manifest;
  matches: Map<string, MatchPayload>;
}

export function App() {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [match, setMatch] = useState<MatchPayload | null>(null);
  const [uploadedDataset, setUploadedDataset] = useState<UploadedDataset | null>(null);
  const [uploadStatus, setUploadStatus] = useState("Bundled dataset loaded from public/data.");
  const [selectedMap, setSelectedMap] = useState("AmbroseValley");
  const [selectedDate, setSelectedDate] = useState("all");
  const [selectedMatchKey, setSelectedMatchKey] = useState("");
  const [query, setQuery] = useState("");
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [selectedPlayerId, setSelectedPlayerId] = useState("");
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [heatmap, setHeatmap] = useState<HeatmapMode>("traffic");
  const [showLayerPanel, setShowLayerPanel] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [themeMode, setThemeMode] = useState<"light" | "dark">("dark");
  const [timelineVisible, setTimelineVisible] = useState(false);
  const [mapView, setMapView] = useState({ zoom: 1, rotation: 0, x: 0, y: 0 });
  const [hoveredEvent, setHoveredEvent] = useState<JourneyEvent | null>(null);
  const [toggles, setToggles] = useState<Toggles>({ humans: true, bots: true, paths: true, events: true });
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const heatmapCacheRef = useRef<{ key: string; canvas: HTMLCanvasElement | null }>({ key: "", canvas: null });
  const mapShellRef = useRef<HTMLDivElement | null>(null);
  const folderInputRef = useRef<HTMLInputElement | null>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number; originX: number; originY: number } | null>(null);
  const timelineDragRef = useRef<number | null>(null);
  const compassDragRef = useRef<number | null>(null);
  const compassFrameRef = useRef<number | null>(null);
  const pendingCompassAngleRef = useRef<number | null>(null);
  const lastCompassAngleRef = useRef(0);

  const applyManifest = useCallback((data: Manifest) => {
    setManifest(data);
    const first = data.matches[0];
    if (first) {
      setSelectedMap(first.mapId);
      setSelectedDate(first.date);
      setSelectedMatchKey(first.key);
    }
  }, []);

  const loadBundledDataset = useCallback(() => {
    setUploadedDataset(null);
    setMatch(null);
    setTime(0);
    setPlaying(false);
    fetch("/data/manifest.json")
      .then((response) => {
        if (!response.ok) throw new Error("Missing generated data. Run scripts/preprocess_data.py first.");
        return response.json();
      })
      .then((data: Manifest) => {
        applyManifest(data);
        setUploadStatus("Bundled dataset loaded from public/data.");
      })
      .catch(() => {
        setManifest(null);
        setUploadStatus("No bundled dataset found. Run preprocessing or upload a processed dataset.");
      });
  }, [applyManifest]);

  useEffect(() => {
    loadBundledDataset();
  }, [loadBundledDataset]);

  useEffect(() => {
    folderInputRef.current?.setAttribute("webkitdirectory", "");
    folderInputRef.current?.setAttribute("directory", "");
  }, []);

  const filteredMatches = useMemo(() => {
    if (!manifest) return [];
    const normalized = query.trim().toLowerCase();
    return manifest.matches
      .filter((item) => item.mapId === selectedMap)
      .filter((item) => selectedDate === "all" || item.date === selectedDate)
      .filter((item) => !normalized || item.id.toLowerCase().includes(normalized) || item.key.toLowerCase().includes(normalized))
      .sort((a, b) => b.durationSec - a.durationSec);
  }, [manifest, query, selectedDate, selectedMap]);

  useEffect(() => {
    if (!filteredMatches.length) {
      setSelectedMatchKey("");
      return;
    }
    if (!filteredMatches.some((item) => item.key === selectedMatchKey)) {
      setSelectedMatchKey(filteredMatches[0].key);
    }
  }, [filteredMatches, selectedMatchKey]);

  useEffect(() => {
    if (!selectedMatchKey) return;
    setMatch(null);
    setTime(0);
    setPlaying(false);
    if (uploadedDataset) {
      const uploadedMatch = uploadedDataset.matches.get(selectedMatchKey);
      if (uploadedMatch) {
        setMatch(uploadedMatch);
        setTime(0);
      } else {
        setUploadStatus(`Uploaded dataset is missing match file for ${selectedMatchKey}.`);
      }
      return;
    }
    fetch(`/data/matches/${selectedMatchKey}.json`)
      .then((response) => response.json())
      .then((payload: MatchPayload) => {
        setMatch(payload);
        setTime(0);
      });
  }, [selectedMatchKey, uploadedDataset]);

  const handleUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;
    setUploadStatus(`Reading ${files.length} uploaded files...`);
    try {
      const dataset = await parseUploadedDataset(files);
      setUploadedDataset(dataset);
      applyManifest(dataset.manifest);
      setMatch(null);
      setTime(0);
      setPlaying(false);
      setUploadStatus(`Upload loaded: ${dataset.manifest.matches.length} matches, ${dataset.manifest.stats.diagnostics?.rows_seen ?? 0} rows.`);
    } catch (error) {
      setUploadStatus(error instanceof Error ? error.message : "Could not read uploaded dataset.");
    } finally {
      event.target.value = "";
    }
  }, [applyManifest]);

  const selectedSummary = useMemo(
    () => manifest?.matches.find((item) => item.key === selectedMatchKey),
    [manifest, selectedMatchKey],
  );

  const duration = match?.durationSec ?? selectedSummary?.durationSec ?? 0;
  const selectedParticipant = useMemo(
    () => match?.participants.find((participant) => participant.userId === selectedPlayerId) ?? null,
    [match, selectedPlayerId],
  );
  const selectedEvents = useMemo(
    () => match?.events.filter((event) => !selectedPlayerId || event.userId === selectedPlayerId) ?? [],
    [match, selectedPlayerId],
  );

  useEffect(() => {
    if (!match?.participants.length) {
      setSelectedPlayerId("");
      return;
    }
    setSelectedPlayerId((current) => {
      if (match.participants.some((participant) => participant.userId === current)) return current;
      return match.participants[0].userId;
    });
  }, [match]);

  useEffect(() => {
    if (!playing || !match) return;
    let animation = 0;
    let last = performance.now();
    const tick = (now: number) => {
      if (now - last < 33) {
        animation = requestAnimationFrame(tick);
        return;
      }
      const delta = (now - last) / 1000;
      last = now;
      setTime((current) => {
        const baseRate = Math.max(match.durationSec / 6, 0.02);
        const next = current + delta * baseRate * playbackSpeed;
        if (next >= match.durationSec) {
          setPlaying(false);
          return match.durationSec;
        }
        return next;
      });
      animation = requestAnimationFrame(tick);
    };
    animation = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(animation);
  }, [match, playing, playbackSpeed]);

  const stepBack = () => setTime((t) => Math.max(0, t - 0.1));
  const stepForward = () => setTime((t) => Math.min(duration, t + 0.1));

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas || !match) return;
    const rect = { width: canvas.clientWidth, height: canvas.clientHeight };
    const ratio = window.devicePixelRatio || 1;
    const targetWidth = Math.round(rect.width * ratio);
    const targetHeight = Math.round(rect.height * ratio);

    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
    }

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, rect.width, rect.height);
    const scale = rect.width / MAP_SIZE;
    drawCachedHeatmap(ctx, match, heatmap, scale, toggles, rect.width, rect.height, ratio, heatmapCacheRef);
    const participantsToDraw = selectedParticipant ? [selectedParticipant] : match.participants;
    if (toggles.paths) drawPaths(ctx, participantsToDraw, time, scale, toggles);
    if (toggles.events) drawEvents(ctx, selectedPlayerId ? selectedEvents : match.events, time, scale, toggles);
    drawCurrentPositions(ctx, participantsToDraw, time, scale, toggles);
  }, [heatmap, match, selectedEvents, selectedParticipant, selectedPlayerId, time, toggles]);

  useEffect(() => {
    draw();
    window.addEventListener("resize", draw);
    return () => window.removeEventListener("resize", draw);
  }, [draw]);

  const mapImage = manifest?.maps.find((item) => item.id === selectedMap)?.image;
  const mapTransform = {
    transform: `translate(-50%, -50%) translate(${mapView.x}px, ${mapView.y}px) rotate(${mapView.rotation}deg) scale(${mapView.zoom})`,
  };
  const constrainMapView = useCallback((view: typeof mapView) => {
    const shell = mapShellRef.current;
    if (!shell) return view;
    const overpan = 72;
    const maxX = (Math.abs(view.zoom - 1) * shell.clientWidth) / 2 + overpan;
    const maxY = (Math.abs(view.zoom - 1) * shell.clientHeight) / 2 + overpan;
    return {
      ...view,
      x: clamp(view.x, -maxX, maxX),
      y: clamp(view.y, -maxY, maxY),
    };
  }, []);
  const updateZoom = useCallback((delta: number) => {
    setMapView((value) => constrainMapView({ ...value, zoom: clamp(value.zoom + delta, MIN_ZOOM, MAX_ZOOM) }));
  }, [constrainMapView]);
  const rotateMapFromPointer = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const centerX = rect.left + rect.width / 2;
    const centerY = rect.top + rect.height / 2;
    const angle = normalizeDegrees(Math.atan2(event.clientY - centerY, event.clientX - centerX) * 180 / Math.PI + 90);
    if (Math.abs(shortestAngleDelta(angle, lastCompassAngleRef.current)) < 1.5) return;
    pendingCompassAngleRef.current = angle;
    if (compassFrameRef.current !== null) return;
    compassFrameRef.current = requestAnimationFrame(() => {
      compassFrameRef.current = null;
      const nextAngle = pendingCompassAngleRef.current;
      if (nextAngle === null) return;
      pendingCompassAngleRef.current = null;
      lastCompassAngleRef.current = nextAngle;
      setMapView((value) => constrainMapView({ ...value, rotation: nextAngle }));
    });
  }, [constrainMapView]);
  const handleCompassPointerDown = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    compassDragRef.current = event.pointerId;
    rotateMapFromPointer(event);
  }, [rotateMapFromPointer]);
  const handleCompassPointerMove = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    if (compassDragRef.current !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    rotateMapFromPointer(event);
  }, [rotateMapFromPointer]);
  const handleCompassPointerUp = useCallback((event: React.PointerEvent<HTMLButtonElement>) => {
    if (compassDragRef.current === event.pointerId) compassDragRef.current = null;
    event.stopPropagation();
  }, []);
  useEffect(() => () => {
    if (compassFrameRef.current !== null) cancelAnimationFrame(compassFrameRef.current);
  }, []);
  useEffect(() => {
    const shell = mapShellRef.current;
    if (!shell) return;
    const onWheel = (event: WheelEvent) => {
      if (event.cancelable) {
        event.preventDefault();
      }
      setMapView((value) => constrainMapView({ ...value, zoom: clamp(value.zoom + (event.deltaY < 0 ? 0.08 : -0.08), MIN_ZOOM, MAX_ZOOM) }));
    };
    shell.addEventListener("wheel", onWheel, { passive: false });
    return () => shell.removeEventListener("wheel", onWheel);
  }, [constrainMapView]);

  const handlePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, originX: mapView.x, originY: mapView.y };
  }, [mapView.x, mapView.y]);
  const handlePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setMapView((value) => constrainMapView({
      ...value,
      x: drag.originX + event.clientX - drag.x,
      y: drag.originY + event.clientY - drag.y,
    }));
  }, [constrainMapView]);
  const handlePointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  }, []);
  const scrubTimelineFromPointer = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (!duration) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const percent = clamp((event.clientX - rect.left) / rect.width, 0, 1);
    setTime(percent * duration);
  }, [duration]);
  const handleTimelinePointerDown = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.stopPropagation();
    event.currentTarget.setPointerCapture(event.pointerId);
    timelineDragRef.current = event.pointerId;
    setPlaying(false);
    scrubTimelineFromPointer(event);
  }, [scrubTimelineFromPointer]);
  const handleTimelinePointerMove = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (timelineDragRef.current !== event.pointerId) return;
    event.preventDefault();
    event.stopPropagation();
    scrubTimelineFromPointer(event);
  }, [scrubTimelineFromPointer]);
  const handleTimelinePointerUp = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (timelineDragRef.current === event.pointerId) timelineDragRef.current = null;
    event.stopPropagation();
  }, []);

  return (
    <main className={`app ${themeMode === "dark" ? "darkMode" : "lightMode"} ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <SidebarPanel
        collapsed={sidebarCollapsed}
        filteredMatches={filteredMatches}
        manifest={manifest}
        query={query}
        selectedDate={selectedDate}
        selectedMatchKey={selectedMatchKey}
        onDateChange={setSelectedDate}
        onQueryChange={setQuery}
        onReset={loadBundledDataset}
        onSelectMatch={setSelectedMatchKey}
        onToggleCollapsed={() => setSidebarCollapsed((value) => !value)}
      />

      <section className="workspace">
        <header className="topbar">
          <button
            className="roundIcon themeToggle"
            title="Dark and light mode selector"
            onClick={() => setThemeMode((value) => value === "light" ? "dark" : "light")}
          >
            <Sun size={24} />
          </button>
          <label className="levelSelect" aria-label="Level select">
            <span>{formatMapName(selectedMap)}</span>
            <ChevronDown size={18} />
            <select value={selectedMap} onChange={(event) => setSelectedMap(event.target.value)}>
              {manifest?.maps.map((item) => <option key={item.id} value={item.id}>{formatMapName(item.id)}</option>)}
            </select>
          </label>
          <label className="floatingUpload" title="Upload dataset" aria-label="Upload dataset">
            <Upload size={18} />
            <input type="file" multiple onChange={handleUpload} />
          </label>
        </header>

        {showLayerPanel && (
          <div className="modeCards" aria-label="Map layer modes">
            <button className="modeCloseButton" type="button" title="Close map layers" onClick={() => setShowLayerPanel(false)}>
              <X size={13} />
            </button>
            {HEATMAP_OPTIONS.filter((option) => option.image).map((option) => (
              <button
                key={option.value}
                className={heatmap === option.value ? "modeCard active" : "modeCard"}
                type="button"
                aria-pressed={heatmap === option.value}
                onClick={() => setHeatmap(option.value)}
              >
                <img className="modePreview" src={option.image} alt="" draggable={false} />
                <strong>{option.label}</strong>
              </button>
            ))}
          </div>
        )}

        <div
          className="mapShell"
          ref={mapShellRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
        >
          {mapImage ? (
            <>
              <div className="mapContent" style={mapTransform} aria-label={`${selectedMap} minimap`}>
                <img className="minimap" src={`/minimaps/${mapImage}`} alt="" draggable={false} onLoad={draw} />
                <canvas ref={canvasRef} className="overlay" />
              </div>
              <div className="mapTools" aria-label="Map tools" onPointerDown={(event) => event.stopPropagation()}>
                <button
                  className={showLayerPanel ? "active" : ""}
                  title="Map layers"
                  onClick={() => setShowLayerPanel((value) => !value)}
                >
                  <MapIcon size={16} />
                </button>
                <div className="zoomGroup">
                  <button title="Zoom in" onClick={() => updateZoom(0.18)}><Plus size={16} /></button>
                  <button title="Zoom out" onClick={() => updateZoom(-0.18)}><Minus size={16} /></button>
                </div>
                <button
                  className="compassControl"
                  title="Drag to rotate map"
                  onPointerDown={handleCompassPointerDown}
                  onPointerMove={handleCompassPointerMove}
                  onPointerUp={handleCompassPointerUp}
                  onPointerCancel={handleCompassPointerUp}
                >
                  <span className="compassRose" style={{ transform: `rotate(${mapView.rotation}deg)` }}>
                    <b className="north">N</b>
                    <b className="east">E</b>
                    <b className="south">S</b>
                    <b className="west">W</b>
                    <i />
                  </span>
                </button>
              </div>
            </>
          ) : (
            <div className="emptyState">Run preprocessing to load map data.</div>
          )}
        </div>

        <div
          className={timelineVisible ? "bottomPanels timeline-visible" : "bottomPanels"}
          onMouseEnter={() => setTimelineVisible(true)}
          onMouseLeave={() => setTimelineVisible(false)}
        >
          <div className="floatingTimeline">
            <span className="timelineTime">{formatTime(time)}</span>
            <div
              className="timelineRail"
              onPointerDown={handleTimelinePointerDown}
              onPointerMove={handleTimelinePointerMove}
              onPointerUp={handleTimelinePointerUp}
              onPointerCancel={handleTimelinePointerUp}
            >
              <div className="playedProgress" style={{ width: `${getTimelinePercent(time, duration)}%` }} />
              <div className="timelinePlayhead" style={{ left: `${getTimelinePercent(time, duration)}%` }} />
              <input
                type="range"
                min={0}
                max={Math.max(0.001, duration)}
                step={duration < 1 ? 0.001 : 0.25}
                value={Math.min(time, duration)}
                onChange={(event) => setTime(Number(event.target.value))}
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
                      onMouseEnter={() => setHoveredEvent(event)}
                      onMouseLeave={() => setHoveredEvent(null)}
                    />
                  );
                })}
              </div>
            </div>
            <span className="timelineTime duration">{formatTime(duration)}</span>
          </div>

          <div className="playbackControls">
            <div className="transportGroup">
              <button className={`playButton ${playing ? "active" : ""}`} onClick={() => setPlaying((value) => !value)} disabled={!match} title={playing ? "Pause" : "Play"}>
                {playing ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
              </button>
              <button className="iconButton" onClick={() => setTime(0)} disabled={!match} title="Reset">
                <RefreshCcw size={18} />
              </button>
              <button className="iconButton" onClick={stepBack} disabled={!match} title="Step Back">
                <SkipBack size={18} />
              </button>
              <button className="iconButton" onClick={stepForward} disabled={!match} title="Step Forward">
                <SkipForward size={18} />
              </button>
            </div>
            <label className="speedControl">
              <Gauge size={14} />
              <span>{playbackSpeed.toFixed(1)}x</span>
              <select value={playbackSpeed} onChange={(event) => setPlaybackSpeed(Number(event.target.value))}>
                {SPEED_OPTIONS.map((speed) => <option key={speed} value={speed}>{speed.toFixed(1)}x</option>)}
              </select>
            </label>
          </div>
        </div>

        {hoveredEvent && (
          <div className="eventInfoCard">
            <div className="eventHeader">
              <span className={`eventBadge ${hoveredEvent.type.toLowerCase().includes("kill") ? "kill" : hoveredEvent.type.toLowerCase().includes("killed") ? "death" : "loot"}`}>
                {hoveredEvent.type}
              </span>
              <span className="eventTime">{formatTime(hoveredEvent.t)}</span>
            </div>
            <div className="eventBody">
              <strong>{hoveredEvent.actorType === "human" ? "Human" : "Bot"}</strong>
              <span>{hoveredEvent.userId.slice(0, 12)}...</span>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}

interface SidebarPanelProps {
  collapsed: boolean;
  filteredMatches: MatchSummary[];
  manifest: Manifest | null;
  query: string;
  selectedDate: string;
  selectedMatchKey: string;
  onDateChange: (value: string) => void;
  onQueryChange: (value: string) => void;
  onReset: () => void;
  onSelectMatch: (key: string) => void;
  onToggleCollapsed: () => void;
}

function SidebarPanel({
  collapsed,
  filteredMatches,
  manifest,
  query,
  selectedDate,
  selectedMatchKey,
  onDateChange,
  onQueryChange,
  onReset,
  onSelectMatch,
  onToggleCollapsed,
}: SidebarPanelProps) {
  const visibleMatches = filteredMatches.slice(0, 8);

  return (
    <aside className={collapsed ? "sidebar collapsed" : "sidebar"}>
      <div className="sidebarHeader">
        <h2>Matches</h2>
        <div className="sidebarActions">
          {!collapsed && (
            <button className="sidebarIconButton danger" type="button" aria-label="Delete">
              <Trash2 size={15} />
            </button>
          )}
          <button
            className="sidebarIconButton"
            type="button"
            title={collapsed ? "Expand side panel" : "Collapse side panel"}
            onClick={onToggleCollapsed}
          >
            {collapsed ? <PanelRight size={15} /> : <PanelLeft size={15} />}
          </button>
        </div>
      </div>

      {!collapsed && (
        <>
          <div className="playerSegment" aria-label="Panel mode">
            <button className="active" type="button" aria-pressed="true">
              Matches
            </button>
            <button type="button" aria-pressed="false">
              AI
            </button>
          </div>

          <div className="matchSearchTools">
            <label className="searchBox">
              <Search size={14} />
              <input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Search" />
            </label>
            <label className="dateControl">
              <CalendarDays size={14} />
              <span>{selectedDate === "all" ? "All dates" : formatDateLabel(selectedDate)}</span>
              <select value={selectedDate} onChange={(event) => onDateChange(event.target.value)} aria-label="Date filter">
                <option value="all">All dates</option>
                {manifest?.dates.map((date) => <option key={date} value={date}>{formatDateLabel(date)}</option>)}
              </select>
            </label>
          </div>

          <div className="sidebarMatchList">
            <div className="sidebarTableHeader">
              <strong>Match / Player ID</strong>
              <strong>Killed By</strong>
            </div>
            <div className="sidebarRows">
              {visibleMatches.map((item) => {
                const badge = getMatchBadge(item);
                return (
                  <button
                    key={item.key}
                    className={item.key === selectedMatchKey ? "sidebarMatchRow active" : "sidebarMatchRow"}
                    type="button"
                    onClick={() => onSelectMatch(item.key)}
                  >
                    <span className="sidebarMatchCopy">
                      <strong>{formatMatchLabel(item)}</strong>
                      <em>{formatMapName(item.mapId)} · {formatTime(item.durationSec)} · {formatNumber(item.pathPointCount)} pts</em>
                    </span>
                    <span className={`rowBadge ${badge.tone}`}>{badge.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="sidebarFooter">
            <span>{formatNumber(manifest?.stats.diagnostics.rows_seen ?? 0)} rows</span>
            <button type="button" onClick={onReset}>Reset</button>
          </div>
        </>
      )}
    </aside>
  );
}

function drawPaths(ctx: CanvasRenderingContext2D, participants: Participant[], time: number, scale: number, toggles: Toggles) {
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

function drawCurrentPositions(ctx: CanvasRenderingContext2D, participants: Participant[], time: number, scale: number, toggles: Toggles) {
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

function drawEvents(ctx: CanvasRenderingContext2D, events: JourneyEvent[], time: number, scale: number, toggles: Toggles) {
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

function drawCachedHeatmap(
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

function latestPoint(path: Participant["path"], time: number) {
  let best: Participant["path"][number] | null = null;
  for (const point of path) {
    if (point[0] > time) break;
    best = point;
  }
  return best;
}

function actorVisible(type: "human" | "bot", toggles: Toggles) {
  return type === "human" ? toggles.humans : toggles.bots;
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(value);
}

function formatTime(value: number) {
  if (value < 60) {
    return `${value.toFixed(value < 10 ? 2 : 1)}s`;
  }
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60).toString().padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function formatMapName(value: string) {
  return value.replace(/([a-z])([A-Z])/g, "$1 $2");
}

function formatDateLabel(value: string) {
  const date = new Date(`${value}T00:00:00`);
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

function formatMatchLabel(item: MatchSummary) {
  return `${item.id.replace(".nakama-0", "").slice(0, 8)} · ${item.humanCount ? "Squad" : "Bot"} route`;
}

function getMatchBadge(item: MatchSummary) {
  if ((item.eventCounts.KilledByStorm ?? 0) > 0) return { label: "Storm", tone: "storm" };
  if (item.humanCount > 0 && item.botCount > 0) return { label: "Mixed", tone: "mixed" };
  if (item.humanCount > 0) return { label: "Human", tone: "human" };
  return { label: "Bot", tone: "bot" };
}

function getTimelinePercent(value: number, duration: number) {
  if (!duration) return 0;
  return clamp((value / duration) * 100, 0, 100);
}

function getTimelineEventTone(type: string) {
  if (type === "KilledByStorm") return "storm";
  if (type === "Killed" || type === "BotKilled") return "death";
  if (type === "Kill" || type === "BotKill") return "kill";
  return "traffic";
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function normalizeDegrees(value: number) {
  return ((value % 360) + 360) % 360;
}

function shortestAngleDelta(a: number, b: number) {
  return ((a - b + 540) % 360) - 180;
}

async function parseUploadedDataset(files: File[]): Promise<UploadedDataset> {
  const manifestFile = files.find((file) => file.name === "manifest.json" || file.webkitRelativePath.endsWith("manifest.json"));
  if (!manifestFile) {
    return ingestRawParquetFiles(files);
  }
  if (!manifestFile) {
    throw new Error("Upload the processed data folder that contains manifest.json and matches/*.json.");
  }

  const manifest = JSON.parse(await manifestFile.text()) as Manifest;
  if (!Array.isArray(manifest.matches) || !Array.isArray(manifest.maps)) {
    throw new Error("manifest.json does not look like a LILA processed dataset.");
  }

  const matchFiles = files.filter((file) => {
    const path = file.webkitRelativePath || file.name;
    return path.includes("/matches/") && path.endsWith(".json");
  });
  if (!matchFiles.length) {
    throw new Error("No match JSON files found. Upload the folder that includes matches/*.json.");
  }

  const matches = new Map<string, MatchPayload>();
  await Promise.all(matchFiles.map(async (file) => {
    const payload = JSON.parse(await file.text()) as MatchPayload;
    if (payload.key) matches.set(payload.key, payload);
  }));

  const missing = manifest.matches.filter((summary) => !matches.has(summary.key)).slice(0, 3);
  if (missing.length) {
    throw new Error(`Uploaded dataset is incomplete. Missing match JSON for ${missing.map((item) => item.key).join(", ")}.`);
  }

  return { manifest, matches };
}
