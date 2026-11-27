import {
  PANEL_PITCH, PANEL_PRINT_W, PANEL_PRINT_H, FASCIA_PRINT_H, FASCIA_PRINT_W_BAY,
  SQM_TO_SQFT, TV_SIZES, TV_DEFAULT_IDX, FOOTPRINT, TOTAL_H,
} from './constants';
import type { Config, EdgeId, ItemType, Placement, Tv, WallId } from './types';

// --- Topology --------------------------------------------------------------
// Convention: X = width axis, Z = depth axis, origin at floor centre.
// The FRONT edge (z = +D/2) is always open. Walls close the remainder.

export function wallsFor(openSides: 1 | 2 | 3, mirror: boolean): WallId[] {
  if (openSides === 1) return ['back', 'left', 'right'];
  if (openSides === 2) return mirror ? ['back', 'right'] : ['back', 'left'];
  return ['back'];
}

/** Fascia runs along the OPEN edges — the complement of the walls. */
export function fasciaEdges(openSides: 1 | 2 | 3, mirror: boolean): EdgeId[] {
  if (openSides === 1) return ['front'];
  if (openSides === 2) return mirror ? ['front', 'left'] : ['front', 'right'];
  return ['front', 'left', 'right'];
}

export const wallLength = (w: WallId, W: number, D: number) => (w === 'back' ? W : D);
export const edgeLength = (e: EdgeId, W: number, D: number) => (e === 'front' ? W : D);

/** One panel per running metre (960 mm leaf + 40 mm upright = 1000 mm pitch). */
export const panelsOnWall = (w: WallId, W: number, D: number) =>
  Math.round(wallLength(w, W, D) / PANEL_PITCH);

/** Map a distance `t` along a wall to a world position + facing rotation. */
export function wallPoint(w: WallId, t: number, W: number, D: number) {
  if (w === 'back')  return { x: -W / 2 + t, z: -D / 2, rotY: 0 };
  if (w === 'left')  return { x: -W / 2, z: -D / 2 + t, rotY: Math.PI / 2 };
  return { x: W / 2, z: -D / 2 + t, rotY: -Math.PI / 2 };
}

export function edgePoint(e: EdgeId, t: number, W: number, D: number) {
  if (e === 'front') return { x: -W / 2 + t, z: D / 2, rotY: Math.PI };
  if (e === 'left')  return { x: -W / 2, z: -D / 2 + t, rotY: Math.PI / 2 };
  return { x: W / 2, z: -D / 2 + t, rotY: -Math.PI / 2 };
}

// --- Package scaling -------------------------------------------------------
// Reference pack is 9 sqm: 3 spotlights, 5 chairs, 1 round table,
// 1 counter, 1 cabinet, 1 socket, 1 bin. Everything scales pro-rata.

export const ITEM_TYPES: ItemType[] = ['counter', 'table', 'cabinet', 'kiosk', 'bin'];

export const ITEM_LABEL: Record<ItemType, string> = {
  counter: 'Reception counter',
  table: 'Coffee table + chairs',
  cabinet: 'Lockable cabinet',
  kiosk: 'Touchscreen kiosk',
  bin: 'Dustbin',
};

export function defaultCounts(area: number): Record<ItemType, number> & {
  spotlights: number; tvs: number;
} {
  return {
    counter: 1,
    table: area <= 15 ? 1 : area <= 28 ? 2 : 3,
    cabinet: Math.max(1, Math.round(area / 18)),
    kiosk: area <= 12 ? 0 : area <= 28 ? 1 : 2,
    bin: 1,
    spotlights: Math.max(3, Math.ceil(area / 3)),
    tvs: area <= 12 ? 1 : area <= 20 ? 1 : area <= 28 ? 2 : 3,
  };
}

// --- Auto layout -----------------------------------------------------------
// Each item type has its own anchor rule, indexed so that adding an item later
// lands somewhere sensible rather than on top of its neighbour.

export function anchorFor(type: ItemType, i: number, cfg: Config) {
  const W = cfg.width, D = cfg.depth;
  // On a corner stall the wall sits on one side; staff items back onto it.
  const wallSide = cfg.mirror ? 1 : -1;
  const clampZ = (z: number) => Math.min(D / 2 - 0.6, Math.max(-D / 2 + 0.5, z));
  const clampX = (x: number) => Math.min(W / 2 - 0.4, Math.max(-W / 2 + 0.4, x));

  switch (type) {
    case 'counter':
      return { x: clampX(wallSide * (W / 2 - 0.75)), z: clampZ(D / 2 - 0.95 - i * 1.1), rotY: 0 };
    case 'cabinet':
      return { x: clampX(wallSide * (W / 2 - 0.55 - i * 1.0)), z: clampZ(-D / 2 + 0.3), rotY: 0 };
    case 'table':
      return { x: clampX(-wallSide * (W * 0.16)), z: clampZ(-D / 2 + 1.3 + i * 1.7), rotY: 0 };
    case 'kiosk':
      return {
        x: clampX(-wallSide * (W / 2 - 0.45)),
        z: clampZ(D / 2 - 0.7 - i * 1.3),
        rotY: wallSide * 0.6,
      };
    case 'bin':
    default:
      return { x: clampX(wallSide * (W / 2 - 0.25)), z: clampZ(D / 2 - 1.7 - i * 0.6), rotY: 0 };
  }
}

export function autoLayout(cfg: Config): Placement[] {
  const c = defaultCounts(cfg.width * cfg.depth);
  const out: Placement[] = [];
  for (const type of ITEM_TYPES) {
    for (let i = 0; i < c[type]; i++) {
      out.push({ id: `${type}-${i}`, type, ...anchorFor(type, i, cfg) });
    }
  }
  return out;
}

export function autoTvs(cfg: Config): Tv[] {
  const { width: W, depth: D } = cfg;
  const c = defaultCounts(W * D);
  const size = TV_SIZES[TV_DEFAULT_IDX];
  const walls = wallsFor(cfg.openSides, cfg.mirror);

  // A TV blanks every panel it covers. Open stalls have few panels to begin
  // with, so the DEFAULT layout never spends more than half of them on screens
  // -- otherwise a 3-sides-open stall ships with no printable graphics at all.
  // The user can still add more by hand; computeSpecs warns when they do.
  const span = Math.ceil(size.w / PANEL_PITCH);
  const panelTotal = walls.reduce((a, w) => a + panelsOnWall(w, W, D), 0);
  const maxByBudget = Math.floor(Math.floor(panelTotal * 0.5) / span);

  const out: Tv[] = [];
  let remaining = Math.max(0, Math.min(c.tvs, maxByBudget));
  for (const wall of walls) {
    if (remaining <= 0) break;
    const len = wallLength(wall, W, D);
    const fit = Math.max(0, Math.floor(len / (size.w + 0.4)));
    const n = Math.min(fit, remaining);
    for (let i = 0; i < n; i++) {
      out.push({ id: `tv-${out.length}`, wall,
        t: (len * (i + 1)) / (n + 1), sizeIdx: TV_DEFAULT_IDX });
    }
    remaining -= n;
  }
  return out;
}

// --- Lighting --------------------------------------------------------------

export interface SpotSpec { id: string; pos: [number, number, number]; target: [number, number, number] }

export function spotlights(cfg: Config): SpotSpec[] {
  const W = cfg.width, D = cfg.depth;
  const total = defaultCounts(W * D).spotlights;
  const edges = fasciaEdges(cfg.openSides, cfg.mirror);
  const lens = edges.map((e) => edgeLength(e, W, D));
  const sum = lens.reduce((a, b) => a + b, 0);

  const out: SpotSpec[] = [];
  edges.forEach((e, ei) => {
    const n = Math.max(1, Math.round((lens[ei] / sum) * total));
    for (let i = 0; i < n; i++) {
      const t = (lens[ei] * (i + 1)) / (n + 1);
      const p = edgePoint(e, t, W, D);
      // Pull the fitting slightly inboard of the fascia line.
      const inset = 0.18;
      const px = e === 'front' ? p.x : p.x + (e === 'left' ? inset : -inset);
      const pz = e === 'front' ? p.z - inset : p.z;
      // Front spots wash the back wall; side spots wash the floor centreline.
      const target: [number, number, number] =
        e === 'front' ? [px, 1.3, -D / 2] : [0, 0.9, pz];
      out.push({ id: `spot-${out.length}`, pos: [px, TOTAL_H - 0.12, pz], target });
    }
  });
  return out;
}

// --- Specification / BOM ---------------------------------------------------

export interface Specs {
  area: number; areaFt: number;
  panelCount: number; fasciaLen: number;
  fasciaPrintSqm: number; fasciaPrintSqft: number;
  panelPrintGrossSqm: number; panelPrintNetSqm: number; panelPrintNetSqft: number;
  totalPrintSqm: number; totalPrintSqft: number;
  panelsConsumedByTv: number;
  spotlights: number; sockets: number;
  counters: number; tables: number; chairs: number;
  cabinets: number; kiosks: number; tvs: number; bins: number;
  floorUsed: number; density: number;
  warnings: string[];
}

export function computeSpecs(cfg: Config, placements: Placement[], tvs: Tv[]): Specs {
  const W = cfg.width, D = cfg.depth;
  const area = W * D;

  const walls = wallsFor(cfg.openSides, cfg.mirror);
  const panelCount = walls.reduce((a, w) => a + panelsOnWall(w, W, D), 0);

  const edges = fasciaEdges(cfg.openSides, cfg.mirror);
  const fasciaLen = edges.reduce((a, e) => a + edgeLength(e, W, D), 0);

  // Fascia prints 2970 of every 3000 mm, and 260 of the 300 mm band.
  const fasciaPrintSqm = fasciaLen * (FASCIA_PRINT_W_BAY / 3) * FASCIA_PRINT_H;

  const panelPrintGrossSqm = panelCount * PANEL_PRINT_W * PANEL_PRINT_H;
  // A TV kills the whole panel(s) it covers — you don't print behind it.
  const panelsConsumedByTv = tvs.reduce(
    (a, t) => a + Math.ceil(TV_SIZES[t.sizeIdx].w / PANEL_PITCH), 0);
  const panelPrintNetSqm = Math.max(
    0, (panelCount - panelsConsumedByTv) * PANEL_PRINT_W * PANEL_PRINT_H);

  const totalPrintSqm = fasciaPrintSqm + panelPrintNetSqm;

  const count = (t: string) => placements.filter((p) => p.type === t).length;
  const tables = count('table');
  const spots = spotlights(cfg).length;
  const kiosks = count('kiosk');
  const sockets = 1 + tvs.length + kiosks;

  const floorUsed = placements.reduce((a, p) => a + (FOOTPRINT[p.type] ?? 0), 0);
  const density = floorUsed / area;

  const warnings: string[] = [];
  if (panelsConsumedByTv > panelCount) {
    warnings.push(
      `TVs need ${panelsConsumedByTv} panels but this layout only has ${panelCount}. ` +
      `Reduce TV count or size, or close a side.`);
  } else if (panelCount > 0 && panelsConsumedByTv / panelCount > 0.5) {
    warnings.push(
      `TVs consume ${panelsConsumedByTv} of ${panelCount} wall panels — over half your ` +
      `printable graphics. Consider fewer or smaller screens.`);
  }
  if (cfg.openSides === 3 && tvs.length > 0 && panelCount <= 4) {
    warnings.push(
      `A 3-sides-open stall has only ${panelCount} wall panels. Wall-mounted TVs and ` +
      `branding are competing for the same small area.`);
  }
  if (density > 0.5) {
    warnings.push(
      `Floor is ${Math.round(density * 100)}% committed before circulation. ` +
      `Exhibition layouts want ~50% free — drop an item or go larger.`);
  }
  if (tvs.length > 0) {
    warnings.push(
      `${tvs.length} TV${tvs.length > 1 ? 's' : ''} and ${kiosks} kiosk${kiosks === 1 ? '' : 's'} ` +
      `need ${sockets} power points, not the 1 included in a standard package.`);
  }

  return {
    area, areaFt: area * SQM_TO_SQFT,
    panelCount, fasciaLen,
    fasciaPrintSqm, fasciaPrintSqft: fasciaPrintSqm * SQM_TO_SQFT,
    panelPrintGrossSqm, panelPrintNetSqm, panelPrintNetSqft: panelPrintNetSqm * SQM_TO_SQFT,
    totalPrintSqm, totalPrintSqft: totalPrintSqm * SQM_TO_SQFT,
    panelsConsumedByTv,
    spotlights: spots, sockets,
    counters: count('counter'), tables, chairs: tables * cfg.chairsPerTable,
    cabinets: count('cabinet'), kiosks, tvs: tvs.length, bins: count('bin'),
    floorUsed, density,
    warnings,
  };
}
