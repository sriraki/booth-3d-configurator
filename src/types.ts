export type WallId = 'back' | 'left' | 'right';
export type EdgeId = 'front' | 'left' | 'right';
export type ItemType = 'counter' | 'table' | 'cabinet' | 'kiosk' | 'bin';

/** Two stalls share one back wall: 'a' faces front, 'b' faces the other way. */
export type StallId = 'a' | 'b';

export interface Placement {
  id: string;
  stall?: StallId;   // absent on sessions saved before the partner stall
  type: ItemType;
  x: number;
  z: number;
  rotY: number;
}

export interface Tv {
  id: string;
  stall?: StallId;
  wall: WallId;
  t: number;       // distance along the wall, metres from its start
  sizeIdx: number;
}

export interface Config {
  width: 3 | 4 | 5 | 6;
  depth: 3 | 4 | 5 | 6;
  openSides: 1 | 2 | 3;
  mirror: boolean;          // flips which side is open on a corner stall
  companyName: string;
  /** A second stall backed onto this one, opening the opposite way. */
  partner: boolean;
  partnerName: string;
  logo: string | null;      // data URL
  carpet: string;
  fasciaColor: string;
  fasciaTextColor: string;
  showSpotBeams: boolean;
  showHall: boolean;
  ambient: number;
  chairsPerTable: number;
}

export interface TvMediaItem {
  name: string;
  src: string;      // object URL
  blob?: Blob;
}

export interface TvMedia {
  kind: 'video' | 'slideshow';
  items: TvMediaItem[];
  playing: boolean;
  muted: boolean;
  loop: boolean;
  intervalMs: number;   // slideshow dwell per slide
  /** false when the file was too large to keep in browser storage */
  persisted: boolean;
}
