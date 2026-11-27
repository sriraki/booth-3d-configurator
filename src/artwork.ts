import * as THREE from 'three';
import { FASCIA_PRINT_H, PANEL_PRINT_W, PANEL_PRINT_H, COUNTER, KIOSK } from './constants';
import { edgeLength } from './booth';
import type { Config, EdgeId } from './types';

// ---------------------------------------------------------------------------
// Surfaces are addressed by a stable string id so artwork survives re-layout.
//   panel:back:0   panel:left:2   fascia:front   counter:counter-0   kiosk:kiosk-0
// ---------------------------------------------------------------------------

export type SurfaceId = string;

export type FitMode = 'cover' | 'contain' | 'stretch';

export interface Artwork {
  name: string;
  src: string;          // object URL for rendering
  blob?: Blob;          // kept so the project can be persisted / re-exported
  imgW: number;
  imgH: number;
  fit: FitMode;
  offsetX: number;      // -1..1, fraction of the overflow
  offsetY: number;
  scale: number;        // 1 = exact fit
  rotation: 0 | 90 | 180 | 270;
  bg: string;           // letterbox colour for 'contain'
}

export const DEFAULT_ARTWORK: Omit<Artwork, 'name' | 'src' | 'imgW' | 'imgH'> = {
  fit: 'cover', offsetX: 0, offsetY: 0, scale: 1, rotation: 0, bg: '#ffffff',
};

/** Physical printable size of a surface, in millimetres. */
export interface PrintSpec { w: number; h: number; frame: number; label: string }

export function surfacePrint(id: SurfaceId, cfg: Config): PrintSpec | null {
  const [kind, a] = id.split(':');
  if (kind === 'panel') {
    return { w: PANEL_PRINT_W * 1000, h: PANEL_PRINT_H * 1000, frame: 15, label: 'Wall panel' };
  }
  if (kind === 'fascia') {
    const len = edgeLength(a as EdgeId, cfg.width, cfg.depth) * 1000;
    return { w: len - 30, h: FASCIA_PRINT_H * 1000, frame: 20, label: 'Fascia' };
  }
  if (kind === 'counter') {
    return { w: COUNTER.faceW * 1000, h: COUNTER.faceH * 1000, frame: 10, label: 'Counter face' };
  }
  if (kind === 'kiosk') {
    return { w: KIOSK.screenW * 1000, h: KIOSK.screenH * 1000, frame: 0, label: 'Kiosk screen' };
  }
  return null;
}

export function surfaceLabel(id: SurfaceId): string {
  const [kind, a, b] = id.split(':');
  if (kind === 'panel') return `${a} wall · panel ${Number(b) + 1}`;
  if (kind === 'fascia') return `fascia · ${a}`;
  if (kind === 'counter') return 'counter face';
  if (kind === 'kiosk') return 'kiosk screen';
  return id;
}

// --- Resolution -------------------------------------------------------------
// Large-format exhibition graphics are viewed from 1-3 m. 100 dpi at full size
// is the usual target; below 72 dpi it visibly softens.

export const TARGET_DPI = 100;
export const MIN_DPI = 72;

export function effectiveDpi(art: Artwork, spec: PrintSpec) {
  const swap = art.rotation === 90 || art.rotation === 270;
  const iw = swap ? art.imgH : art.imgW;
  const ih = swap ? art.imgW : art.imgH;
  // cover crops, so the binding axis is whichever is scaled up more
  const dpiW = iw / (spec.w / 25.4);
  const dpiH = ih / (spec.h / 25.4);
  return art.fit === 'contain' ? Math.max(dpiW, dpiH) : Math.min(dpiW, dpiH);
}

export function resolutionVerdict(dpi: number): 'ok' | 'soft' | 'bad' {
  if (dpi >= TARGET_DPI) return 'ok';
  if (dpi >= MIN_DPI) return 'soft';
  return 'bad';
}

// --- Texture building -------------------------------------------------------
// Everything is composited onto a canvas at the surface's own aspect ratio.
// Doing the fit in 2D rather than with texture.repeat means 'contain' can
// letterbox properly and rotation / nudge all work the same way.

const MAX_EDGE = 1280;   // keeps 18 panels of artwork inside sane memory

export function buildArtworkTexture(
  img: HTMLImageElement, art: Artwork, spec: PrintSpec,
): THREE.CanvasTexture {
  const aspect = spec.w / spec.h;
  let cw: number, ch: number;
  if (aspect >= 1) { cw = MAX_EDGE; ch = Math.max(16, Math.round(MAX_EDGE / aspect)); }
  else { ch = MAX_EDGE; cw = Math.max(16, Math.round(MAX_EDGE * aspect)); }

  const cv = document.createElement('canvas');
  cv.width = cw; cv.height = ch;
  const ctx = cv.getContext('2d')!;

  ctx.fillStyle = art.fit === 'contain' ? art.bg : '#ffffff';
  ctx.fillRect(0, 0, cw, ch);

  const swap = art.rotation === 90 || art.rotation === 270;
  const iw = swap ? img.naturalHeight : img.naturalWidth;
  const ih = swap ? img.naturalWidth : img.naturalHeight;
  const imgAspect = iw / ih;

  // Base draw size before the user's scale multiplier
  let dw: number, dh: number;
  if (art.fit === 'stretch') {
    dw = cw; dh = ch;
  } else if (art.fit === 'cover') {
    if (imgAspect > aspect) { dh = ch; dw = ch * imgAspect; }
    else { dw = cw; dh = cw / imgAspect; }
  } else {
    if (imgAspect > aspect) { dw = cw; dh = cw / imgAspect; }
    else { dh = ch; dw = ch * imgAspect; }
  }
  dw *= art.scale; dh *= art.scale;

  // Nudge is expressed as a fraction of the overflow on each axis, so it
  // cannot push artwork off a surface it already fits.
  const overX = Math.max(0, dw - cw) / 2;
  const overY = Math.max(0, dh - ch) / 2;
  const cx = cw / 2 + art.offsetX * (overX || (cw - dw) / 2);
  const cy = ch / 2 + art.offsetY * (overY || (ch - dh) / 2);

  ctx.save();
  ctx.translate(cx, cy);
  ctx.rotate((art.rotation * Math.PI) / 180);
  ctx.drawImage(img, swap ? -dh / 2 : -dw / 2, swap ? -dw / 2 : -dh / 2,
    swap ? dh : dw, swap ? dw : dh);
  ctx.restore();

  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

export function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((res, rej) => {
    const img = new Image();
    img.onload = () => res(img);
    img.onerror = () => rej(new Error('image decode failed'));
    img.src = src;
  });
}
