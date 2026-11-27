// ---------------------------------------------------------------------------
// Shell-scheme module system. All dimensions in METRES (three.js world units).
// Derived from the reference 3000 x 3000 stall drawing.
// ---------------------------------------------------------------------------

export const PANEL_PITCH = 1.0;    // 1000 mm module: 960 leaf + 40 upright
export const PANEL_LEAF  = 0.96;   // 960 mm visible panel leaf
export const POST_W      = 0.04;   // 40 mm aluminium upright
export const TOTAL_H     = 2.5;    // 2500 mm overall stall height
export const FASCIA_H    = 0.30;   // 300 mm fascia band
export const PANEL_ZONE_H = TOTAL_H - FASCIA_H; // 2200 mm panel zone
export const WALL_T      = 0.05;   // nominal wall thickness

// Print areas (the 40 mm frame overlap is the production gotcha)
export const FASCIA_PRINT_H = 0.26;        // 260 mm of the 300 mm band prints
export const FASCIA_PRINT_W_BAY = 2.97;    // 2970 mm prints on a 3000 mm bay
export const PANEL_PRINT_W = 0.96;
export const PANEL_PRINT_H = 2.18;         // ASSUMED pending confirmation

export const SQM_TO_SQFT = 10.7639;

// --- Furniture -------------------------------------------------------------
export const COUNTER = { w: 1.0, d: 0.5, h: 1.0, faceW: 0.96, faceH: 0.62 };
export const KIOSK   = { w: 0.55, d: 0.55, h: 1.9, screenW: 0.42, screenH: 0.75 };
export const CABINET = { w: 0.9, d: 0.45, h: 1.0 };
export const RTABLE  = { r: 0.4, h: 0.75 };
export const CHAIR   = { w: 0.45, d: 0.45, seatH: 0.45, backH: 0.85 };
export const BIN     = { r: 0.15, h: 0.6 };

// --- TVs -------------------------------------------------------------------
export interface TvSize { label: string; w: number; h: number }
export const TV_SIZES: TvSize[] = [
  { label: '32"', w: 0.727, h: 0.425 },
  { label: '43"', w: 0.963, h: 0.560 },
  { label: '50"', w: 1.113, h: 0.650 },
  { label: '55"', w: 1.235, h: 0.715 },
  { label: '65"', w: 1.453, h: 0.840 },
  { label: '75"', w: 1.676, h: 0.969 },
  { label: '86"', w: 1.927, h: 1.106 },
];
export const TV_DEFAULT_IDX = 3;   // 55"
export const TV_CENTRE_H = 1.4;    // standing eye line
export const TV_DEPTH = 0.07;

// Floor area each item effectively consumes, including approach / staff zone
export const FOOTPRINT: Record<string, number> = {
  counter: 1.5, table: 2.4, cabinet: 0.8, kiosk: 0.74, bin: 0.1,
};

export const SIZES = [3, 4, 5, 6] as const;

/** Clear walkway between blocks of stalls, metres. */
export const AISLE_W = 3;
