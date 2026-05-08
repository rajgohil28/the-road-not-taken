import { ChevronDown, Sun, Info } from "lucide-react";
import type { Manifest } from "../types";
import { formatMapName } from "../utils";

export interface TopbarProps {
  themeMode: "light" | "dark";
  onToggleTheme: () => void;
  selectedMap: string;
  onSelectMap: (mapId: string) => void;
  manifest: Manifest | null;
  onToggleLegend: () => void;
}

export function Topbar({
  themeMode,
  onToggleTheme,
  selectedMap,
  onSelectMap,
  manifest,
  onToggleLegend,
}: TopbarProps) {
  const maps = manifest?.maps || [
    { id: "AmbroseValley" },
    { id: "GrandRift" },
    { id: "Lockdown" },
  ];

  return (
    <header className="topbar">
      <button
        className="roundIcon themeToggle"
        data-tooltip="Dark and light mode selector"
        onClick={onToggleTheme}
      >
        <Sun size={24} />
      </button>
      <label className="levelSelect" aria-label="Level select">
        <span>{formatMapName(selectedMap)}</span>
        <ChevronDown size={18} />
        <select value={selectedMap} onChange={(e) => onSelectMap(e.target.value)}>
          {maps.map((item) => (
            <option key={item.id} value={item.id}>
              {formatMapName(item.id)}
            </option>
          ))}
        </select>
      </label>

      <button 
        className="roundIcon" 
        data-tooltip="Legend & Info" 
        aria-label="Legend and Info"
        onClick={onToggleLegend}
      >
        <Info size={18} />
      </button>
    </header>
  );
}