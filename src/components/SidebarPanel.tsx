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
  onPreload: () => void;
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
  onPreload,
  onSelectMatch,
  onToggleCollapsed,
  isMobileSheet,
  onCloseSheet,
  onDeleteMatch,
}: SidebarPanelProps) {
  const [activeTab, setActiveTab] = useState<"Matches" | "AI">("Matches");
  const [showCalendar, setShowCalendar] = useState(false);

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
          <span className="sidebarActionSlot">
            {!isCollapsed && selectedPlayerId && onDeleteMatch && (
              <button className="sidebarIconButton danger" type="button" aria-label="Delete" data-tooltip="Delete" onClick={onDeleteMatch}>
                <Trash2 size={15} />
              </button>
            )}
          </span>
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
            <div className="emptyStateOr">or</div>
            <button className="preloadButton" type="button" onClick={onPreload}>Preload Bundled Data</button>
          </div>
        ) : (
          <>
          <div className={activeTab === "Matches" ? "sidebarTabPane active" : "sidebarTabPane"}>
              <div className="matchSearchTools">
                <label className="searchBox">
                  <Search size={14} />
                  <input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="Search matches..." />
                </label>
                
                <div className="dateControlWrapper">
                  <button 
                    className="dateControl" 
                    type="button" 
                    onClick={() => setShowCalendar(!showCalendar)}
                  >
                    <CalendarDays size={14} />
                    <span>{selectedDate === "all" ? "All dates" : formatDateLabel(selectedDate)}</span>
                  </button>

                  {showCalendar && (
                    <div className="calendarPopover">
                      <div className="calendarPopoverHeader">
                        <span>Select Date</span>
                        <button onClick={() => { onDateChange("all"); setShowCalendar(false); }}>Clear</button>
                      </div>
                      <CalendarHeatmap 
                        dates={manifest.dates} 
                        counts={manifest.stats.dates} 
                        selectedDate={selectedDate} 
                        onDateChange={(d) => { onDateChange(d); setShowCalendar(false); }} 
                      />
                    </div>
                  )}
                </div>
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

function CalendarHeatmap({ 
  dates, 
  counts, 
  selectedDate, 
  onDateChange 
}: { 
  dates: string[], 
  counts: Record<string, number>, 
  selectedDate: string, 
  onDateChange: (d: string) => void 
}) {
  const maxCount = Math.max(...Object.values(counts));
  
  const getColor = (count: number) => {
    if (!count) return "var(--calendar-empty)";
    const ratio = count / maxCount;
    if (ratio < 0.25) return "var(--calendar-level-1)";
    if (ratio < 0.5) return "var(--calendar-level-2)";
    if (ratio < 0.75) return "var(--calendar-level-3)";
    return "var(--calendar-level-4)";
  };

  return (
    <div className="calendarHeatmapGrid">
      {dates.map((date) => (
        <button
          key={date}
          className={`calendarHeatmapCell ${selectedDate === date ? "selected" : ""}`}
          style={{ backgroundColor: getColor(counts[date]) }}
          onClick={() => onDateChange(date === selectedDate ? "all" : date)}
          title={`${formatDateLabel(date)}: ${counts[date]} matches`}
          type="button"
        />
      ))}
    </div>
  );
}
