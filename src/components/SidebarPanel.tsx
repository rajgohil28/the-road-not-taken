import { useState, useEffect } from "react";
import { CalendarDays, PanelLeft, PanelRight, Search, Trash2, Filter } from "lucide-react";
import type { ActorType, Manifest, MatchSummary } from "../types";
import { formatDateLabel, formatMapName, formatMatchLabel, formatNumber, formatTime, getMatchBadge } from "../utils";
import { AIChat } from "./AIChat";

export interface SidebarPanelProps {
  collapsed: boolean;
  filteredMatches: MatchSummary[];
  manifest: Manifest | null;
  query: string;
  selectedDate: string;
  actorFilter: "all" | "human" | "bot";
  selectedMatchKey: string;
  selectedPlayerId?: string;
  matchActorTypes?: Record<string, ActorType>;
  onDateChange: (value: string) => void;
  onActorFilterChange: (value: "all" | "human" | "bot") => void;
  onQueryChange: (value: string) => void;
  onReset: () => void;
  onPreload: () => void;
  onFilesSelected: (files: FileList) => void;
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
  actorFilter,
  selectedMatchKey,
  selectedPlayerId = "",
  matchActorTypes = {},
  onDateChange,
  onActorFilterChange,
  onQueryChange,
  onReset,
  onPreload,
  onFilesSelected,
  onSelectMatch,
  onToggleCollapsed,
  isMobileSheet,
  onCloseSheet,
  onDeleteMatch,
}: SidebarPanelProps) {
  const [activeTab, setActiveTab] = useState<"Matches" | "AI">("Matches");
  const [showCalendar, setShowCalendar] = useState(false);
  const [showFilter, setShowFilter] = useState(false);

  useEffect(() => {
    const handleGlobalClick = () => {
      setShowCalendar(false);
      setShowFilter(false);
    };
    window.addEventListener("pointerdown", handleGlobalClick);
    return () => window.removeEventListener("pointerdown", handleGlobalClick);
  }, []);

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
          {!isCollapsed && (
            <span className="sidebarActionSlot">
              {selectedPlayerId && selectedMatchKey && filteredMatches.length > 0 && onDeleteMatch && (
                <button className="sidebarIconButton danger" type="button" aria-label="Delete Match" data-tooltip="Delete Match" onClick={onDeleteMatch}>
                  <Trash2 size={15} />
                </button>
              )}
            </span>
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
            <label className="primaryActionButton">
              Open File or Folder
              <input 
                type="file" 
                multiple 
                accept=".nakama-0,.json"
                style={{ display: 'none' }}
                onChange={(e) => {
                  if (e.target.files && e.target.files.length > 0) {
                    onFilesSelected(e.target.files);
                  }
                }}
              />
            </label>
            <div className="emptyStateOr">or</div>
            <button className="secondaryActionButton" type="button" onClick={onPreload}>Preload Bundled Data</button>
          </div>
        ) : (
          <>
          <div className={activeTab === "Matches" ? "sidebarTabPane active" : "sidebarTabPane"}>
              <div className="matchSearchTools">
                <label className="searchBox">
                  <Search size={14} />
                  <input 
                    value={query} 
                    onChange={(event) => onQueryChange(event.target.value)} 
                    onFocus={() => { setShowCalendar(false); setShowFilter(false); }}
                    placeholder="Search matches..." 
                  />
                </label>
                
                <div className="dateControlWrapper">
                  <button 
                    className="dateControl" 
                    type="button" 
                    onClick={() => { setShowCalendar(!showCalendar); setShowFilter(false); }}
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

                <div className="filterControlWrapper">
                  <button 
                    className="filterControlButton iconOnly" 
                    type="button" 
                    onClick={() => { setShowFilter(!showFilter); setShowCalendar(false); }}
                    title={`Filter: ${actorFilter === "all" ? "All players" : actorFilter === "human" ? "Humans" : "Bots"}`}
                  >
                    <Filter size={14} />
                  </button>

                  {showFilter && (
                    <div className="filterPopover">
                      <div className="filterPopoverHeader">
                        <span>Filter by type</span>
                      </div>
                      <div className="filterOptions">
                        <button 
                          type="button" 
                          className={`filterOption ${actorFilter === "all" ? "active" : ""}`}
                          onClick={() => { onActorFilterChange("all"); setShowFilter(false); }}
                        >
                          All players
                        </button>
                        <button 
                          type="button" 
                          className={`filterOption ${actorFilter === "human" ? "active" : ""}`}
                          onClick={() => { onActorFilterChange("human"); setShowFilter(false); }}
                        >
                          Humans
                        </button>
                        <button 
                          type="button" 
                          className={`filterOption ${actorFilter === "bot" ? "active" : ""}`}
                          onClick={() => { onActorFilterChange("bot"); setShowFilter(false); }}
                        >
                          Bots
                        </button>
                      </div>
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
                  {filteredMatches.length === 0 && selectedDate !== "all" ? (
                    <div className="sidebarNoMatches">
                      <p>No data to display for this date.</p>
                      <span className="sidebarNoMatchesSub">Please select another date.</span>
                    </div>
                  ) : (
                    filteredMatches.map((item) => {
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
                    })
                  )}
                </div>
              </div>

              <div className="sidebarFooter">
                <span>{formatNumber(manifest?.stats.diagnostics.rows_seen ?? 0)} rows</span>
                {filteredMatches.length > 0 && (
                  <button type="button" onClick={onReset}>Reset</button>
                )}
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
  const baseDateStr = selectedDate !== "all" ? selectedDate : (dates.length > 0 ? dates[0] : new Date().toISOString().split('T')[0]);
  
  const [viewDate, setViewDate] = useState(() => {
    const [y, m] = baseDateStr.split('-');
    return new Date(parseInt(y), parseInt(m) - 1, 1);
  });

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth() + 1; // 1-12

  const handlePrevMonth = () => {
    setViewDate(new Date(year, month - 2, 1));
  };

  const handleNextMonth = () => {
    setViewDate(new Date(year, month, 1));
  };
  
  const daysInMonth = new Date(year, month, 0).getDate();
  const firstDayOfWeek = new Date(year, month - 1, 1).getDay();
  
  const gridDays = [];
  for (let i = 0; i < firstDayOfWeek; i++) gridDays.push(null);
  for (let i = 1; i <= daysInMonth; i++) {
    gridDays.push(`${year}-${month.toString().padStart(2, '0')}-${i.toString().padStart(2, '0')}`);
  }

  const maxCount = Math.max(...Object.values(counts), 1);
  
  const getColor = (count: number) => {
    if (!count) return "transparent";
    const ratio = count / maxCount;
    if (ratio < 0.25) return "var(--calendar-level-1)";
    if (ratio < 0.5) return "var(--calendar-level-2)";
    if (ratio < 0.75) return "var(--calendar-level-3)";
    return "var(--calendar-level-4)";
  };

  const monthName = new Intl.DateTimeFormat("en-US", { month: "long", year: "numeric" }).format(viewDate);

  return (
    <div className="actualCalendar">
      <div className="actualCalendarHeader">
        <div className="actualCalendarMonth">{monthName}</div>
        <div className="calNavGroup">
          <button type="button" className="calNavButton" onClick={handlePrevMonth} aria-label="Previous Month">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6"/></svg>
          </button>
          <button type="button" className="calNavButton" onClick={handleNextMonth} aria-label="Next Month">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6"/></svg>
          </button>
        </div>
      </div>
      <div className="actualCalendarGrid">
        {['S', 'M', 'T', 'W', 'T', 'F', 'S'].map((day, idx) => (
          <div key={`dayname-${idx}`} className="calendarDayName">{day}</div>
        ))}
        {gridDays.map((dateStr, i) => {
          if (!dateStr) return <div key={`empty-${i}`} className="calendarDay empty" />;
          const dayNum = parseInt(dateStr.split('-')[2], 10);
          const count = counts[dateStr] || 0;
          const isSelected = selectedDate === dateStr;
          
          return (
            <button
              key={dateStr}
              className={`calendarDay ${isSelected ? "selected" : ""} ${count > 0 ? "hasData" : "noData"}`}
              style={{ 
                '--density-color': count > 0 ? getColor(count) : undefined
              } as React.CSSProperties}
              onClick={() => {
                onDateChange(isSelected ? "all" : dateStr);
              }}
              title={count > 0 ? `${formatDateLabel(dateStr)}: ${count} matches` : formatDateLabel(dateStr)}
              type="button"
            >
              {dayNum}
            </button>
          );
        })}
      </div>
    </div>
  );
}
