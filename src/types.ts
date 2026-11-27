export type WallId = 'back' | 'left' | 'right';
export type EdgeId = 'front' | 'left' | 'right';
export type ItemType =
  'counter' | 'table' | 'cabinet' | 'kiosk' | 'bin' | 'steps'
  | 'glasscase' | 'standeeGirl' | 'standeeBoy' | 'photobooth' | 'modelcase';

/** 'a' and 'b' share one back wall; 'c' stands diagonally across the aisle. */
export type StallId = 'a' | 'b' | 'c';

export interface Placement {
  id: string;
  stall?: StallId;   // absent on sessions saved before the partner stall
  type: ItemType;
  x: number;
  z: number;
  rotY: number;
}

/** Starting fit-out for one stall, overriding the size-based defaults. */
export type Kit = Partial<Record<ItemType, number>> & {
  tvs?: number;
  /** Index into TV_SIZES: this stall's default screen. */
  tvSizeIdx?: number;
  /**
   * Explicit placements for a stall whose fit-out has been designed rather
   * than derived. When present it replaces the generic anchors entirely --
   * a designed stand is a drawing, not a set of rules.
   */
  layout?: { type: ItemType; x: number; z: number; rotY?: number }[];
};

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
  /** A second stall backed onto this one, facing the other way. */
  partner: boolean;
  partnerName: string;
  /** A third stall, diagonally across the aisle crossing. */
  third: boolean;
  thirdName: string;
  thirdOpenSides: 1 | 2 | 3;
  thirdMirror: boolean;
  /** Per-stall furniture overrides. Stalls not listed take the defaults. */
  kit: Partial<Record<StallId, Kit>>;
  /** Design revision. A saved session from an older one starts fresh. */
  rev: number;
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
