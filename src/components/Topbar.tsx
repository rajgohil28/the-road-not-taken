import { ChevronDown, Sun, Upload } from "lucide-react";
import type { Manifest } from "../types";
import { formatMapName } from "../utils";

export interface TopbarProps {
  themeMode: "light" | "dark";
  onToggleTheme: () => void;
  selectedMap: string;
  onSelectMap: (mapId: string) => void;
  manifest: Manifest | null;
  onUpload: (event: React.ChangeEvent<HTMLInputElement>) => void;
}

export function Topbar({
  themeMode,
  onToggleTheme,
  selectedMap,
  onSelectMap,
  manifest,
  onUpload,
}: TopbarProps) {
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
          {manifest?.maps.map((item) => (
            <option key={item.id} value={item.id}>
              {formatMapName(item.id)}
            </option>
          ))}
        </select>
      </label>
      <label className="floatingUpload" data-tooltip="Upload dataset" aria-label="Upload dataset">
        <Upload size={18} />
        <input type="file" multiple onChange={onUpload} />
      </label>
    </header>
  );
}