import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { HeatmapMode, JourneyEvent, Manifest, MatchPayload, Toggles } from "./types";
import { MAP_SIZE, MIN_ZOOM, MAX_ZOOM } from "./constants";
import { clamp, normalizeDegrees, shortestAngleDelta } from "./utils";
import { drawPaths, drawCurrentPositions, drawEvents, drawCachedHeatmap } from "./lib/canvas";
import { parseUploadedDataset } from "./lib/dataset";
import { SidebarPanel } from "./components/SidebarPanel";
import { Topbar } from "./components/Topbar";
import { MapToolsPanel } from "./components/MapToolsPanel";
import { PlaybackPanel } from "./components/PlaybackPanel";
import { EventInfoCard } from "./components/EventInfoCard";

export function App() {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [match, setMatch] = useState<MatchPayload | null>(null);
  const [uploadedDataset, setUploadedDataset] = useState<{ manifest: Manifest; matches: Map<string, MatchPayload> } | null>(null);
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
  const [showMobileSheet, setShowMobileSheet] = useState(false);
  const [themeMode, setThemeMode] = useState<"light" | "dark">("dark");
  const [timelineVisible, setTimelineVisible] = useState(false);
  const [mapView, setMapView] = useState({ zoom: 3, rotation: 0, x: 0, y: 0 });
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
    
    let timeoutId: ReturnType<typeof setTimeout>;
    const handleResize = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        draw();
      }, 100);
    };

    window.addEventListener("resize", handleResize);
    return () => {
      clearTimeout(timeoutId);
      window.removeEventListener("resize", handleResize);
    };
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

      {showMobileSheet && (
        <>
          <div className="mobileSheetOverlay" onClick={() => setShowMobileSheet(false)} />
          <SidebarPanel
            collapsed={false}
            filteredMatches={filteredMatches}
            manifest={manifest}
            query={query}
            selectedDate={selectedDate}
            selectedMatchKey={selectedMatchKey}
            onDateChange={setSelectedDate}
            onQueryChange={setQuery}
            onReset={loadBundledDataset}
            onSelectMatch={setSelectedMatchKey}
            onToggleCollapsed={() => {}}
            isMobileSheet={true}
            onCloseSheet={() => setShowMobileSheet(false)}
          />
        </>
      )}

      <section className="workspace">
        <Topbar
          themeMode={themeMode}
          onToggleTheme={() => setThemeMode((value) => value === "light" ? "dark" : "light")}
          selectedMap={selectedMap}
          onSelectMap={setSelectedMap}
          manifest={manifest}
          onUpload={handleUpload}
        />

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
              <MapToolsPanel
                showLayerPanel={showLayerPanel}
                onToggleLayerPanel={() => setShowLayerPanel((value) => !value)}
                heatmap={heatmap}
                onSelectHeatmap={setHeatmap}
                onZoomIn={() => updateZoom(0.18)}
                onZoomOut={() => updateZoom(-0.18)}
                rotation={mapView.rotation}
                onCompassPointerDown={handleCompassPointerDown}
                onCompassPointerMove={handleCompassPointerMove}
                onCompassPointerUp={handleCompassPointerUp}
              />
            </>
          ) : (
            <div className="emptyState">Run preprocessing to load map data.</div>
          )}
        </div>

        <PlaybackPanel
          timelineVisible={timelineVisible}
          onMouseEnterTimeline={() => setTimelineVisible(true)}
          onMouseLeaveTimeline={() => setTimelineVisible(false)}
          time={time}
          duration={duration}
          onTimelinePointerDown={handleTimelinePointerDown}
          onTimelinePointerMove={handleTimelinePointerMove}
          onTimelinePointerUp={handleTimelinePointerUp}
          onTimeChange={setTime}
          selectedEvents={selectedEvents}
          onHoverEvent={setHoveredEvent}
          onOpenMobileSettings={() => setShowMobileSheet(true)}
          playing={playing}
          onTogglePlay={() => setPlaying((value) => !value)}
          onReset={() => setTime(0)}
          onStepBack={stepBack}
          onStepForward={stepForward}
          hasMatch={!!match}
          playbackSpeed={playbackSpeed}
          onSpeedChange={setPlaybackSpeed}
        />

        <EventInfoCard event={hoveredEvent} />
      </section>
    </main>
  );
}