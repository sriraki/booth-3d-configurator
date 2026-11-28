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

/** Navy caption plate on a display step's riser, as in the client's mockup. */
export function makeStepLabelTexture(text: string) {
  return canvasTexture(1.0, 0.22, (ctx, w, h) => {
    ctx.fillStyle = '#13306d';
    ctx.fillRect(0, 0, w, h);
    // a lighter inner field so the plate reads as a mounted sign, not paint
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.lineWidth = Math.max(1, h * 0.018);
    ctx.strokeRect(h * 0.1, h * 0.1, w - h * 0.2, h - h * 0.2);

    const pad = h * 0.26;
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    // Two lines when it will not fit on one, split near the middle word break.
    const size = fitText(ctx, text, w - pad * 2, h * 0.46);
    if (size >= h * 0.3) {
      ctx.fillText(text, pad, h / 2);
      return;
    }
    const words = text.split(' ');
    let best = 1;
    for (let i = 1; i < words.length; i++) {
      if (Math.abs(i - words.length / 2) < Math.abs(best - words.length / 2)) best = i;
    }
    const l1 = words.slice(0, best).join(' ');
    const l2 = words.slice(best).join(' ');
    const s2 = Math.min(
      fitText(ctx, l1, w - pad * 2, h * 0.4),
      fitText(ctx, l2, w - pad * 2, h * 0.4),
    );
    ctx.font = `700 ${s2}px Helvetica, Arial, sans-serif`;
    ctx.fillText(l1, pad, h * 0.33);
    ctx.fillText(l2, pad, h * 0.68);
  });
}

/**
 * Flat artwork for a 2D cutout standee: a schoolchild in uniform, drawn on a
 * transparent canvas so the plane reads as a cut silhouette rather than a
 * rectangle. Deliberately simple and graphic -- it is printed flat board.
 */
export function makeStandeeTexture(kind: 'girl' | 'boy') {
  const girl = kind === 'girl';
  const tex = canvasTexture(0.6, 1.55, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    const cx = w / 2;
    const U = h / 155;                       // 1 cm of a 155 cm figure
    const skin = '#e0ac7e', navy = '#15306d', white = '#fbfbfb';
    const hair = '#241a14', shoe = '#23262b';

    const headR = 11 * U;
    const headY = 18 * U;

    // legs
    ctx.fillStyle = skin;
    [-5, 5].forEach((dx) => {
      ctx.fillRect(cx + dx * U - 4 * U, h - 46 * U, 8 * U, 40 * U);
    });
    // shoes
    ctx.fillStyle = shoe;
    [-5, 5].forEach((dx) => {
      ctx.beginPath();
      ctx.ellipse(cx + dx * U, h - 4 * U, 7 * U, 4.5 * U, 0, 0, Math.PI * 2);
      ctx.fill();
    });
    // socks
    ctx.fillStyle = white;
    [-5, 5].forEach((dx) => ctx.fillRect(cx + dx * U - 4.2 * U, h - 18 * U, 8.4 * U, 10 * U));

    if (girl) {
      // pinafore
      ctx.fillStyle = navy;
      ctx.beginPath();
      ctx.moveTo(cx - 13 * U, headY + headR + 10 * U);
      ctx.lineTo(cx + 13 * U, headY + headR + 10 * U);
      ctx.lineTo(cx + 20 * U, h - 50 * U);
      ctx.lineTo(cx - 20 * U, h - 50 * U);
      ctx.closePath();
      ctx.fill();
    } else {
      // shorts
      ctx.fillStyle = navy;
      ctx.fillRect(cx - 15 * U, h - 68 * U, 30 * U, 24 * U);
    }

    // shirt
    ctx.fillStyle = white;
    ctx.fillRect(cx - 15 * U, headY + headR + 2 * U, 30 * U, girl ? 16 * U : 38 * U);
    // collar + tie
    ctx.fillStyle = navy;
    ctx.beginPath();
    ctx.moveTo(cx - 6 * U, headY + headR + 2 * U);
    ctx.lineTo(cx, headY + headR + 10 * U);
    ctx.lineTo(cx + 6 * U, headY + headR + 2 * U);
    ctx.closePath();
    ctx.fill();
    ctx.fillRect(cx - 2.5 * U, headY + headR + 8 * U, 5 * U, 16 * U);

    // arms
    ctx.fillStyle = skin;
    [-19, 19].forEach((dx) => {
      ctx.fillRect(cx + dx * U - 4 * U, headY + headR + 4 * U, 8 * U, 34 * U);
    });
    ctx.fillStyle = white;
    [-19, 19].forEach((dx) => {
      ctx.fillRect(cx + dx * U - 4.4 * U, headY + headR + 4 * U, 8.8 * U, 14 * U);
    });

    // head
    ctx.fillStyle = hair;
    ctx.beginPath();
    ctx.arc(cx, headY, headR + 3 * U, Math.PI, Math.PI * 2);
    ctx.fill();
    if (girl) {
      [-1, 1].forEach((s) => {
        ctx.beginPath();
        ctx.ellipse(cx + s * (headR + 2 * U), headY + 6 * U, 5 * U, 11 * U, 0, 0, Math.PI * 2);
        ctx.fill();
      });
    }
    ctx.fillStyle = skin;
    ctx.beginPath();
    ctx.arc(cx, headY, headR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = hair;
    ctx.beginPath();
    ctx.arc(cx, headY - 2 * U, headR, Math.PI * 1.05, Math.PI * 1.95);
    ctx.fill();
    // eyes + smile
    ctx.fillStyle = '#2a2018';
    [-4, 4].forEach((dx) => {
      ctx.beginPath();
      ctx.arc(cx + dx * U, headY + 1 * U, 1.5 * U, 0, Math.PI * 2);
      ctx.fill();
    });
    ctx.strokeStyle = '#8a4a3a';
    ctx.lineWidth = 1.4 * U;
    ctx.beginPath();
    ctx.arc(cx, headY + 3 * U, 4.5 * U, 0.25 * Math.PI, 0.75 * Math.PI);
    ctx.stroke();
  });
  return tex;
}

/** Default photo-booth backdrop until the client drops their own artwork on it. */
export function makePhotoBackdrop(title: string, accent = '#15306d') {
  return canvasTexture(2.1, 2.0, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, accent);
    g.addColorStop(1, '#0b1c42');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // a gold frame to stand inside
    ctx.strokeStyle = '#d9b26a';
    ctx.lineWidth = h * 0.012;
    const m = h * 0.07;
    ctx.strokeRect(m, m, w - m * 2, h - m * 2);
    ctx.lineWidth = h * 0.004;
    ctx.strokeRect(m * 1.5, m * 1.5, w - m * 3, h - m * 3);

    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const size = fitText(ctx, title, w * 0.72, h * 0.075);
    ctx.font = `700 ${size}px Helvetica, Arial, sans-serif`;
    ctx.fillText(title, w / 2, h * 0.17);

    ctx.fillStyle = '#d9b26a';
    const s2 = fitText(ctx, '# PHOTO BOOTH', w * 0.4, h * 0.045);
    ctx.font = `700 ${s2}px Helvetica, Arial, sans-serif`;
    ctx.fillText('# PHOTO BOOTH', w / 2, h * 0.87);
  });
}

/** Caption plate on the model vitrine's plinth. */
export function makePlinthTexture(title: string) {
  return canvasTexture(1.219, 0.2, (ctx, w, h) => {
    ctx.fillStyle = '#15306d';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(217,178,106,0.75)';
    ctx.lineWidth = Math.max(1, h * 0.03);
    ctx.strokeRect(h * 0.16, h * 0.16, w - h * 0.32, h - h * 0.32);
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const size = fitText(ctx, title, w * 0.84, h * 0.46);
    ctx.font = `700 ${size}px Helvetica, Arial, sans-serif`;
    ctx.fillText(title, w / 2, h / 2);
  });
}

/** A titled band: the edge of a model base, or a banner across a model. */
export function makeBandTexture(
  title: string, bg = '#12304f', fg = '#ffffff', wM = 1.6, hM = 0.12,
) {
  return canvasTexture(wM, hM, (ctx, w, h) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const size = fitText(ctx, title, w * 0.94, h * 0.62);
    ctx.font = `700 ${size}px Helvetica, Arial, sans-serif`;
    ctx.fillText(title, w / 2, h / 2);
  });
}

/** The Anna-Akka header board: title, strapline and tagline on navy. */
export function makeMentorshipHeader() {
  return canvasTexture(0.78, 0.3, (ctx, w, h) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#11224a';
    ctx.fillRect(h * 0.06, h * 0.06, w - h * 0.12, h - h * 0.12);
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    ctx.fillStyle = '#ffc425';
    let size = fitText(ctx, 'ANNA–AKKA MENTORSHIP', w * 0.86, h * 0.26);
    ctx.font = `800 ${size}px Helvetica, Arial, sans-serif`;
    ctx.fillText('ANNA–AKKA MENTORSHIP', w / 2, h * 0.3);

    ctx.fillStyle = '#ffffff';
    size = fitText(ctx, 'Teaching Internship Programme on AI & Digital Learning',
      w * 0.86, h * 0.1);
    ctx.font = `600 ${size}px Helvetica, Arial, sans-serif`;
    ctx.fillText('Teaching Internship Programme on AI & Digital Learning', w / 2, h * 0.48);

    ctx.fillStyle = '#35c6f4';
    size = fitText(ctx, 'INTEGRATING TWO GENERATIONS', w * 0.8, h * 0.17);
    ctx.font = `800 ${size}px Helvetica, Arial, sans-serif`;
    ctx.fillText('INTEGRATING TWO GENERATIONS', w / 2, h * 0.66);

    ctx.fillStyle = '#ffffff';
    size = fitText(ctx, 'Learn Together. Grow Together. Lead Tomorrow.', w * 0.78, h * 0.1);
    ctx.font = `600 ${size}px Helvetica, Arial, sans-serif`;
    ctx.fillText('Learn Together. Grow Together. Lead Tomorrow.', w / 2, h * 0.84);
  });
}

/** One of the stepped tiers, or one plate of the institution stack. */
export function makeTierTexture(text: string, bg: string, fg = '#ffffff') {
  return canvasTexture(0.6, 0.075, (ctx, w, h) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = fg;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const size = fitText(ctx, text, w * 0.94, h * 0.7);
    ctx.font = `800 ${size}px Helvetica, Arial, sans-serif`;
    ctx.fillText(text, w / 2, h / 2);
  });
}

/**
 * Floral photo frame, drawn on a transparent canvas so the centre is a real
 * opening: the mesh uses alphaTest, and people stand in the hole. Scattered
 * blooms deliberately overrun the board edge, as a cut foam frame does.
 */
export function makeFloralFrame(wM: number, hM: number, openW: number, openH: number) {
  const tex = canvasTexture(wM, hM, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    const ow = (openW / wM) * w, oh = (openH / hM) * h;
    const ox = (w - ow) / 2, oy = (h - oh) / 2;

    // the board itself: a white frame with the centre knocked out
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.clearRect(ox, oy, ow, oh);
    ctx.strokeStyle = '#d8d4cc';
    ctx.lineWidth = Math.max(1, w * 0.004);
    ctx.strokeRect(ox, oy, ow, oh);

    const PAL = ['#7b3fd1', '#9b59d0', '#c0398f', '#e05a9a', '#f0a0c0',
      '#e8721c', '#f0b400', '#17a398', '#2f7d3f', '#5bbf6a'];
    const LEAF = ['#2f7d3f', '#3f9d52', '#17a398', '#6fbf73', '#8dc63f'];

    const leaf = (x: number, y: number, r: number, a: number, c: string) => {
      ctx.save(); ctx.translate(x, y); ctx.rotate(a);
      ctx.fillStyle = c;
      ctx.beginPath();
      ctx.ellipse(0, 0, r, r * 0.42, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    };
    const bloom = (x: number, y: number, r: number, c: string, mid: string, n: number) => {
      ctx.save(); ctx.translate(x, y);
      ctx.fillStyle = c;
      for (let i = 0; i < n; i++) {
        ctx.save();
        ctx.rotate((i / n) * Math.PI * 2);
        ctx.beginPath();
        ctx.ellipse(0, -r * 0.62, r * 0.34, r * 0.62, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }
      ctx.fillStyle = mid;
      ctx.beginPath(); ctx.arc(0, 0, r * 0.3, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    };

    // Deterministic scatter: the same frame every render, no flicker.
    let seed = 7;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;

    // Walk the opening's perimeter and plant along it, straying outward.
    const pts: [number, number][] = [];
    const steps = 44;
    for (let i = 0; i < steps; i++) {
      const t = i / steps;
      const peri = 2 * (ow + oh);
      let d = t * peri;
      let x: number, y: number, nx: number, ny: number;
      if (d < ow) { x = ox + d; y = oy; nx = 0; ny = -1; }
      else if ((d -= ow) < oh) { x = ox + ow; y = oy + d; nx = 1; ny = 0; }
      else if ((d -= oh) < ow) { x = ox + ow - d; y = oy + oh; nx = 0; ny = 1; }
      else { d -= ow; x = ox; y = oy + oh - d; nx = -1; ny = 0; }
      const off = (0.35 + rnd() * 0.75) * Math.min(w, h) * 0.07;
      pts.push([x + nx * off, y + ny * off]);
    }
    for (const [x, y] of pts) {
      if (rnd() < 0.45) {
        leaf(x, y, Math.min(w, h) * (0.03 + rnd() * 0.035), rnd() * Math.PI,
          LEAF[Math.floor(rnd() * LEAF.length)]);
      } else {
        const r = Math.min(w, h) * (0.028 + rnd() * 0.042);
        const c = PAL[Math.floor(rnd() * PAL.length)];
        const mid = ['#f0b400', '#f0a0c0', '#ffffff'][Math.floor(rnd() * 3)];
        bloom(x, y, r, c, mid, 5 + Math.floor(rnd() * 4));
      }
      // a few dots, as the reference has
      ctx.fillStyle = PAL[Math.floor(rnd() * PAL.length)];
      ctx.beginPath();
      ctx.arc(x + (rnd() - 0.5) * w * 0.1, y + (rnd() - 0.5) * h * 0.05,
        Math.min(w, h) * 0.007, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  return tex;
}
