import { X } from "lucide-react";
import { EVENT_COLORS, HEATMAP_OPTIONS } from "../constants";

export interface LegendPanelProps {
  onClose: () => void;
}

export function LegendPanel({ onClose }: LegendPanelProps) {
  return (
    <div className="legendPanel">
      <div className="legendHeader">
        <h3>Legend</h3>
        <button className="modeCloseButton" type="button" onClick={onClose} aria-label="Close legend">
          <X size={14} />
        </button>
      </div>

      <div className="legendSection">
        <h4>Events</h4>
        <div className="legendGrid">
          {Object.entries(EVENT_COLORS).map(([name, color]) => (
            <div key={name} className="legendItem">
              <span className="legendColorDot" style={{ background: color }} />
              <span>{name}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="legendSection">
        <h4>Heatmaps</h4>
        <div className="legendGrid">
          {HEATMAP_OPTIONS.filter((option) => option.image).map((option) => (
            <div key={option.value} className="legendItem">
              <img className="legendMiniPreview" src={option.image} alt="" />
              <span>{option.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="legendSection">
        <h4>Upload</h4>
        <p className="legendHelpText">
          Drag and drop your <strong>.nakama-0</strong> files or a folder anywhere on the screen to load them into the application.
        </p>
      </div>
    </div>
  );
}