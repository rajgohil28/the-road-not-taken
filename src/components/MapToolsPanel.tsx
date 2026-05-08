import { Map as MapIcon, Minus, Plus, X } from "lucide-react";
import type { HeatmapMode } from "../types";
import { HEATMAP_OPTIONS } from "../constants";

export interface MapToolsPanelProps {
  showLayerPanel: boolean;
  onToggleLayerPanel: () => void;
  heatmap: HeatmapMode;
  onSelectHeatmap: (mode: HeatmapMode) => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  rotation: number;
  onCompassPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onCompassPointerMove: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onCompassPointerUp: (e: React.PointerEvent<HTMLButtonElement>) => void;
}

export function MapToolsPanel({
  showLayerPanel,
  onToggleLayerPanel,
  heatmap,
  onSelectHeatmap,
  onZoomIn,
  onZoomOut,
  rotation,
  onCompassPointerDown,
  onCompassPointerMove,
  onCompassPointerUp,
}: MapToolsPanelProps) {
  return (
    <div className="mapTools" aria-label="Map tools" onPointerDown={(event) => event.stopPropagation()}>
      <div style={{ position: "relative" }}>
        <button
          className={showLayerPanel ? "active" : ""}
          data-tooltip="Map layers"
          onClick={onToggleLayerPanel}
        >
          <MapIcon size={16} />
        </button>
        {showLayerPanel && (
          <div className="modeCards" aria-label="Map layer modes">
            {HEATMAP_OPTIONS.filter((option) => option.image).map((option) => (
              <button
                key={option.value}
                className={heatmap === option.value ? "modeCard active" : "modeCard"}
                type="button"
                aria-pressed={heatmap === option.value}
                onClick={() => onSelectHeatmap(option.value)}
              >
                <img className="modePreview" src={option.image} alt="" draggable={false} />
                <strong>{option.label}</strong>
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="zoomGroup">
        <button data-tooltip="Zoom in" onClick={onZoomIn}><Plus size={16} /></button>
        <button data-tooltip="Zoom out" onClick={onZoomOut}><Minus size={16} /></button>
      </div>
      <button
        className="compassControl"
        data-tooltip="Drag to rotate map"
        onPointerDown={onCompassPointerDown}
        onPointerMove={onCompassPointerMove}
        onPointerUp={onCompassPointerUp}
        onPointerCancel={onCompassPointerUp}
      >
        <span className="compassRose" style={{ transform: `rotate(${rotation}deg)` }}>
          <b className="north">N</b>
          <b className="east">E</b>
          <b className="south">S</b>
          <b className="west">W</b>
          <i />
        </span>
      </button>
    </div>
  );
}