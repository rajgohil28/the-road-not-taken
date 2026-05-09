import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ActorType, HeatmapMode, JourneyEvent, Manifest, MatchPayload, Toggles } from "./types";
import { MAP_SIZE, MIN_ZOOM, MAX_ZOOM, HEATMAP_OPTIONS } from "./constants";
import { clamp, normalizeDegrees, shortestAngleDelta } from "./utils";
import { drawPaths, drawCurrentPositions, drawEvents, drawCachedHeatmap } from "./lib/canvas";
import { parseUploadedDataset } from "./lib/dataset";
import { createLilaAiTools } from "./lib/aiTools";
import { SidebarPanel } from "./components/SidebarPanel";
import { Topbar } from "./components/Topbar";
import { MapToolsPanel } from "./components/MapToolsPanel";
import { PlaybackPanel } from "./components/PlaybackPanel";
import { EventInfoCard } from "./components/EventInfoCard";
import { LegendPanel } from "./components/LegendPanel";

const assetUrl = (path: string) => `${import.meta.env.BASE_URL}${path.replace(/^\/+/, "")}`;

export function App() {
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [match, setMatch] = useState<MatchPayload | null>(null);
  const [uploadedDataset, setUploadedDataset] = useState<{ manifest: Manifest; matches: Map<string, MatchPayload> } | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [uploadStatus, setUploadStatus] = useState("Bundled dataset loaded from public/data.");
  const [selectedMap, setSelectedMap] = useState("AmbroseValley");
  const [selectedDate, setSelectedDate] = useState("all");
  const [selectedMatchKey, setSelectedMatchKey] = useState("");
  const [query, setQuery] = useState("");
  const [actorFilter, setActorFilter] = useState<"all" | "human" | "bot">("all");
  const [time, setTime] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [selectedPlayerId, setSelectedPlayerId] = useState("");
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [heatmap, setHeatmap] = useState<HeatmapMode>("traffic");
  const [matchActorTypes, setMatchActorTypes] = useState<Record<string, ActorType>>({});
  const [showLayerPanel, setShowLayerPanel] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [showMobileSheet, setShowMobileSheet] = useState(false);
  const [showLegendPanel, setShowLegendPanel] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [themeMode, setThemeMode] = useState<"light" | "dark">("dark");
  const [timelineVisible, setTimelineVisible] = useState(false);
  const [mapView, setMapView] = useState({ zoom: 3, rotation: 0, x: 0, y: 0 });
  const [hoveredEvent, setHoveredEvent] = useState<JourneyEvent | null>(null);
  const [toggles, setToggles] = useState<Toggles>({ humans: true, bots: true, paths: true, events: true });
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const heatmapCacheRef = useRef<{ key: string; canvas: HTMLCanvasElement | null }>({ key: "", canvas: null });
  const mapShellRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ pointerId: number; x: number; y: number; originX: number; originY: number; xPercent?: number; yPercent?: number } | null>(null);
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
      const validDates = data.dates.filter(d => d !== "uploaded").sort();
      if (validDates.length > 0) {
        setSelectedDate(validDates[validDates.length - 1]);
      } else {
        setSelectedDate("all");
      }
      setSelectedMatchKey(first.key);
    }
  }, []);

  const loadBundledDataset = useCallback(() => {
    setUploadedDataset(null);
    setMatch(null);
    setTime(0);
    setPlaying(false);
    fetch(assetUrl("data/manifest.json"))
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
    // loadBundledDataset removed to allow blank start
  }, []);

  const filteredMatches = useMemo(() => {
    if (!manifest) return [];
    const normalized = query.trim().toLowerCase();
    return manifest.matches
      .filter((item) => item.mapId === selectedMap)
      .filter((item) => selectedDate === "all" || item.date === selectedDate)
      .filter((item) => actorFilter === "all" || item.primaryActorType === actorFilter)
      .filter((item) => !normalized || item.id.toLowerCase().includes(normalized) || item.key.toLowerCase().includes(normalized) || (item.primaryUserId && item.primaryUserId.toLowerCase().includes(normalized)))
      .sort((a, b) => b.durationSec - a.durationSec);
  }, [manifest, query, selectedDate, selectedMap, actorFilter]);

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
    fetch(assetUrl(`data/matches/${selectedMatchKey}.json`))
      .then((response) => response.json())
      .then((payload: MatchPayload) => {
        setMatch(payload);
        setTime(0);
      });
  }, [selectedMatchKey, uploadedDataset]);

  const handleUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    if (!files.length) return;
    
    const allFiles = [...uploadedFiles, ...files];
    setUploadedFiles(allFiles);
    setUploadStatus(`Reading ${allFiles.length} uploaded files...`);
    try {
      const dataset = await parseUploadedDataset(allFiles);
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
  }, [applyManifest, uploadedFiles]);

  const handleResetWorkspace = useCallback(() => {
    setManifest(null);
    setMatch(null);
    setUploadedDataset(null);
    setUploadedFiles([]);
    setSelectedMatchKey("");
    setTime(0);
    setPlaying(false);
    setUploadStatus("Workspace reset. Drag and drop .nakama-0 files to begin.");
  }, []);

  const handleDeleteMatch = useCallback(() => {
    if (!selectedMatchKey || !manifest) return;

    const newMatches = manifest.matches.filter(m => m.key !== selectedMatchKey);
    const newManifest = { ...manifest, matches: newMatches };
    
    if (uploadedDataset) {
      const newDatasetMatches = new Map(uploadedDataset.matches);
      newDatasetMatches.delete(selectedMatchKey);
      setUploadedDataset({
        manifest: newManifest,
        matches: newDatasetMatches
      });
    }

    setManifest(newManifest);
    setMatch(null);
    setTime(0);
    setPlaying(false);
    
    if (newMatches.length > 0) {
      setSelectedMatchKey(newMatches[0].key);
    } else {
      setSelectedMatchKey("");
    }
  }, [manifest, selectedMatchKey, uploadedDataset]);

  const visibleMatches = useMemo(() => filteredMatches.slice(0, 8), [filteredMatches]);

  useEffect(() => {
    let cancelled = false;
    const missing = visibleMatches.filter((item) => !matchActorTypes[item.key] && !item.primaryActorType);
    if (!missing.length) return;

    Promise.all(missing.map(async (item) => {
      const payload = uploadedDataset?.matches.get(item.key) ??
        await fetch(assetUrl(`data/matches/${item.key}.json`)).then((response) => response.ok ? response.json() as Promise<MatchPayload> : null).catch(() => null);
      return [item.key, getPrimaryActorType(payload)] as const;
    })).then((entries) => {
      if (cancelled) return;
      setMatchActorTypes((current) => {
        const next = { ...current };
        for (const [key, actorType] of entries) {
          if (actorType) next[key] = actorType;
        }
        return next;
      });
    });

    return () => {
      cancelled = true;
    };
  }, [matchActorTypes, uploadedDataset, visibleMatches]);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const handleFilesSelected = useCallback(async (files: File[]) => {
    if (!files.length) return;
    const allFiles = [...uploadedFiles, ...files];
    setUploadedFiles(allFiles);
    setUploadStatus(`Reading ${allFiles.length} files...`);
    try {
      const dataset = await parseUploadedDataset(allFiles);
      setUploadedDataset(dataset);
      applyManifest(dataset.manifest);
      setMatch(null);
      setTime(0);
      setPlaying(false);
      setUploadStatus(`Upload loaded: ${dataset.manifest.matches.length} matches.`);
    } catch (error) {
      setUploadStatus(error instanceof Error ? error.message : "Could not read dataset.");
    }
  }, [applyManifest, uploadedFiles]);

  const handleDrop = useCallback(async (event: React.DragEvent) => {
    event.preventDefault();
    setIsDragging(false);

    const getFilesFromEntry = async (entry: any): Promise<File[]> => {
      if (entry.isFile) {
        return new Promise((resolve) => entry.file(resolve));
      } else if (entry.isDirectory) {
        const dirReader = entry.createReader();
        const entries = await new Promise<any[]>((resolve) => {
          dirReader.readEntries(resolve);
        });
        const filesPromises = entries.map(getFilesFromEntry);
        const filesArrays = await Promise.all(filesPromises);
        return filesArrays.flat();
      }
      return [];
    };

    const items = Array.from(event.dataTransfer.items);
    let files: File[] = [];

    if (items.some(i => i.webkitGetAsEntry)) {
      const entries = items.map(i => i.webkitGetAsEntry()).filter(Boolean);
      const filesPromises = entries.map(getFilesFromEntry);
      const filesArrays = await Promise.all(filesPromises);
      files = filesArrays.flat();
    } else {
      files = Array.from(event.dataTransfer.files);
    }

    void handleFilesSelected(files);
  }, [handleFilesSelected]);

  const selectedSummary = useMemo(
    () => manifest?.matches.find((item) => item.key === selectedMatchKey),
    [manifest, selectedMatchKey],
  );

  const duration = match?.durationSec ?? selectedSummary?.durationSec ?? 0;
  const effectivePlayerId = selectedPlayerId || match?.participants[0]?.userId || "";
  const selectedParticipant = useMemo(
    () => match?.participants.find((participant) => participant.userId === effectivePlayerId) ?? null,
    [match, effectivePlayerId],
  );
  const selectedEvents = useMemo(
    () => match?.events.filter((event) => !effectivePlayerId || event.userId === effectivePlayerId) ?? [],
    [match, effectivePlayerId],
  );

  useEffect(() => {
    const tools = createLilaAiTools({
      manifest,
      match,
      selectedMap,
      selectedDate,
      selectedMatchKey,
      selectedPlayerId: effectivePlayerId,
      heatmap,
      time,
      duration,
      playbackSpeed,
      playing,
      mapView,
      toggles,
      canvasRef,
      setSelectedMap,
      setSelectedDate,
      setSelectedMatchKey,
      setQuery,
      setSelectedPlayerId,
      setPlaying,
      setTime,
      setPlaybackSpeed,
      setHeatmap,
      setMapView,
      setToggles,
    });
    window.lilaTools = tools;
    return () => {
      if (window.lilaTools === tools) delete window.lilaTools;
    };
  }, [
    duration,
    heatmap,
    manifest,
    mapView,
    match,
    playbackSpeed,
    playing,
    selectedDate,
    selectedMap,
    selectedMatchKey,
    selectedPlayerId,
    time,
    toggles,
  ]);

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
    
    // Clear whole canvas at base transform
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Calculate map origin (center of canvas)
    const cx = rect.width / 2;
    const cy = rect.height / 2;

    // Apply exact camera transform
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0); // Base retina scale
    ctx.translate(cx + mapView.x, cy + mapView.y); // Pan
    ctx.rotate((mapView.rotation * Math.PI) / 180); // Rotate
    ctx.scale(mapView.zoom, mapView.zoom); // Zoom
    ctx.translate(-cx, -cy); // Move origin back to top-left of the map box

    const scale = rect.width / MAP_SIZE;
    
    // Pass base ratio to heatmap so it caches at screen res, then we just draw it scaled
    drawCachedHeatmap(ctx, match, heatmap, scale, toggles, rect.width, rect.height, ratio, heatmapCacheRef);
    
    const participantsToDraw = selectedParticipant ? [selectedParticipant] : (match.participants.length ? [match.participants[0]] : []);
    if (toggles.paths) drawPaths(ctx, participantsToDraw, time, scale, toggles, mapView.zoom);
    if (toggles.events) drawEvents(ctx, effectivePlayerId ? selectedEvents : match.events, time, scale, toggles, mapView.zoom);
    drawCurrentPositions(ctx, participantsToDraw, time, scale, toggles, mapView.zoom);
  }, [heatmap, match, selectedEvents, selectedParticipant, effectivePlayerId, time, toggles, mapView.zoom, mapView.x, mapView.y, mapView.rotation]);

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

  const DEFAULT_MAP_IMAGES: Record<string, string> = {
    AmbroseValley: "AmbroseValley_Minimap.png",
    GrandRift: "GrandRift_Minimap.png",
    Lockdown: "Lockdown_Minimap.jpg",
  };
  const mapImage = manifest?.maps.find((item) => item.id === selectedMap)?.image || DEFAULT_MAP_IMAGES[selectedMap];
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
    // Close panels on map interaction
    setShowLayerPanel(false);
    setShowLegendPanel(false);

    let xPercent = -1;
    let yPercent = -1;
    const mapContent = mapShellRef.current?.querySelector('.mapContent') as HTMLElement;
    if (mapContent) {
      const rect = mapContent.getBoundingClientRect();
      xPercent = (event.clientX - rect.left) / rect.width;
      yPercent = (event.clientY - rect.top) / rect.height;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, originX: mapView.x, originY: mapView.y, xPercent, yPercent };
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
    const drag = dragRef.current;
    if (drag?.pointerId === event.pointerId) {
      const dist = Math.hypot(event.clientX - drag.x, event.clientY - drag.y);
      if (dist < 5 && drag.xPercent !== undefined && drag.xPercent >= 0 && drag.yPercent !== undefined) {
        setMapPin({ x: drag.xPercent, y: drag.yPercent });
        setMapPinButtonVisible(true);
      } else if (dist < 5) {
        setMapPin(null);
        setMapPinButtonVisible(false);
      }
      dragRef.current = null;
    }
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

  const [activeKeys, setActiveKeys] = useState<Set<string>>(new Set());
  const [mapPin, setMapPin] = useState<{ x: number; y: number } | null>(null);
  const [mapPinButtonVisible, setMapPinButtonVisible] = useState(false);

  useEffect(() => {
    const keys = new Set<string>();
    let animationFrameId: number;

    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTagName = document.activeElement?.tagName.toUpperCase();
      if (activeTagName === "INPUT" || activeTagName === "TEXTAREA") return;
      const key = e.key.toLowerCase();
      if (!keys.has(key)) {
        keys.add(key);
        setActiveKeys(new Set(keys));
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if (keys.has(key)) {
        keys.delete(key);
        setActiveKeys(new Set(keys));
      }
    };

    const handleBlur = () => {
      keys.clear();
      setActiveKeys(new Set());
    };

    const updateLoop = () => {
      if (keys.size > 0) {
        setMapView((value) => {
          let { x, y, zoom } = value;
          const panSpeed = 15;
          const zoomSpeed = 0.04;
          let changed = false;

          if (keys.has("w")) { y += panSpeed; changed = true; }
          if (keys.has("s")) { y -= panSpeed; changed = true; }
          if (keys.has("a")) { x += panSpeed; changed = true; }
          if (keys.has("d")) { x -= panSpeed; changed = true; }
          if (keys.has("q")) { zoom = clamp(zoom - zoomSpeed, MIN_ZOOM, MAX_ZOOM); changed = true; }
          if (keys.has("e")) { zoom = clamp(zoom + zoomSpeed, MIN_ZOOM, MAX_ZOOM); changed = true; }

          if (changed) {
            return constrainMapView({ ...value, x, y, zoom });
          }
          return value;
        });
      }
      animationFrameId = requestAnimationFrame(updateLoop);
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);
    window.addEventListener("blur", handleBlur);

    animationFrameId = requestAnimationFrame(updateLoop);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
      window.removeEventListener("blur", handleBlur);
      cancelAnimationFrame(animationFrameId);
    };
  }, [constrainMapView]);

  useEffect(() => {
    if (mapPin && mapPinButtonVisible) {
      const timer = setTimeout(() => {
        setMapPinButtonVisible(false);
      }, 3000);
      return () => clearTimeout(timer);
    }
  }, [mapPin, mapPinButtonVisible]);

  const handleAskAgentArea = useCallback(() => {
    if (!mapPin || !canvasRef.current) return;
    const overlay = canvasRef.current;
    const bgImg = document.querySelector(".minimap") as HTMLImageElement;
    if (!bgImg || !bgImg.complete) return;

    const cropSize = 512;
    const canvas = document.createElement("canvas");
    canvas.width = cropSize;
    canvas.height = cropSize;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Draw solid background
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, cropSize, cropSize);

    // Calculate crop centers based on natural width for img and canvas width for overlay
    const cxImg = mapPin.x * bgImg.naturalWidth;
    const cyImg = mapPin.y * bgImg.naturalHeight;
    ctx.drawImage(bgImg, cxImg - cropSize / 2, cyImg - cropSize / 2, cropSize, cropSize, 0, 0, cropSize, cropSize);

    const cxOverlay = mapPin.x * overlay.width;
    const cyOverlay = mapPin.y * overlay.height;
    
    // Scale the crop size for the overlay so it matches the geographic coverage of the background image crop
    const cropRatio = overlay.width / bgImg.naturalWidth;
    const overlayCropSize = cropSize * cropRatio;

    ctx.drawImage(
      overlay, 
      cxOverlay - overlayCropSize / 2, 
      cyOverlay - overlayCropSize / 2, 
      overlayCropSize, 
      overlayCropSize, 
      0, 0, cropSize, cropSize
    );

    const dataUrl = canvas.toDataURL("image/png");
    window.dispatchEvent(new CustomEvent("ASK_AGENT_AREA", { detail: { dataUrl } }));
    setSidebarCollapsed(false);
    setMapPin(null);
  }, [mapPin]);

  return (
    <main 
      className={`app ${themeMode === "dark" ? "darkMode" : "lightMode"} ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {isDragging && (
        <div className="dragOverlay">
          <span>Drop .nakama-0 files or folder to load</span>
        </div>
      )}

      <SidebarPanel
        collapsed={sidebarCollapsed}
        filteredMatches={filteredMatches}
        manifest={manifest}
        query={query}
        selectedDate={selectedDate}
        actorFilter={actorFilter}
        selectedMatchKey={selectedMatchKey}
        selectedPlayerId={effectivePlayerId}
        matchActorTypes={matchActorTypes}
        onDateChange={setSelectedDate}
        onActorFilterChange={setActorFilter}
        onQueryChange={setQuery}
        onReset={handleResetWorkspace}
        onPreload={loadBundledDataset}
        onFilesSelected={(files) => void handleFilesSelected(Array.from(files))}
        onSelectMatch={setSelectedMatchKey}
        onToggleCollapsed={() => setSidebarCollapsed((value) => !value)}
        onDeleteMatch={handleDeleteMatch}
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
            actorFilter={actorFilter}
            selectedMatchKey={selectedMatchKey}
            selectedPlayerId={effectivePlayerId}
            matchActorTypes={matchActorTypes}
            onDateChange={setSelectedDate}
            onActorFilterChange={setActorFilter}
            onQueryChange={setQuery}
            onReset={handleResetWorkspace}
            onPreload={loadBundledDataset}
            onFilesSelected={(files) => void handleFilesSelected(Array.from(files))}
            onSelectMatch={setSelectedMatchKey}
            onToggleCollapsed={() => {}}
            isMobileSheet={true}
            onCloseSheet={() => setShowMobileSheet(false)}
            onDeleteMatch={handleDeleteMatch}
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
          onToggleLegend={() => setShowLegendPanel(v => !v)}
        />
        
        <div className="topLayersContainer">
          <div className="playerSegment layersSegment" aria-label="Map layer modes">
            {HEATMAP_OPTIONS.filter((option) => option.image || option.value === "off").map((option) => (
              <button
                key={option.value}
                className={`segmentButton ${heatmap === option.value ? "active" : ""}`}
                type="button"
                aria-pressed={heatmap === option.value}
                onClick={() => setHeatmap(option.value)}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        {showLegendPanel && <LegendPanel onClose={() => setShowLegendPanel(false)} />}

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
              <div className="mapContent" aria-label={`${selectedMap} minimap`}>
                <img className="minimap" style={mapTransform} src={assetUrl(`minimaps/${mapImage}`)} alt="" draggable={false} onLoad={draw} />
                <canvas ref={canvasRef} className="overlay" />
                {mapPin && (
                  <div
                    key={`${mapPin.x}-${mapPin.y}`}
                    className="mapPinContainer"
                    style={{ left: `calc(50% + ${mapView.x}px + ${(mapPin.x - 0.5) * 100 * mapView.zoom}%)`, top: `calc(50% + ${mapView.y}px + ${(mapPin.y - 0.5) * 100 * mapView.zoom}%)`, transform: `translate(-50%, -50%) rotate(${-mapView.rotation}deg)` }}
                    onPointerDown={(e) => e.stopPropagation()}
                  >
                    <div className="mapPinDot" />
                    {mapPinButtonVisible && (
                      <button className="mapPinAskAgent" onClick={(e) => { e.stopPropagation(); handleAskAgentArea(); }}>
                        Ask Agent
                      </button>
                    )}
                  </div>
                )}
              </div>
              <MapToolsPanel
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
          onMouseEnterTimeline={() => { if (match) setTimelineVisible(true); }}
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

        <div className="keyboardOverlay">
          <div className="keyboardOverlayHeader">Keyboard navigation</div>
          <div className="keyboardRow">
            <kbd className={activeKeys.has("q") ? "active" : ""}>Q</kbd>
            <kbd className={activeKeys.has("w") ? "active" : ""}>W</kbd>
            <kbd className={activeKeys.has("e") ? "active" : ""}>E</kbd>
          </div>
          <div className="keyboardRow">
            <kbd className={activeKeys.has("a") ? "active" : ""}>A</kbd>
            <kbd className={activeKeys.has("s") ? "active" : ""}>S</kbd>
            <kbd className={activeKeys.has("d") ? "active" : ""}>D</kbd>
          </div>
        </div>
      </section>
    </main>
  );
}

function getPrimaryActorType(payload: MatchPayload | null): ActorType | null {
  if (!payload?.participants.length) return null;
  return payload.participants.find((participant) => participant.type === "human")?.type ?? payload.participants[0].type;
}
