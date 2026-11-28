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
  // LED walls, quoted the way a vendor does: width x height, not diagonal.
  { label: '8 × 4.5 ft LED', w: 2.438, h: 1.372 },
  { label: '8 × 6 ft LED', w: 2.438, h: 1.829 },
  { label: '10 × 6 ft LED', w: 3.048, h: 1.829 },
];

export const LED_8X6_IDX = TV_SIZES.findIndex((t) => t.label === '8 × 6 ft LED');

export const TV_DEFAULT_IDX = 3;   // 55"
export const TV_CENTRE_H = 1.4;    // standing eye line

/**
 * Mounting height for a screen of height `h`. A 6 ft LED wall is most of a
 * 2200 mm panel zone, so a fixed centre line would push it through the fascia
 * or into the floor; this drops it only as far as it has to.
 */
export const tvCentreH = (h: number, zoneH: number) =>
  Math.min(Math.max(TV_CENTRE_H, h / 2 + 0.12), zoneH - h / 2 - 0.09);
export const TV_DEPTH = 0.07;

// Floor area each item effectively consumes, including approach / staff zone
export const FOOTPRINT: Record<string, number> = {
  counter: 1.5, table: 2.4, cabinet: 0.8, kiosk: 0.74, bin: 0.1,
  steps: 1.219 * 0.610 * 3,
  glasscase: 0.9 * 0.45 + 0.4, standeeGirl: 0.3, standeeBoy: 0.3,
  photobooth: 2.2 * 1.2, modelcase: 1.219 * 0.610 + 1.2,
  modelMentorship: 1.8 * 0.9 + 1.4, modelAedp: 1.8 * 0.9 + 1.4,
  bookwallU: 2.9 * 0.45 + 1.4,
  mannequinGirl: 0.3, mannequinBoy: 0.3,
  // People are not fixtures: they stand in circulation, they do not consume it.
  figureGroup: 0.2,
};

// --- Project display steps -------------------------------------------------
// A staircase of three platforms, each 4 ft x 2 ft, descending toward the
// stall front so every riser face is readable from the aisle.

export const STEP = { w: 1.219, d: 0.610 };          // 4 ft x 2 ft
export const STEP_HEIGHTS = [1.10, 0.82, 0.54];      // back to front
export const STEP_LABEL_H = 0.22;

export const STEP_TOPICS = [
  'ROBOTICS & AUTOMATION',
  'ELECTRIC VEHICLE TECHNOLOGY',
  'IoT-BASED SMART AGRICULTURE',
];

// --- Display units ---------------------------------------------------------

/** Glass book display: plinth, three shelves, lit vitrine. */
export const GCASE = { w: 0.9, d: 0.45, plinth: 0.25, glass: 1.5, shelves: 3 };

/** 2D cutout standee on a weighted foot. */
export const STANDEE = { w: 0.6, h: 1.55 };

/**
 * Photo frame cutout: a foam-board / timber frame people stand behind, with
 * a decorated border and an open centre. Sits at the exit, not on a wall.
 */
export const PHOTO = {
  w: 1.26, h: 1.72, d: 0.05,
  openW: 0.78, openH: 1.24,
  bottom: 0.49,            // the board is held clear of the floor on legs
};

/**
 * U-shaped book wall: two full-height glazed columns, a bridge over the top
 * and an open centre niche for the screen. Sized to a 3 m stall wall.
 */
export const BWALL = {
  w: 2.9, d: 0.45, h: 2.1,
  col: 0.62,            // width of each side column
  nicheBottom: 0.85,
  nicheTop: 2.0,
  shelves: 4,
};

/** The scale model, under a 4 ft x 2 ft vitrine on a captioned plinth. */
export const MCASE = { w: 1.219, d: 0.610, plinth: 0.85, glass: 0.58 };
export const MCASE_TITLE = 'FROM CLASSROOM TO CAREER';

/** Display table a scale model stands on: 6 ft x 3 ft at working height. */
export const DTABLE = { w: 1.8, d: 0.9, h: 0.78, top: 0.05 };

export const MODEL_TITLES = {
  mentorship: 'ANNA–AKKA MENTORSHIP',
  mentorshipSub: 'TRAIN THE TRAINERS → EMPOWER THE FACULTY → EQUIP THE INTERNS',
  aedp: 'SKILLING TELANGANA: APPRENTICESHIP-EMBEDDED DEGREE PROGRAMMES',
};

/** Uniform display mannequin on a disc base. */
export const MANNEQUIN = { h: 1.62, base: 0.2 };

/**
 * Rough bounding size of each item, width x height x depth. Only used to
 * frame a close-up, so approximate is fine -- it decides how far back the
 * camera stands, not how anything is built.
 */
export const ITEM_EXTENT: Record<string, [number, number, number]> = {
  counter: [1.0, 1.0, 0.5],
  table: [1.72, 1.1, 1.72],
  cabinet: [0.9, 1.0, 0.45],
  kiosk: [0.55, 1.9, 0.55],
  bin: [0.3, 0.6, 0.3],
  steps: [1.22, 2.0, 1.83],
  glasscase: [0.9, 1.75, 0.45],
  standeeGirl: [0.6, 1.55, 0.3],
  standeeBoy: [0.6, 1.55, 0.3],
  photobooth: [1.26, 2.21, 0.5],
  modelcase: [1.22, 1.45, 0.61],
  modelMentorship: [1.8, 1.55, 0.9],
  modelAedp: [1.8, 1.2, 0.9],
  bookwallU: [2.9, 2.1, 0.45],
  mannequinGirl: [0.5, 1.62, 0.5],
  mannequinBoy: [0.5, 1.62, 0.5],
  figureGroup: [1.5, 1.75, 1.0],
};

export const SIZES = [3, 4, 5, 6] as const;

/** Clear walkway between blocks of stalls, metres. */
export const AISLE_W = 3;
