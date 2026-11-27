import * as THREE from 'three';

const PX_PER_M = 420;

function canvasTexture(wM: number, hM: number, draw: (c: CanvasRenderingContext2D, w: number, h: number) => void) {
  const w = Math.max(64, Math.round(wM * PX_PER_M));
  const h = Math.max(64, Math.round(hM * PX_PER_M));
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d')!;
  draw(ctx, w, h);
  const tex = new THREE.CanvasTexture(cv);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  tex.needsUpdate = true;
  return tex;
}

function fitText(ctx: CanvasRenderingContext2D, text: string, maxW: number, startPx: number) {
  let size = startPx;
  do {
    ctx.font = `700 ${size}px Helvetica, Arial, sans-serif`;
    if (ctx.measureText(text).width <= maxW) break;
    size -= 2;
  } while (size > 8);
  return size;
}

/**
 * Fascia band. The face is FASCIA_H tall but only 260 mm of it prints —
 * the top and bottom 20 mm are lost to the frame. The printable window is
 * drawn explicitly so what you see is what the vendor receives.
 */
export function makeFasciaTexture(
  text: string, logo: HTMLImageElement | null,
  lengthM: number, bandH: number, printH: number,
  bg: string, fg: string,
) {
  return canvasTexture(lengthM, bandH, (ctx, w, h) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    const padY = ((bandH - printH) / bandH) * h / 2;  // frame overlap
    const printTop = padY;
    const printHpx = h - padY * 2;

    let x = w / 2;
    let avail = w * 0.92;

    if (logo) {
      const lh = printHpx * 0.78;
      const lw = (logo.width / logo.height) * lh;
      const gap = lh * 0.35;
      const label = text.trim();
      const fs = fitText(ctx, label, avail - lw - gap, printHpx * 0.62);
      const tw = label ? ctx.measureText(label).width : 0;
      const totalW = lw + (label ? gap + tw : 0);
      const startX = (w - totalW) / 2;
      ctx.drawImage(logo, startX, printTop + (printHpx - lh) / 2, lw, lh);
      if (label) {
        ctx.fillStyle = fg;
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.font = `700 ${fs}px Helvetica, Arial, sans-serif`;
        ctx.fillText(label, startX + lw + gap, printTop + printHpx / 2);
      }
    } else {
      const fs = fitText(ctx, text, avail, printHpx * 0.68);
      ctx.fillStyle = fg;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `700 ${fs}px Helvetica, Arial, sans-serif`;
      (ctx as any).letterSpacing = `${Math.round(fs * 0.04)}px`;
      ctx.fillText(text, x, printTop + printHpx / 2);
    }
  });
}

/** Counter front graphic — the 960 x 620 mm printable face. */
export function makeCounterTexture(text: string, logo: HTMLImageElement | null, fg: string) {
  return canvasTexture(0.96, 0.62, (ctx, w, h) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = fg;
    ctx.fillRect(0, h * 0.78, w, h * 0.04);
    if (logo) {
      const lh = h * 0.34;
      const lw = (logo.width / logo.height) * lh;
      const fit = Math.min(lw, w * 0.7);
      ctx.drawImage(logo, (w - fit) / 2, h * 0.22, fit, (fit / lw) * lh);
    } else {
      const fs = fitText(ctx, text, w * 0.82, h * 0.26);
      ctx.fillStyle = fg;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `700 ${fs}px Helvetica, Arial, sans-serif`;
      ctx.fillText(text, w / 2, h * 0.42);
    }
  });
}

/** Kiosk screen — portrait touchscreen placeholder. */
export function makeKioskTexture(text: string, accent: string) {
  return canvasTexture(0.42, 0.75, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#16304d');
    g.addColorStop(1, '#0a1626');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = accent;
    ctx.fillRect(w * 0.12, h * 0.62, w * 0.76, h * 0.012);
    const fs = fitText(ctx, text, w * 0.82, h * 0.1);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${fs}px Helvetica, Arial, sans-serif`;
    ctx.fillText(text, w / 2, h * 0.52);
    ctx.font = `400 ${h * 0.045}px Helvetica, Arial, sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.55)';
    ctx.fillText('TOUCH TO EXPLORE', w / 2, h * 0.72);
  });
}

/** Loose carpet weave so the floor isn't a flat colour under the spots. */
export function makeCarpetTexture(color: string) {
  return canvasTexture(0.5, 0.5, (ctx, w, h) => {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, w, h);
    const img = ctx.getImageData(0, 0, w, h);
    const d = img.data;
    for (let i = 0; i < d.length; i += 4) {
      const n = (Math.random() - 0.5) * 18;
      d[i] += n; d[i + 1] += n; d[i + 2] += n;
    }
    ctx.putImageData(img, 0, 0);
  });
}

/**
 * Indoor hall flooring: large white porcelain tiles with a faint grout line
 * and a little per-tile variation, so a big floor doesn't read as one flat
 * white plane. One canvas covers a 2 x 2 m patch of a 4-tile grid.
 */
export function makeTileTexture(tone = '#fcfcfb', grout = '#d2d0cb') {
  const tex = canvasTexture(2, 2, (ctx, w, h) => {
    ctx.fillStyle = grout;
    ctx.fillRect(0, 0, w, h);
    const n = 2;                 // 1 m tiles, legible from across the hall
    const cell = w / n;
    const gap = Math.max(1, Math.round(cell * 0.012));
    for (let y = 0; y < n; y++) {
      for (let x = 0; x < n; x++) {
        const v = 1 + (Math.random() - 0.5) * 0.035;
        const c = new THREE.Color(tone).multiplyScalar(v);
        ctx.fillStyle = `#${c.getHexString()}`;
        ctx.fillRect(x * cell + gap, y * cell + gap, cell - gap * 2, cell - gap * 2);
        // a soft sheen band, as polished porcelain catches the high bays
        const g = ctx.createLinearGradient(
          x * cell, y * cell, (x + 1) * cell, (y + 1) * cell);
        g.addColorStop(0, 'rgba(255,255,255,0.00)');
        g.addColorStop(0.5, 'rgba(255,255,255,0.07)');
        g.addColorStop(1, 'rgba(255,255,255,0.00)');
        ctx.fillStyle = g;
        ctx.fillRect(x * cell + gap, y * cell + gap, cell - gap * 2, cell - gap * 2);
      }
    }
  });
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}
