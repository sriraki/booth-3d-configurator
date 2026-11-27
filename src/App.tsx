import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Canvas, useThree } from '@react-three/fiber';
import { OrbitControls, ContactShadows } from '@react-three/drei';
import * as THREE from 'three';
import Scene from './Scene';
import { Controls, SpecPanel } from './Sidebar';
import { autoLayout, autoTvs, computeSpecs, wallsFor, fasciaEdges } from './booth';
import { TOTAL_H } from './constants';
import type { Config, Placement, Tv } from './types';
import {
  DEFAULT_ARTWORK, buildArtworkTexture, loadImage, surfacePrint, surfaceLabel,
  type Artwork, type SurfaceId,
} from './artwork';
import * as store from './storage';

const INITIAL: Config = {
  width: 3, depth: 3, openSides: 1, mirror: false,
  companyName: 'COMPANY NAME', logo: null,
  carpet: '#5a5f66', fasciaColor: '#ffffff', fasciaTextColor: '#14181c',
  showSpotBeams: false, ambient: 0.55, chairsPerTable: 4,
};

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

    const dFront = fit(W + 0.8, TOTAL_H + 0.7);
    const dHero  = fit(Math.max(W, D) * 1.3, TOTAL_H + 0.9);
    const dTop   = fit(W + 1.2, D + 1.2);

    const map: Record<string, [number, number, number]> = {
      hero:  [dHero * 0.50, Math.max(2.3, dHero * 0.34), D / 2 + dHero * 0.78],
      front: [0, TOTAL_H * 0.55, D / 2 + dFront],
      eye:   [W * 0.24, 1.62, D / 2 - 0.25],
      top:   [0.01, dTop, 0.02],
    };
    const p = map[view] ?? map.hero;
    camera.position.set(p[0], p[1], p[2]);
    if (controls.current) {
      const t = view === 'top' ? [0, 0, 0]
        : view === 'eye' ? [0, 1.3, -D / 2]
        : [0, TOTAL_H * 0.45, 0];
      controls.current.target.set(t[0], t[1], t[2]);
      controls.current.update();
    }
  }, [view, cfg.width, cfg.depth, camera, controls, size.width, size.height]);
  return null;
}

export default function App() {
  const [cfg, setCfg] = useState<Config>(INITIAL);
  const [placements, setPlacements] = useState<Placement[]>(() => autoLayout(INITIAL));
  const [tvs, setTvs] = useState<Tv[]>(() => autoTvs(INITIAL));
  const [orbit, setOrbit] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);
  const [view, setView] = useState('hero');

  const [artworks, setArtworks] = useState<Record<SurfaceId, Artwork>>({});
  const [artTex, setArtTex] = useState<Record<SurfaceId, THREE.Texture>>({});
  const [hoverSurface, setHoverSurface] = useState<SurfaceId | null>(null);
  const [selectedSurface, setSelectedSurface] = useState<SurfaceId | null>(null);
  const [showSafeArea, setShowSafeArea] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [restored, setRestored] = useState(false);

  const three = useRef<any>(null);
  const texCache = useRef<Map<SurfaceId, { art: Artwork; tex: THREE.Texture }>>(new Map());
  const controls = useRef<any>(null);
  const glRef = useRef<THREE.WebGLRenderer | null>(null);

  const set = (p: Partial<Config>) => setCfg((c) => ({ ...c, ...p }));

  // Any structural change rebuilds the layout from scratch.
  const structKey = `${cfg.width}|${cfg.depth}|${cfg.openSides}|${cfg.mirror}`;
  const prevKey = useRef(structKey);
  useEffect(() => {
    if (prevKey.current === structKey) return;
    prevKey.current = structKey;
    setPlacements(autoLayout(cfg));
    setTvs(autoTvs(cfg));
    setSelected(null);
  }, [structKey, cfg]);

  const onMove = (id: string, x: number, z: number) =>
    setPlacements((ps) => ps.map((p) => (p.id === id ? { ...p, x, z } : p)));

  // --- Artwork textures ---------------------------------------------------
  // Rebuilt only for surfaces whose Artwork object actually changed; editing
  // one panel on a 6x6 stall must not re-composite the other seventeen.
  useEffect(() => {
    let dead = false;
    (async () => {
      const cache = texCache.current;
      const next: Record<SurfaceId, THREE.Texture> = {};
      for (const [id, art] of Object.entries(artworks)) {
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
  }, [artworks, cfg.width, cfg.depth]);

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

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'copy';
    setHoverSurface(surfaceAt(e.clientX, e.clientY));
  };

  const onDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    const id = surfaceAt(e.clientX, e.clientY);
    setHoverSurface(null);
    const file = e.dataTransfer.files?.[0];
    if (!file) return;
    if (!id) { setToast('Drop it directly onto a panel, fascia, counter or kiosk'); return; }
    if (!file.type.startsWith('image/')) {
      setToast('PNG or JPG only for now — PDF and video land in the next phase');
      return;
    }
    await assign(id, file);
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

  // --- Persistence --------------------------------------------------------
  useEffect(() => {
    (async () => {
      const snap = await store.load();
      if (snap) {
        prevKey.current = `${snap.cfg.width}|${snap.cfg.depth}|${snap.cfg.openSides}|${snap.cfg.mirror}`;
        setCfg(snap.cfg);
        setPlacements(snap.placements);
        setTvs(snap.tvs);
        setArtworks(snap.artworks);
        setToast('Restored your last session');
      }
      setRestored(true);
    })();
  }, []);

  useEffect(() => {
    if (!restored) return;   // never overwrite a saved session before it loads
    const t = setTimeout(() => { store.save(cfg, placements, tvs, artworks); }, 600);
    return () => clearTimeout(t);
  }, [cfg, placements, tvs, artworks, restored]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2600);
    return () => clearTimeout(t);
  }, [toast]);

  const reset = () => { setPlacements(autoLayout(cfg)); setTvs(autoTvs(cfg)); setSelected(null); };

  const specs = useMemo(() => computeSpecs(cfg, placements, tvs), [cfg, placements, tvs]);

  const savePng = () => {
    const gl = glRef.current;
    if (!gl) return;
    const url = gl.domElement.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `booth_${cfg.width}x${cfg.depth}_${cfg.openSides}side.png`;
    a.click();
  };

  const exportTxt = () => {
    const walls = wallsFor(cfg.openSides, cfg.mirror);
    const edges = fasciaEdges(cfg.openSides, cfg.mirror);
    const L = [
      `BOOTH SPECIFICATION`,
      `${cfg.companyName}`,
      ``,
      `Footprint          ${cfg.width} x ${cfg.depth} m  (${specs.area} sqm / ${Math.round(specs.areaFt)} sq ft)`,
      `Open sides         ${cfg.openSides}${cfg.openSides === 2 ? (cfg.mirror ? ' (opens left)' : ' (opens right)') : ''}`,
      `Walls              ${walls.join(', ')}`,
      `Fascia runs        ${edges.join(', ')}  = ${specs.fasciaLen.toFixed(1)} m`,
      `Overall height     2500 mm (2200 panel zone + 300 fascia)`,
      ``,
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
    a.download = `booth_${cfg.width}x${cfg.depth}_spec.txt`;
    a.click();
  };

  return (
    <div className="app">
      <Controls
        cfg={cfg} set={set}
        tvs={tvs} setTvs={setTvs}
        placements={placements} setPlacements={setPlacements}
        onReset={reset} view={view} setView={setView}
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
          <color attach="background" args={['#1a1d21']} />
          <fog attach="fog" args={['#1a1d21', 22, 55]} />
          <Capture sink={three} />
          <CameraRig view={view} cfg={cfg} controls={controls} />
          <Suspense fallback={null}>
            <Scene
              cfg={cfg} placements={placements} tvs={tvs}
              onMove={onMove} setOrbit={setOrbit}
              selected={selected} onSelect={setSelected}
              artTex={artTex}
              hoverSurface={hoverSurface}
              selectedSurface={selectedSurface}
              onPickSurface={setSelectedSurface}
              showSafeArea={showSafeArea}
            />
          </Suspense>
          <ContactShadows position={[0, 0.012, 0]} opacity={0.42}
            scale={Math.max(cfg.width, cfg.depth) * 2.4} blur={2.4} far={4} />
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
