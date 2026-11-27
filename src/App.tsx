import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, ContactShadows } from '@react-three/drei';
import * as THREE from 'three';
import Scene from './Scene';
import { Controls, SpecPanel } from './Sidebar';
import {
  autoLayout, autoLayoutAll, autoTvs, autoTvsAll, computeSpecs, wallsFor, fasciaEdges,
  anchorFor, nextTvSlot, wallLength, stallCfg, stallLabel, stallOf, stallsOf,
  arrangementBounds, STALL_ROLE,
} from './booth';
import { TOTAL_H, TV_DEFAULT_IDX, TV_SIZES, AISLE_W } from './constants';
import type { Config, ItemType, Placement, StallId, Tv, TvMedia } from './types';
import {
  DEFAULT_ARTWORK, buildArtworkTexture, loadImage, surfacePrint, surfaceLabel,
  liveSurfaces, type Artwork, type SurfaceId,
} from './artwork';
import * as store from './storage';

const INITIAL: Config = {
  width: 6, depth: 3, openSides: 2, mirror: true,
  companyName: 'DEPARTMENT OF TECHNICAL EDUCATION',
  partner: true,
  partnerName: 'COMMISSIONERATE OF COLLEGIATE EDUCATION',
  third: true,
  thirdName: 'DEPARTMENT OF INTERMEDIATE EDUCATION',
  thirdOpenSides: 2,
  thirdMirror: true,          // opens its front and its left
  kit: {
    a: { table: 1, kiosk: 0 },   // DTE: one coffee table, no kiosk
    b: { table: 0 },             // CCE: no coffee table
    c: { table: 1, kiosk: 0 },   // DIE: one coffee table, no kiosk
  },
  logo: null,
  carpet: '#6b6e72', fasciaColor: '#ffffff', fasciaTextColor: '#14181c',
  showSpotBeams: false, showHall: true, ambient: 0.62, chairsPerTable: 4,
};

/** Everything that decides how many stalls there are, where they stand and
 *  what each one starts with. A change here rebuilds the layout. */
const keyOf = (c: Partial<Config>) =>
  [c.width, c.depth, c.openSides, c.mirror, c.partner,
   c.third, c.thirdOpenSides, c.thirdMirror, JSON.stringify(c.kit ?? null)].join('|');

/** Drag events don't flow through R3F's pointer system, so the raycast for
 *  drop targeting needs direct access to the scene, camera and canvas. */
function Capture({ sink }: { sink: React.MutableRefObject<any> }) {
  const { scene, camera, gl } = useThree();
  useEffect(() => { sink.current = { scene, camera, gl }; }, [scene, camera, gl, sink]);
  return null;
}

function CameraRig({ view, cfg, controls }: { view: string; cfg: Config; controls: any }) {
  const { camera, size } = useThree();
  useEffect(() => {
    const W = cfg.width, D = cfg.depth;
    const cam = camera as THREE.PerspectiveCamera;
    const vFov = THREE.MathUtils.degToRad(cam.fov);
    const hFov = 2 * Math.atan(Math.tan(vFov / 2) * cam.aspect);

    // Distance at which a w x h subject fits BOTH axes of this canvas.
    // The centre stage is often portrait, so the horizontal fov is the binding
    // constraint and a width-agnostic distance crops wide stalls.
    const fit = (w: number, h: number) =>
      Math.max((w / 2) / Math.tan(hFov / 2), (h / 2) / Math.tan(vFov / 2)) * 1.18;

    // Elevations look straight into one stall; hero and plan frame the whole
    // arrangement, which with three stalls is much wider than any one of them.
    const b = arrangementBounds(cfg);
    const aZ = D / 2 + 0.025;            // centre of the front stall
    const front = aZ + D / 2;            // its open frontage
    const dFront = fit(W + 0.8, TOTAL_H + 0.7);
    const dHero  = fit(Math.max(b.w, b.d) * 1.02, TOTAL_H + 1.0);
    const dTop   = fit(b.w + 2, b.d + 2);

    const map: Record<string, [number, number, number]> = {
      // Kept under the hall deck, or the ceiling would hide everything.
      hero:  [b.cx + dHero * 0.46, Math.min(8.6, Math.max(3, dHero * 0.52)),
              b.cz + dHero * 0.70],
      front: [0, TOTAL_H * 0.55, front + dFront],
      rear:  [0, TOTAL_H * 0.55, -front - dFront],
      eye:   [W * 0.24, 1.62, aZ + D * 0.25],
      top:   [b.cx + 0.01, dTop, b.cz + 0.02],
    };
    const p = map[view] ?? map.hero;
    // Looking straight down, the default up vector is degenerate and the plan
    // comes out rotated. Pinning it puts +x to the right and -z up the screen,
    // so the plan reads the same way round as a drawn layout.
    camera.up.set(0, view === 'top' ? 0 : 1, view === 'top' ? -1 : 0);
    camera.position.set(p[0], p[1], p[2]);
    if (controls.current) {
      const t = view === 'top' ? [b.cx, 0, b.cz]
        : view === 'eye' ? [0, 1.3, aZ - D / 2]
        : view === 'rear' ? [0, TOTAL_H * 0.45, -aZ]
        : view === 'front' ? [0, TOTAL_H * 0.45, aZ]
        : [b.cx, TOTAL_H * 0.45, b.cz];
      controls.current.target.set(t[0], t[1], t[2]);
      controls.current.update();
    }
  }, [view, cfg.width, cfg.depth, cfg.partner, cfg.third, cfg.mirror,
      camera, controls, size.width, size.height]);
  return null;
}

export default function App() {
  const [cfg, setCfg] = useState<Config>(INITIAL);
  const [placements, setPlacements] = useState<Placement[]>(() => autoLayoutAll(INITIAL));
  const [tvs, setTvs] = useState<Tv[]>(() => autoTvsAll(INITIAL));
  const [orbit, setOrbit] = useState(true);
  // Which stall the branding, screens and furniture controls act on.
  const [stall, setStall] = useState<StallId>('a');
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState('hero');

  const [artworks, setArtworks] = useState<Record<SurfaceId, Artwork>>({});
  const [tvMedia, setTvMedia] = useState<Record<string, TvMedia>>({});
  const [artTex, setArtTex] = useState<Record<SurfaceId, THREE.Texture>>({});
  const [hoverSurface, setHoverSurface] = useState<SurfaceId | null>(null);
  const [selectedSurface, setSelectedSurface] = useState<SurfaceId | null>(null);
  const [showSafeArea, setShowSafeArea] = useState(false);
  const [rotateMode, setRotateMode] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);

  const three = useRef<any>(null);
  const texCache = useRef<Map<SurfaceId, { art: Artwork; tex: THREE.Texture }>>(new Map());
  const controls = useRef<any>(null);
  const glRef = useRef<THREE.WebGLRenderer | null>(null);

  const set = (p: Partial<Config>) => setCfg((c) => ({ ...c, ...p }));

  // Any structural change rebuilds the layout from scratch.
  const structKey = keyOf(cfg);
  const prevKey = useRef(structKey);
  useEffect(() => {
    if (prevKey.current === structKey) return;
    prevKey.current = structKey;
    setPlacements(autoLayoutAll(cfg));
    setTvs(autoTvsAll(cfg));
    setSelected(null);
  }, [structKey, cfg]);

  // Switching stalls must not leave the controls pointing at the other one.
  useEffect(() => {
    if (!cfg.partner && stall === 'b') setStall('a');
    if (!cfg.third && stall === 'c') setStall('a');
  }, [cfg.partner, cfg.third, stall]);

  // The stall currently being edited, with its own name and open corner.
  const scfg = useMemo(() => stallCfg(cfg, stall), [cfg, stall]);
  const myPlacements = placements.filter((p) => stallOf(p) === stall);
  const myTvs = tvs.filter((t) => stallOf(t) === stall);

  /** Writes to the branding field that belongs to the stall being edited. */
  const setStallCfg = (p: Partial<Config>) => {
    if (stall === 'a') { set(p); return; }
    const out: Partial<Config> = { ...p };
    if ('companyName' in p) {
      delete out.companyName;
      const name = p.companyName as string;
      if (stall === 'b') out.partnerName = name; else out.thirdName = name;
    }
    if (stall === 'b') {
      // The rear stall is the same structure seen from the other side, so its
      // open sides are the block's -- with `mirror` read back through the flip.
      if ('mirror' in p) out.mirror = !(p.mirror as boolean);
    } else {
      if ('openSides' in p) { delete out.openSides; out.thirdOpenSides = p.openSides; }
      if ('mirror' in p) { delete out.mirror; out.thirdMirror = p.mirror as boolean; }
    }
    set(out);
  };

  /** Replaces this stall's screens, leaving the other stall's alone. */
  const setMyTvs = (next: Tv[]) =>
    setTvs([...tvs.filter((t) => stallOf(t) !== stall),
            ...next.map((t) => ({ ...t, stall }))]);

  const setMyPlacements = (next: Placement[]) =>
    setPlacements([...placements.filter((p) => stallOf(p) !== stall),
                   ...next.map((p) => ({ ...p, stall }))]);

  const onMove = (id: string, x: number, z: number) =>
    setPlacements((ps) => ps.map((p) => (p.id === id ? { ...p, x, z } : p)));

  // --- Furniture: every type can be taken to zero and put back -------------
  const addItem = (type: ItemType) =>
    setPlacements((ps) => {
      const i = ps.filter((p) => p.type === type && stallOf(p) === stall).length;
      return [...ps,
        { id: `${type}-${Date.now()}`, stall, type, ...anchorFor(type, i, scfg) }];
    });

  const removeItem = (type: ItemType) =>
    setPlacements((ps) => {
      for (let i = ps.length - 1; i >= 0; i--) {
        if (ps[i].type === type && stallOf(ps[i]) === stall) {
          const gone = ps[i];
          if (selected === gone.id) setSelected(null);
          return ps.filter((_, j) => j !== i);
        }
      }
      return ps;
    });

  const countOf = (type: ItemType) =>
    placements.filter((p) => p.type === type && stallOf(p) === stall).length;

  const addTv = () => {
    const slot = nextTvSlot(scfg, myTvs, TV_DEFAULT_IDX);
    if (slot) {
      setTvs([...tvs, { id: `tv-${Date.now()}`, stall, ...slot, sizeIdx: TV_DEFAULT_IDX }]);
      return;
    }
    // No clear run left. Add it anyway, but offset so it is visibly a second
    // screen rather than hidden inside the first, and say why it looks tight.
    const wall = wallsFor(scfg.openSides, scfg.mirror)[0];
    const len = wallLength(wall, scfg.width, scfg.depth);
    const t = Math.min(len - 0.3, 0.3 + myTvs.length * 0.4);
    setTvs([...tvs, { id: `tv-${Date.now()}`, stall, wall, t, sizeIdx: TV_DEFAULT_IDX }]);
    setToast(
      `No clear space left for a ${TV_SIZES[TV_DEFAULT_IDX].label} screen — ` +
      `added overlapping. Use a smaller size or move it along the wall.`,
    );
  };

  const onRotate = (id: string, rotY: number) =>
    setPlacements((ps) => ps.map((p) => (p.id === id ? { ...p, rotY } : p)));

  const removeById = (id: string) =>
    setPlacements((ps) => {
      if (selected === id) setSelected(null);
      return ps.filter((p) => p.id !== id);
    });

  const duplicateById = (id: string) =>
    setPlacements((ps) => {
      const src = ps.find((p) => p.id === id);
      if (!src) return ps;
      const copy = {
        ...src,
        stall: stallOf(src),
        id: `${src.type}-${Date.now()}`,
        x: THREE.MathUtils.clamp(src.x + 0.45, -cfg.width / 2 + 0.35, cfg.width / 2 - 0.35),
        z: THREE.MathUtils.clamp(src.z + 0.45, -cfg.depth / 2 + 0.35, cfg.depth / 2 - 0.35),
      };
      setSelected(copy.id);
      return [...ps, copy];
    });

  const selectedItem = placements.find((p) => p.id === selected) ?? null;

  // --- Artwork textures ---------------------------------------------------
  // Rebuilt only for surfaces whose Artwork object actually changed; editing
  // one panel on a 6x6 stall must not re-composite the other seventeen.
  useEffect(() => {
    let dead = false;
    (async () => {
      const cache = texCache.current;
      const live = liveSurfaces(cfg, placements);
      const next: Record<SurfaceId, THREE.Texture> = {};
      for (const [id, art] of Object.entries(artworks)) {
        if (!live.has(id)) continue;   // kept in state, just not on screen
        const hit = cache.get(id);
        if (hit && hit.art === art) { next[id] = hit.tex; continue; }
        const spec = surfacePrint(id, cfg);
        if (!spec) continue;
        try {
          const img = await loadImage(art.src);
          if (dead) return;
          const tex = buildArtworkTexture(img, art, spec);
          hit?.tex.dispose();
          cache.set(id, { art, tex });
          next[id] = tex;
        } catch { /* unreadable image: leave the surface blank */ }
      }
      for (const [id, v] of cache) {
        if (!(id in next)) { v.tex.dispose(); cache.delete(id); }
      }
      if (!dead) setArtTex(next);
    })();
    return () => { dead = true; };
  }, [artworks, cfg, placements]);

  // --- Drop targeting -----------------------------------------------------
  const surfaceAt = (clientX: number, clientY: number): SurfaceId | null => {
    const t = three.current;
    if (!t) return null;
    const rect = t.gl.domElement.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, t.camera);
    const targets: THREE.Object3D[] = [];
    t.scene.traverse((o: any) => { if (o.isMesh && o.userData?.surfaceId) targets.push(o); });
    const hits = ray.intersectObjects(targets, false);
    return hits.length ? (hits[0].object.userData.surfaceId as SurfaceId) : null;
  };

  const assign = async (id: SurfaceId, file: File) => {
    const src = URL.createObjectURL(file);
    try {
      const img = await loadImage(src);
      setArtworks((a) => {
        const old = a[id];
        if (old?.src) URL.revokeObjectURL(old.src);
        return {
          ...a,
          [id]: {
            name: file.name, src, blob: file,
            imgW: img.naturalWidth, imgH: img.naturalHeight,
            ...DEFAULT_ARTWORK,
          },
        };
      });
      setSelectedSurface(id);
      setToast(`${file.name} → ${surfaceLabel(id)}`);
    } catch {
      URL.revokeObjectURL(src);
      setToast(`Could not read ${file.name}`);
    }
  };

  // Videos are kept out of browser storage above this size: the autosave
  // rewrites the whole snapshot, and re-serialising a large file on every
  // edit stalls the UI. Such a video plays fine, it just won't survive reload.
  const MAX_PERSIST_BYTES = 25 * 1024 * 1024;

  const assignTvMedia = (tvId: string, files: File[]) => {
    const vid = files.find((f) => f.type.startsWith('video/'));
    const imgs = files.filter((f) => f.type.startsWith('image/'));
    if (!vid && imgs.length === 0) {
      setToast('Screens take a video, or images for a slideshow');
      return;
    }
    setTvMedia((m) => {
      m[tvId]?.items.forEach((i) => URL.revokeObjectURL(i.src));
      if (vid) {
        const keep = vid.size <= MAX_PERSIST_BYTES;
        return {
          ...m,
          [tvId]: {
            kind: 'video',
            items: [{ name: vid.name, src: URL.createObjectURL(vid), blob: keep ? vid : undefined }],
            playing: true, muted: true, loop: true, intervalMs: 4000, persisted: keep,
          },
        };
      }
      return {
        ...m,
        [tvId]: {
          kind: 'slideshow',
          items: imgs.map((f) => ({ name: f.name, src: URL.createObjectURL(f), blob: f })),
          playing: true, muted: true, loop: true, intervalMs: 4000, persisted: true,
        },
      };
    });
    setToast(vid
      ? `${vid.name} → screen${vid.size > MAX_PERSIST_BYTES ? ' (too large to save, session only)' : ''}`
      : `${imgs.length} slide${imgs.length > 1 ? 's' : ''} → screen`);
  };

  const updateTvMedia = (tvId: string, patch: Partial<TvMedia>) =>
    setTvMedia((m) => (m[tvId] ? { ...m, [tvId]: { ...m[tvId], ...patch } } : m));

  const clearTvMedia = (tvId: string) =>
    setTvMedia((m) => {
      if (!m[tvId]) return m;
      m[tvId].items.forEach((i) => URL.revokeObjectURL(i.src));
      const { [tvId]: _gone, ...rest } = m;
      return rest;
    });

  const setAllPlaying = (playing: boolean) =>
    setTvMedia((m) => Object.fromEntries(
      Object.entries(m).map(([k, v]) => [k, { ...v, playing }])));

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setHoverSurface(surfaceAt(e.clientX, e.clientY));
  };

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const id = surfaceAt(e.clientX, e.clientY);
    setHoverSurface(null);
    const files = Array.from(e.dataTransfer.files ?? []);
    if (files.length === 0) return;
    if (!id) { setToast('Drop it directly onto a surface or a screen'); return; }

    const tvPrefix = id.startsWith('b/tv:') ? 'b/tv:' : id.startsWith('tv:') ? 'tv:' : null;
    if (tvPrefix) {
      assignTvMedia(id.slice(tvPrefix.length), files);
      setSelectedSurface(id);
      return;
    }
    if (!files[0].type.startsWith('image/')) {
      setToast('PNG or JPG for printed surfaces — video goes on a screen');
      return;
    }
    await assign(id, files[0]);
  };

  const updateArt = (id: SurfaceId, patch: Partial<Artwork>) =>
    setArtworks((a) => (a[id] ? { ...a, [id]: { ...a[id], ...patch } } : a));

  const clearArt = (id: SurfaceId) =>
    setArtworks((a) => {
      if (!a[id]) return a;
      URL.revokeObjectURL(a[id].src);
      const { [id]: _gone, ...rest } = a;
      return rest;
    });

  // Artwork for a deleted counter or kiosk can never be reached again, so it
  // is released. Panel and fascia artwork is kept even when the footprint
  // shrinks, so resizing back restores it instead of silently losing work.
  useEffect(() => {
    const live = liveSurfaces(cfg, placements);
    setArtworks((a) => {
      let changed = false;
      const out: Record<SurfaceId, Artwork> = {};
      for (const [id, art] of Object.entries(a)) {
        const kind = id.replace(/^b\//, '').split(':')[0];
        if ((kind === 'counter' || kind === 'kiosk') && !live.has(id)) {
          URL.revokeObjectURL(art.src);
          changed = true;
          continue;
        }
        out[id] = art;
      }
      return changed ? out : a;
    });
    const isTv = /^(b\/)?tv:/.test(selectedSurface ?? '');
    if (selectedSurface && !live.has(selectedSurface) && !isTv) {
      setSelectedSurface(null);
    }
  }, [placements, cfg]);

  useEffect(() => {
    const live = new Set(tvs.map((t) => t.id));
    setTvMedia((m) => {
      let changed = false;
      const out: Record<string, TvMedia> = {};
      for (const [id, media] of Object.entries(m)) {
        if (!live.has(id)) {
          media.items.forEach((i) => URL.revokeObjectURL(i.src));
          changed = true;
          continue;
        }
        out[id] = media;
      }
      return changed ? out : m;
    });
  }, [tvs]);

  // --- Persistence --------------------------------------------------------
  useEffect(() => {
    (async () => {
      const snap = await store.load();
      if (snap) {
        // Merge over INITIAL: a session saved before a setting existed would
        // otherwise restore it as undefined and silently disable the feature.
        const cfg = { ...INITIAL, ...snap.cfg };
        // Seeded from the RAW snapshot, not the merged config: a session saved
        // before a structural setting existed then reads as a change, and the
        // layout effect rebuilds it instead of restoring stale placements.
        prevKey.current = keyOf(snap.cfg);
        setCfg(cfg);
        setPlacements(snap.placements);
        setTvs(snap.tvs);
        setArtworks(snap.artworks);
        setTvMedia(snap.tvMedia ?? {});
        setToast('Restored your last session');
      }
      setRestored(true);
    })();
  }, []);

  useEffect(() => {
    if (!restored) return;   // never overwrite a saved session before it loads
    const t = setTimeout(() => { store.save(cfg, placements, tvs, artworks, tvMedia); }, 600);
    return () => clearTimeout(t);
  }, [cfg, placements, tvs, artworks, tvMedia, restored]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const reset = () => {
    setPlacements(autoLayoutAll(cfg)); setTvs(autoTvsAll(cfg)); setSelected(null);
  };

  const specs = useMemo(() => computeSpecs(cfg, placements, tvs), [cfg, placements, tvs]);

  const savePng = () => {
    const gl = glRef.current;
    if (!gl) return;
    const url = gl.domElement.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `booth_${cfg.width}x${cfg.depth}_${stallsOf(cfg).length}stall.png`;
    a.click();
  };

  const exportTxt = () => {
    const ss = stallsOf(cfg);
    const perStall = ss.flatMap((id) => {
      const sc = stallCfg(cfg, id);
      const walls = wallsFor(sc.openSides, sc.mirror);
      const edges = fasciaEdges(sc.openSides, sc.mirror);
      return [
        `${STALL_ROLE[id].toUpperCase()} STALL — ${stallLabel(cfg, id)}`,
        `  Footprint        ${sc.width} x ${sc.depth} m  (${sc.width * sc.depth} sqm)`,
        `  Open sides       ${sc.openSides}${sc.openSides === 2 ? (sc.mirror ? ' (opens left)' : ' (opens right)') : ''}`,
        `  Walls            ${walls.join(', ')}`,
        `  Fascia runs      ${edges.join(', ')}`,
        `  Furniture        ${placements.filter((p) => stallOf(p) === id).length} items · ` +
          `${tvs.filter((t) => stallOf(t) === id).length} screen(s)`,
        ``,
      ];
    });
    const L = [
      `BOOTH SPECIFICATION`,
      ss.map((id) => stallLabel(cfg, id)).join('  |  '),
      ``,
      `Arrangement        ${ss.length} stall${ss.length > 1 ? 's' : ''}` +
        `${cfg.partner ? ' — back-to-back pair sharing one wall line' : ''}` +
        `${cfg.third ? ', plus one diagonally across the aisle' : ''}`,
      `Plot envelope      ${arrangementBounds(cfg).w.toFixed(2)} x ${arrangementBounds(cfg).d.toFixed(2)} m` +
        ` (walkways ${AISLE_W} m)`,
      `Total area         ${specs.area} sqm / ${Math.round(specs.areaFt)} sq ft`,
      `Fascia total       ${specs.fasciaLen.toFixed(1)} m`,
      `Overall height     2500 mm (2200 panel zone + 300 fascia)`,
      ``,
      ...perStall,
      `STRUCTURE`,
      `Wall panels        ${specs.panelCount} @ 960 mm wide`,
      `Panels behind TVs  ${specs.panelsConsumedByTv}`,
      ``,
      `PRINT AREA`,
      `Fascia             ${specs.fasciaPrintSqft.toFixed(1)} sq ft  (2970 x 260 mm per 3 m bay)`,
      `Panels (net)       ${specs.panelPrintNetSqft.toFixed(1)} sq ft  (960 x 2180 mm each, assumed)`,
      `TOTAL ARTWORK      ${specs.totalPrintSqft.toFixed(1)} sq ft`,
      ``,
      `BILL OF QUANTITIES`,
      `Reception counter  ${specs.counters}`,
      `Round tables       ${specs.tables}`,
      `Chairs             ${specs.chairs}`,
      `Lockable cabinet   ${specs.cabinets}`,
      `Touchscreen kiosk  ${specs.kiosks}`,
      `TV screens         ${specs.tvs}`,
      `Spotlights         ${specs.spotlights}`,
      `Dustbin            ${specs.bins}`,
      `Power points 5A    ${specs.sockets}`,
      `Carpet             ${specs.area} sqm`,
      ``,
      `FLOOR USAGE        ${specs.floorUsed.toFixed(1)} of ${specs.area} sqm (${Math.round(specs.density * 100)}%)`,
      ``,
      ...(specs.warnings.length ? ['CHECKS', ...specs.warnings.map((w) => `- ${w}`)] : []),
    ].join('\n');
    const blob = new Blob([L], { type: 'text/plain' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `booth_${cfg.width}x${cfg.depth}_${stallsOf(cfg).length}stall_spec.txt`;
    a.click();
  };

  return (
    <div className="app">
      <Controls
        cfg={cfg} set={set}
        stall={stall} setStall={setStall} scfg={scfg}
        stalls={stallsOf(cfg)} stallName={(s) => stallLabel(cfg, s)}
        setStallCfg={setStallCfg}
        tvs={myTvs} setTvs={setMyTvs}
        placements={myPlacements} setPlacements={setMyPlacements}
        onReset={reset} view={view} setView={setView}
        addItem={addItem} removeItem={removeItem} countOf={countOf}
        selectedItem={selectedItem} onRotate={onRotate}
        rotateMode={rotateMode} setRotateMode={setRotateMode}
        removeById={removeById} duplicateById={duplicateById}
        onSelectItem={setSelected}
        addTv={addTv}
        tvMedia={tvMedia} updateTvMedia={updateTvMedia}
        clearTvMedia={clearTvMedia} setAllPlaying={setAllPlaying}
        assignTvMedia={assignTvMedia}
        artworks={artworks} selectedSurface={selectedSurface}
        onPickSurface={setSelectedSurface}
        updateArt={updateArt} clearArt={clearArt}
        showSafeArea={showSafeArea} setShowSafeArea={setShowSafeArea}
        assign={assign}
      />

      <div
        className={`stage${hoverSurface ? ' dropping' : ''}`}
        onDragOver={onDragOver}
        onDragLeave={() => setHoverSurface(null)}
        onDrop={onDrop}
      >
        <Canvas
          shadows
          dpr={[1, 2]}
          gl={{ preserveDrawingBuffer: true, antialias: true }}
          camera={{ fov: 42, near: 0.1, far: 200, position: [5, 2.6, 7] }}
          onCreated={({ gl }) => {
            glRef.current = gl;
            gl.toneMapping = THREE.ACESFilmicToneMapping;
            gl.toneMappingExposure = 1.05;
          }}
          onPointerMissed={() => setSelected(null)}
        >
          <color attach="background" args={[cfg.showHall ? '#cfcdc8' : '#1a1d21']} />
          <fog attach="fog" args={[cfg.showHall ? '#cfcdc8' : '#1a1d21', 44, 96]} />
          <Capture sink={three} />
          <CameraRig view={view} cfg={cfg} controls={controls} />
          <Suspense fallback={null}>
            <Scene
              cfg={cfg} placements={placements} tvs={tvs}
              onMove={onMove} onRotate={onRotate} rotateMode={rotateMode} setOrbit={setOrbit}
              selected={selected} onSelect={setSelected}
              artTex={artTex}
              hoverSurface={hoverSurface}
              selectedSurface={selectedSurface}
              onPickSurface={setSelectedSurface}
              showSafeArea={showSafeArea}
              view={view}
              tvMedia={tvMedia}
            />
          </Suspense>
          <ContactShadows position={[0, 0.012, 0]} opacity={0.42}
            scale={Math.max(arrangementBounds(cfg).w, arrangementBounds(cfg).d) * 1.6}
            blur={2.4} far={4} />
          <OrbitControls
            ref={controls} enabled={orbit}
            enableDamping dampingFactor={0.08}
            minDistance={1.6} maxDistance={32}
            maxPolarAngle={Math.PI / 2 - 0.02}
          />
        </Canvas>

        <div className="hint">
          {hoverSurface
            ? `Drop to apply → ${surfaceLabel(hoverSurface)}`
            : 'Drop a PNG/JPG onto any surface · drag furniture · scroll to zoom'}
        </div>
        {toast && <div className="toast">{toast}</div>}
      </div>

      <SpecPanel cfg={cfg} specs={specs} onPng={savePng} onTxt={exportTxt} />
    </div>
  );
}
