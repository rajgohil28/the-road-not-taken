import { useState } from "react";
import { CalendarDays, PanelLeft, PanelRight, Search, Trash2 } from "lucide-react";
import type { ActorType, Manifest, MatchSummary } from "../types";
import { formatDateLabel, formatMapName, formatMatchLabel, formatNumber, formatTime, getMatchBadge } from "../utils";
import { AIChat } from "./AIChat";

export interface SidebarPanelProps {
  collapsed: boolean;
  filteredMatches: MatchSummary[];
  manifest: Manifest | null;
  query: string;
  selectedDate: string;
  selectedMatchKey: string;
  selectedPlayerId?: string;
  matchActorTypes?: Record<string, ActorType>;
  onDateChange: (value: string) => void;
  onQueryChange: (value: string) => void;
  onReset: () => void;
  onSelectMatch: (key: string) => void;
  onToggleCollapsed: () => void;
  isMobileSheet?: boolean;
  onCloseSheet?: () => void;
  onDeleteMatch?: () => void;
}

export function SidebarPanel({
  collapsed,
  filteredMatches,
  manifest,
  query,
  selectedDate,
  selectedMatchKey,
  selectedPlayerId = "",
  matchActorTypes = {},
  onDateChange,
  onQueryChange,
  onReset,
  onSelectMatch,
  onToggleCollapsed,
  isMobileSheet,
  onCloseSheet,
  onDeleteMatch,
}: SidebarPanelProps) {
  const [activeTab, setActiveTab] = useState<"Matches" | "AI">("Matches");

  const isCollapsed = isMobileSheet ? false : collapsed;
  const className = isMobileSheet ? "mobileSheet" : (isCollapsed ? "sidebar collapsed" : "sidebar");

  return (
    <aside
      className={className}
      onPointerDown={(event) => event.stopPropagation()}
      onPointerMove={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
    >
      {isMobileSheet && (
        <div className="mobileSheetHandle" onClick={onCloseSheet} />
      )}
      <div className="sidebarHeader">
        {!isCollapsed && (
          <div className="playerSegment sidebarModeSegment" aria-label="Panel mode">
            <button
              className={activeTab === "Matches" ? "active" : ""}
              type="button"
              aria-pressed={activeTab === "Matches"}
              onClick={() => setActiveTab("Matches")}
            >
              Matches
            </button>
            <button
              className={activeTab === "AI" ? "active" : ""}
              type="button"
              aria-pressed={activeTab === "AI"}
              onClick={() => setActiveTab("AI")}
            >
              AI
            </button>
          </div>
        )}
        <div className="sidebarActions">
          {!isCollapsed && selectedPlayerId && onDeleteMatch && (
            <button className="sidebarIconButton danger" type="button" aria-label="Delete" data-tooltip="Delete" onClick={onDeleteMatch}>
              <Trash2 size={15} />
            </button>
          )}
          {!isMobileSheet && (
            <button
              className="sidebarIconButton"
              type="button"
              data-tooltip={isCollapsed ? "Expand side panel" : "Collapse side panel"}
              onClick={onToggleCollapsed}
            >
              {isCollapsed ? <PanelRight size={18} /> : <PanelLeft size={18} />}
            </button>
          )}
        </div>
      </div>

      {!isCollapsed && (
        !manifest ? (
          <div className="sidebarEmptyState">
            <p>Drag and drop <strong>.nakama-0</strong> files or a folder anywhere to start.</p>
          </div>
        ) : (
          <>
          <div className={activeTab === "Matches" ? "sidebarTabPane active" : "sidebarTabPane"}>
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
                  {filteredMatches.map((item) => {
                    const badge = getMatchBadge(item);
                    return (
                      <button
                        key={item.key}
                        className={item.key === selectedMatchKey ? "sidebarMatchRow active" : "sidebarMatchRow"}
                        type="button"
                        onClick={() => onSelectMatch(item.key)}
                      >
                        <span className="sidebarMatchCopy">
                          <strong>{formatMatchLabel(item, matchActorTypes[item.key] ?? item.primaryActorType)}</strong>
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
          </div>

          <div className={activeTab === "AI" ? "sidebarTabPane active" : "sidebarTabPane"}>
            <AIChat />
          </div>
        </>
        )
      )}
    </aside>
  );
}
