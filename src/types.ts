export type MapId = "AmbroseValley" | "GrandRift" | "Lockdown";
export type ActorType = "human" | "bot";
export type HeatmapMode = "traffic" | "kills" | "deaths" | "storm" | "loot" | "off";

export interface MapConfig {
  id: MapId;
  scale: number;
  origin_x: number;
  origin_z: number;
  image: string;
}

export interface MatchSummary {
  key: string;
  id: string;
  date: string;
  mapId: MapId;
  durationSec: number;
  humanCount: number;
  botCount: number;
  eventCounts: Record<string, number>;
  pathPointCount: number;
}

export interface Manifest {
  generatedAt: string;
  maps: MapConfig[];
  dates: string[];
  matches: MatchSummary[];
  stats: {
    matches: number;
    maps: Record<string, number>;
    dates: Record<string, number>;
    events: Record<string, number>;
    diagnostics: Record<string, number>;
  };
}

export interface JourneyEvent {
  t: number;
  type: string;
  userId: string;
  actorType: ActorType;
  px: number;
  py: number;
  x: number;
  z: number;
}

export interface Participant {
  userId: string;
  type: ActorType;
  path: Array<[number, number, number, number, number]>;
  events: JourneyEvent[];
}

export interface MatchPayload {
  key: string;
  id: string;
  date: string;
  mapId: MapId;
  durationSec: number;
  participants: Participant[];
  events: JourneyEvent[];
}
