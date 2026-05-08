import type { JourneyEvent } from "../types";
import { formatTime } from "../utils";

export interface EventInfoCardProps {
  event: JourneyEvent | null;
}

export function EventInfoCard({ event }: EventInfoCardProps) {
  if (!event) return null;

  const isKill = event.type.toLowerCase().includes("kill");
  const isDeath = event.type.toLowerCase().includes("killed");
  const badgeClass = isKill && !isDeath ? "kill" : isDeath ? "death" : "loot";

  return (
    <div className="eventInfoCard">
      <div className="eventHeader">
        <span className={`eventBadge ${badgeClass}`}>
          {event.type}
        </span>
        <span className="eventTime">{formatTime(event.t)}</span>
      </div>
      <div className="eventBody">
        <strong>{event.actorType === "human" ? "Human" : "Bot"}</strong>
        <span>{event.userId.slice(0, 12)}...</span>
      </div>
    </div>
  );
}