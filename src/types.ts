export type WallId = 'back' | 'left' | 'right';
export type EdgeId = 'front' | 'left' | 'right';
export type ItemType = 'counter' | 'table' | 'cabinet' | 'kiosk' | 'bin';

export interface Placement {
  id: string;
  type: ItemType;
  x: number;
  z: number;
  rotY: number;
}

export interface Tv {
  id: string;
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
  logo: string | null;      // data URL
  carpet: string;
  fasciaColor: string;
  fasciaTextColor: string;
  showSpotBeams: boolean;
  showHall: boolean;
  ambient: number;
  chairsPerTable: number;
}
