import { Minus, Plus } from "lucide-react";

export interface MapToolsPanelProps {
  onZoomIn: () => void;
  onZoomOut: () => void;
  rotation: number;
  onCompassPointerDown: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onCompassPointerMove: (e: React.PointerEvent<HTMLButtonElement>) => void;
  onCompassPointerUp: (e: React.PointerEvent<HTMLButtonElement>) => void;
}

export function MapToolsPanel({
  onZoomIn,
  onZoomOut,
  rotation,
  onCompassPointerDown,
  onCompassPointerMove,
  onCompassPointerUp,
}: MapToolsPanelProps) {
  return (
    <div className="mapTools" aria-label="Map tools" onPointerDown={(event) => event.stopPropagation()}>
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