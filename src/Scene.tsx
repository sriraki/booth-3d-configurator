import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import {
  PANEL_LEAF, PANEL_ZONE_H, POST_W, TOTAL_H, FASCIA_H, FASCIA_PRINT_H, WALL_T,
  COUNTER, KIOSK, CABINET, RTABLE, CHAIR, BIN, TV_SIZES, TV_CENTRE_H, TV_DEPTH,
} from './constants';
import {
  wallsFor, fasciaEdges, panelsOnWall, wallPoint, wallLength, edgeLength, spotlights,
} from './booth';
import type { Config, EdgeId, Placement, Tv, WallId } from './types';
import type { SurfaceId } from './artwork';
import { makeFasciaTexture, makeCounterTexture, makeKioskTexture, makeCarpetTexture } from './textures';

const ALU = { color: '#c3c8cd', metalness: 0.85, roughness: 0.32 };
const PANEL_MAT = { color: '#f4f4f1', roughness: 0.92, metalness: 0.0 };

// ---------------------------------------------------------------------------
// Structure
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Surface helpers: every printable face is a tagged plane so it can be
// raycast as a drop target, highlighted during a drag, and given its own
// artwork independently of its neighbours.
// ---------------------------------------------------------------------------

export interface SurfaceCtx {
  tex: Record<SurfaceId, THREE.Texture>;
  hover: SurfaceId | null;
  selected: SurfaceId | null;
  onPick: (id: SurfaceId) => void;
  safeArea: boolean;
}

/** Dashed inset showing how much of the face the frame covers. */
function SafeArea({ w, h, inset }: { w: number; h: number; inset: number }) {
  const line = useMemo(() => {
    const x = Math.max(0.01, w / 2 - inset), y = Math.max(0.01, h / 2 - inset);
    const geo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(-x, -y, 0), new THREE.Vector3(x, -y, 0),
      new THREE.Vector3(x, y, 0), new THREE.Vector3(-x, y, 0),
    ]);
    const mat = new THREE.LineDashedMaterial({
      color: '#ff4d4d', dashSize: 0.035, gapSize: 0.025,
      transparent: true, opacity: 0.95, depthTest: false,
    });
    const l = new THREE.LineLoop(geo, mat);
    l.computeLineDistances();   // dashes are invisible without this
    l.position.z = 0.005;
    l.renderOrder = 3;
    return l;
  }, [w, h, inset]);
  return <primitive object={line} />;
}

/** A printable face: artwork when assigned, otherwise a fallback material. */
function Surface({
  id, w, h, ctx, fallback, frameMm = 0, emissiveScreen = false,
}: {
  id: SurfaceId; w: number; h: number; ctx: SurfaceCtx;
  fallback?: THREE.Texture | null; frameMm?: number; emissiveScreen?: boolean;
}) {
  const art = ctx.tex[id];
  const map = art ?? fallback ?? null;
  const isHover = ctx.hover === id;
  const isSel = ctx.selected === id;
  return (
    <group>
      <mesh
        userData={{ surfaceId: id }}
        onClick={(e) => { e.stopPropagation(); ctx.onPick(id); }}
      >
        <planeGeometry args={[w, h]} />
        {/* The `key` matters: a material that gains or loses a map needs a new
            shader program, and simply updating the prop leaves the old one
            compiled -- the texture silently never appears. */}
        {emissiveScreen
          ? <meshBasicMaterial key={map ? map.uuid : 'plain'}
              map={map ?? undefined} color={map ? '#ffffff' : '#101418'} toneMapped={false} />
          : <meshStandardMaterial key={map ? map.uuid : 'plain'}
              map={map ?? undefined} color={map ? '#ffffff' : '#f4f4f1'} roughness={0.85} />}
      </mesh>
      {(isHover || isSel) && (
        <mesh position={[0, 0, 0.006]}>
          <planeGeometry args={[w, h]} />
          <meshBasicMaterial color={isHover ? '#4da3ff' : '#2f81f7'}
            transparent opacity={isHover ? 0.34 : 0.14} depthWrite={false} />
        </mesh>
      )}
      {ctx.safeArea && frameMm > 0 && <SafeArea w={w} h={h} inset={frameMm / 1000} />}
    </group>
  );
}

function Walls({ cfg, ctx }: { cfg: Config; ctx: SurfaceCtx }) {
  const { width: W, depth: D } = cfg;
  const walls = wallsFor(cfg.openSides, cfg.mirror);
  return (
    <group>
      {walls.map((w) => {
        const n = panelsOnWall(w, W, D);
        const len = wallLength(w, W, D);
        return (
          <group key={w}>
            {Array.from({ length: n }, (_, i) => {
              const p = wallPoint(w, i + 0.5, W, D);
              return (
                <group key={`p${i}`} position={[p.x, PANEL_ZONE_H / 2, p.z]} rotation={[0, p.rotY, 0]}>
                  <mesh castShadow receiveShadow>
                    <boxGeometry args={[PANEL_LEAF, PANEL_ZONE_H, WALL_T]} />
                    <meshStandardMaterial {...PANEL_MAT} />
                  </mesh>
                  <group position={[0, 0, WALL_T / 2 + 0.003]}>
                    <Surface id={`panel:${w}:${i}`} w={PANEL_LEAF} h={PANEL_ZONE_H}
                      ctx={ctx} frameMm={15} />
                  </group>
                </group>
              );
            })}
            {Array.from({ length: n + 1 }, (_, i) => {
              const p = wallPoint(w, i, W, D);
              return (
                <mesh key={`u${i}`} position={[p.x, (TOTAL_H - FASCIA_H) / 2, p.z]} rotation={[0, p.rotY, 0]} castShadow>
                  <boxGeometry args={[POST_W, TOTAL_H - FASCIA_H, WALL_T * 1.3]} />
                  <meshStandardMaterial {...ALU} />
                </mesh>
              );
            })}
            {/* top rail capping the panel zone */}
            <mesh
              position={
                w === 'back' ? [0, PANEL_ZONE_H, -D / 2]
                  : [w === 'left' ? -W / 2 : W / 2, PANEL_ZONE_H, 0]
              }
              rotation={[0, w === 'back' ? 0 : Math.PI / 2, 0]}
            >
              <boxGeometry args={[len, 0.05, WALL_T * 1.3]} />
              <meshStandardMaterial {...ALU} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

function Fascia({ cfg, texFor, ctx }: { cfg: Config; texFor: (len: number) => THREE.Texture; ctx: SurfaceCtx }) {
  const { width: W, depth: D } = cfg;
  const edges = fasciaEdges(cfg.openSides, cfg.mirror);
  const y = TOTAL_H - FASCIA_H / 2;

  return (
    <group>
      {edges.map((e: EdgeId) => {
        const len = edgeLength(e, W, D);
        const pos: [number, number, number] =
          e === 'front' ? [0, y, D / 2] : [e === 'left' ? -W / 2 : W / 2, y, 0];
        const rotY = e === 'front' ? 0 : e === 'left' ? -Math.PI / 2 : Math.PI / 2;
        // Each run length gets its own artwork so text is never stretched.
        const fid: SurfaceId = `fascia:${e}`;
        const tex = ctx.tex[fid] ?? texFor(len);
        const lit = ctx.hover === fid || ctx.selected === fid;
        return (
          <group key={e} position={pos} rotation={[0, rotY, 0]}>
            <mesh castShadow userData={{ surfaceId: fid }}
              onClick={(ev) => { ev.stopPropagation(); ctx.onPick(fid); }}>
              <boxGeometry args={[len, FASCIA_H, 0.09]} />
              <meshStandardMaterial attach="material-0" color="#e9e9e6" roughness={0.8} />
              <meshStandardMaterial attach="material-1" color="#e9e9e6" roughness={0.8} />
              <meshStandardMaterial attach="material-2" {...ALU} />
              <meshStandardMaterial attach="material-3" {...ALU} />
              <meshStandardMaterial attach="material-4" map={tex} roughness={0.75} />
              <meshStandardMaterial attach="material-5" map={tex} roughness={0.75} />
            </mesh>
            {/* frame lip that eats 20 mm top and bottom of the print */}
            <mesh position={[0, FASCIA_H / 2 - 0.012, 0]}>
              <boxGeometry args={[len, 0.024, 0.1]} />
              <meshStandardMaterial {...ALU} />
            </mesh>
            <mesh position={[0, -FASCIA_H / 2 + 0.012, 0]}>
              <boxGeometry args={[len, 0.024, 0.1]} />
              <meshStandardMaterial {...ALU} />
            </mesh>
            {lit && (
              <mesh position={[0, 0, 0.055]}>
                <planeGeometry args={[len, FASCIA_H]} />
                <meshBasicMaterial color={ctx.hover === fid ? '#4da3ff' : '#2f81f7'}
                  transparent opacity={ctx.hover === fid ? 0.34 : 0.14} depthWrite={false} />
              </mesh>
            )}
            {ctx.safeArea && (
              <group position={[0, 0, 0.05]}>
                <SafeArea w={len} h={FASCIA_H} inset={0.02} />
              </group>
            )}
          </group>
        );
      })}
    </group>
  );
}

// ---------------------------------------------------------------------------
// Exhibition hall surroundings. Neighbouring stalls, aisle carpet and a truss
// ceiling give the render a sense of scale and stop the stall floating in a
// void. Deliberately low detail: it is context, never the subject.
// ---------------------------------------------------------------------------

const NEIGHBOUR_TONES = ['#d9d9d4', '#cfd4d8', '#e0ddd6', '#d2d6d2', '#dad6d9'];
const FASCIA_TONES = ['#8f99a3', '#9c8f86', '#889a92', '#9a93a3', '#94a0a8'];

function Neighbour({ w, d, tone, seed }: { w: number; d: number; tone: number; seed: number }) {
  const h = 2.5;
  return (
    <group>
      <mesh position={[0, h / 2, 0]} receiveShadow>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial color={NEIGHBOUR_TONES[tone % NEIGHBOUR_TONES.length]} roughness={0.96} />
      </mesh>
      {/* fascia band facing the aisle */}
      <mesh position={[0, h - 0.15, d / 2 + 0.03]}>
        <boxGeometry args={[w, 0.3, 0.07]} />
        <meshStandardMaterial color={FASCIA_TONES[seed % FASCIA_TONES.length]} roughness={0.85} />
      </mesh>
    </group>
  );
}

function Hall({ cfg }: { cfg: Config }) {
  const { width: W, depth: D } = cfg;
  const AISLE = 3;
  const walls = wallsFor(cfg.openSides, cfg.mirror);
  const hasLeft = walls.includes('left');
  const hasRight = walls.includes('right');

  return (
    <group>
      {/* aisle carpet running across the open frontage */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.004, D / 2 + AISLE / 2]} receiveShadow>
        <planeGeometry args={[Math.max(28, W * 5), AISLE]} />
        <meshStandardMaterial color="#6d3d3d" roughness={1} />
      </mesh>

      {/* Opposite row, with a deliberate gap directly across from the stall.
          Without it the front-elevation camera -- which has to stand back far
          enough to frame the full frontage -- ends up behind that stall and
          sees nothing but its back. The gap reads as a cross-aisle. */}
      {[-2, -1, 1, 2].map((i) => (
        <group key={`opp${i}`} position={[i * (W + 0.3), 0, D / 2 + AISLE + 1.6]}>
          <Neighbour w={W} d={3.2} tone={i + 2} seed={i + 1} />
        </group>
      ))}

      {/* back-to-back row behind the stall */}
      {[-1, 0, 1].map((i) => (
        <group key={`back${i}`} position={[i * (W + 0.3), 0, -D / 2 - 1.7]}
          rotation={[0, Math.PI, 0]}>
          <Neighbour w={W} d={3.2} tone={i + 4} seed={i + 3} />
        </group>
      ))}

      {/* immediate neighbours, only where this stall is actually walled in */}
      {hasLeft && (
        <group position={[-W / 2 - 1.6, 0, 0]}>
          <Neighbour w={3} d={D} tone={1} seed={2} />
        </group>
      )}
      {hasRight && (
        <group position={[W / 2 + 1.6, 0, 0]}>
          <Neighbour w={3} d={D} tone={3} seed={4} />
        </group>
      )}

      {/* hall ceiling and a few truss runs well above the stalls */}
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[0, 7.5, 0]}>
        <planeGeometry args={[70, 70]} />
        <meshStandardMaterial color="#23262a" roughness={1} side={THREE.FrontSide} />
      </mesh>
      {[-10, -5, 0, 5, 10].map((x) => (
        <mesh key={`tr${x}`} position={[x, 6.6, 0]}>
          <boxGeometry args={[0.18, 0.18, 60]} />
          <meshStandardMaterial color="#3a3f45" metalness={0.5} roughness={0.6} />
        </mesh>
      ))}
      {[-18, -6, 6, 18].map((z) => (
        <mesh key={`tz${z}`} position={[0, 6.45, z]}>
          <boxGeometry args={[46, 0.16, 0.16]} />
          <meshStandardMaterial color="#3a3f45" metalness={0.5} roughness={0.6} />
        </mesh>
      ))}

      {/* high bay lights so the surroundings are not pitch black */}
      {[[-8, 12], [8, 12], [-8, -12], [8, -12], [0, 0]].map(([x, z], i) => (
        <pointLight key={`hb${i}`} position={[x, 6.2, z]} intensity={28} distance={26}
          color="#cfd8e3" />
      ))}
    </group>
  );
}

function Carpet({ cfg }: { cfg: Config }) {
  const tex = useMemo(() => {
    const t = makeCarpetTexture(cfg.carpet);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(cfg.width * 2, cfg.depth * 2);
    return t;
  }, [cfg.carpet, cfg.width, cfg.depth]);

  return (
    <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.005, 0]} receiveShadow>
      <planeGeometry args={[cfg.width, cfg.depth]} />
      <meshStandardMaterial map={tex} roughness={0.98} />
    </mesh>
  );
}

// ---------------------------------------------------------------------------
// Lighting
// ---------------------------------------------------------------------------

function Spot({ pos, target, shadow, beam }: {
  pos: [number, number, number]; target: [number, number, number];
  shadow: boolean; beam: boolean;
}) {
  const light = useRef<THREE.SpotLight>(null);
  const tgt = useRef<THREE.Object3D>(null);
  useEffect(() => {
    if (light.current && tgt.current) {
      light.current.target = tgt.current;
      light.current.target.updateMatrixWorld();
    }
  });

  const dir = new THREE.Vector3(...target).sub(new THREE.Vector3(...pos));
  const dist = dir.length();
  const q = new THREE.Quaternion().setFromUnitVectors(
    new THREE.Vector3(0, -1, 0), dir.clone().normalize());
  const e = new THREE.Euler().setFromQuaternion(q);

  return (
    <>
      <object3D ref={tgt} position={target} />
      {/* fitting body on the fascia truss */}
      <group position={pos} rotation={[e.x, e.y, e.z]}>
        <mesh position={[0, -0.06, 0]} castShadow>
          <cylinderGeometry args={[0.045, 0.058, 0.13, 16]} />
          <meshStandardMaterial color="#e8e8e8" metalness={0.6} roughness={0.35} />
        </mesh>
        <mesh position={[0, -0.125, 0]}>
          <cylinderGeometry args={[0.042, 0.042, 0.012, 16]} />
          <meshStandardMaterial color="#fff6e0" emissive="#ffd9a0" emissiveIntensity={2.2} />
        </mesh>
        {beam && (
          <mesh position={[0, -dist / 2, 0]}>
            <coneGeometry args={[dist * 0.26, dist, 24, 1, true]} />
            <meshBasicMaterial color="#ffe6bb" transparent opacity={0.05} side={THREE.DoubleSide} depthWrite={false} />
          </mesh>
        )}
      </group>
      <spotLight
        ref={light}
        position={pos}
        angle={0.52}
        penumbra={0.65}
        distance={14}
        intensity={11}
        color="#fff0d8"
        castShadow={shadow}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-bias={-0.0012}
      />
    </>
  );
}

function Lighting({ cfg }: { cfg: Config }) {
  const spots = useMemo(() => spotlights(cfg), [cfg.width, cfg.depth, cfg.openSides, cfg.mirror]);
  return (
    <>
      <ambientLight intensity={cfg.ambient * 0.55} />
      <hemisphereLight args={['#eef3ff', '#8a8578', cfg.ambient * 0.5]} />
      <directionalLight position={[6, 9, 6]} intensity={cfg.ambient * 0.5} castShadow
        shadow-mapSize-width={2048} shadow-mapSize-height={2048}
        shadow-camera-left={-12} shadow-camera-right={12}
        shadow-camera-top={12} shadow-camera-bottom={-12} />
      {spots.map((s, i) => (
        <Spot key={s.id} pos={s.pos} target={s.target} shadow={i < 4} beam={cfg.showSpotBeams} />
      ))}
    </>
  );
}

// ---------------------------------------------------------------------------
// Furniture
// ---------------------------------------------------------------------------

function Counter({ tex, id, ctx }: { tex: THREE.Texture; id: SurfaceId; ctx: SurfaceCtx }) {
  return (
    <group>
      <mesh position={[0, COUNTER.h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[COUNTER.w, COUNTER.h, COUNTER.d]} />
        <meshStandardMaterial color="#fbfbf9" roughness={0.6} />
      </mesh>
      <mesh position={[0, COUNTER.h + 0.02, 0]} castShadow>
        <boxGeometry args={[COUNTER.w + 0.06, 0.04, COUNTER.d + 0.06]} />
        <meshStandardMaterial color="#eceff1" roughness={0.35} metalness={0.2} />
      </mesh>
      <group position={[0, COUNTER.faceH / 2 + 0.12, COUNTER.d / 2 + 0.004]}>
        <Surface id={id} w={COUNTER.faceW} h={COUNTER.faceH} ctx={ctx}
          fallback={tex} frameMm={10} />
      </group>
    </group>
  );
}

function RoundTable() {
  return (
    <group>
      <mesh position={[0, RTABLE.h, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[RTABLE.r, RTABLE.r, 0.04, 36]} />
        <meshStandardMaterial color="#fcfcfa" roughness={0.35} />
      </mesh>
      <mesh position={[0, RTABLE.h / 2, 0]} castShadow>
        <cylinderGeometry args={[0.05, 0.06, RTABLE.h, 16]} />
        <meshStandardMaterial color="#b9bfc5" metalness={0.7} roughness={0.35} />
      </mesh>
      <mesh position={[0, 0.02, 0]} castShadow>
        <cylinderGeometry args={[0.26, 0.28, 0.035, 24]} />
        <meshStandardMaterial color="#9aa1a8" metalness={0.7} roughness={0.4} />
      </mesh>
    </group>
  );
}

function Chair() {
  return (
    <group>
      <mesh position={[0, CHAIR.seatH, 0]} castShadow>
        <boxGeometry args={[CHAIR.w, 0.06, CHAIR.d]} />
        <meshStandardMaterial color="#2f3337" roughness={0.75} />
      </mesh>
      <mesh position={[0, CHAIR.seatH + 0.22, -CHAIR.d / 2 + 0.03]} rotation={[-0.14, 0, 0]} castShadow>
        <boxGeometry args={[CHAIR.w, 0.42, 0.05]} />
        <meshStandardMaterial color="#2f3337" roughness={0.75} />
      </mesh>
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], i) => (
        <mesh key={i} position={[sx * (CHAIR.w / 2 - 0.04), CHAIR.seatH / 2, sz * (CHAIR.d / 2 - 0.04)]} castShadow>
          <cylinderGeometry args={[0.015, 0.015, CHAIR.seatH, 8]} />
          <meshStandardMaterial color="#9aa1a8" metalness={0.75} roughness={0.35} />
        </mesh>
      ))}
    </group>
  );
}

function SeatingCluster({ chairs }: { chairs: number }) {
  const r = RTABLE.r + 0.46;
  return (
    <group>
      <RoundTable />
      {Array.from({ length: chairs }, (_, i) => {
        const a = (i / chairs) * Math.PI * 2;
        return (
          <group key={i} position={[Math.sin(a) * r, 0, Math.cos(a) * r]} rotation={[0, a + Math.PI, 0]}>
            <Chair />
          </group>
        );
      })}
    </group>
  );
}

function Cabinet() {
  return (
    <group>
      <mesh position={[0, CABINET.h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[CABINET.w, CABINET.h, CABINET.d]} />
        <meshStandardMaterial color="#f6f7f8" roughness={0.5} />
      </mesh>
      <mesh position={[0, CABINET.h / 2, CABINET.d / 2 + 0.002]}>
        <planeGeometry args={[CABINET.w - 0.02, CABINET.h - 0.02]} />
        <meshStandardMaterial color="#eef0f2" roughness={0.5} />
      </mesh>
      {[-1, 1].map((s) => (
        <mesh key={s} position={[s * 0.06, CABINET.h * 0.55, CABINET.d / 2 + 0.012]}>
          <boxGeometry args={[0.012, 0.11, 0.016]} />
          <meshStandardMaterial color="#8d949b" metalness={0.8} roughness={0.3} />
        </mesh>
      ))}
    </group>
  );
}

function Kiosk({ tex, id, ctx }: { tex: THREE.Texture; id: SurfaceId; ctx: SurfaceCtx }) {
  return (
    <group>
      <mesh position={[0, 0.02, 0]} castShadow>
        <boxGeometry args={[KIOSK.w + 0.08, 0.04, KIOSK.d + 0.08]} />
        <meshStandardMaterial color="#2b2f33" roughness={0.6} />
      </mesh>
      <mesh position={[0, KIOSK.h / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[KIOSK.w, KIOSK.h, KIOSK.d]} />
        <meshStandardMaterial color="#f3f4f5" roughness={0.45} />
      </mesh>
      <mesh position={[0, KIOSK.h * 0.62, KIOSK.d / 2 + 0.012]}>
        <boxGeometry args={[KIOSK.screenW + 0.04, KIOSK.screenH + 0.04, 0.02]} />
        <meshStandardMaterial color="#111416" roughness={0.3} />
      </mesh>
      <group position={[0, KIOSK.h * 0.62, KIOSK.d / 2 + 0.025]}>
        <Surface id={id} w={KIOSK.screenW} h={KIOSK.screenH} ctx={ctx}
          fallback={tex} emissiveScreen />
      </group>
    </group>
  );
}

function Bin() {
  return (
    <mesh position={[0, BIN.h / 2, 0]} castShadow>
      <cylinderGeometry args={[BIN.r, BIN.r * 0.85, BIN.h, 20]} />
      <meshStandardMaterial color="#6f767d" metalness={0.55} roughness={0.45} />
    </mesh>
  );
}

function TvUnit({ sizeIdx }: { sizeIdx: number }) {
  const s = TV_SIZES[sizeIdx];
  return (
    <group>
      {/* bracket clamped to the upright extrusion */}
      <mesh position={[0, 0, -0.035]} castShadow>
        <boxGeometry args={[0.16, 0.3, 0.05]} />
        <meshStandardMaterial color="#44484c" metalness={0.6} roughness={0.4} />
      </mesh>
      <mesh castShadow>
        <boxGeometry args={[s.w, s.h, TV_DEPTH]} />
        <meshStandardMaterial color="#111315" roughness={0.35} metalness={0.3} />
      </mesh>
      <mesh position={[0, 0, TV_DEPTH / 2 + 0.002]}>
        <planeGeometry args={[s.w - 0.03, s.h - 0.03]} />
        <meshStandardMaterial color="#0d1b2a" emissive="#1d4e74" emissiveIntensity={0.85} roughness={0.2} />
      </mesh>
    </group>
  );
}

// ---------------------------------------------------------------------------
// Dragging
// ---------------------------------------------------------------------------

const FLOOR = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const SNAP = 0.05;
const snap = (v: number) => Math.round(v / SNAP) * SNAP;

function Draggable({
  p, cfg, onMove, onGrab, onRelease, selected, onSelect, children,
}: {
  p: Placement; cfg: Config;
  onMove: (id: string, x: number, z: number) => void;
  onGrab: () => void; onRelease: () => void;
  selected: boolean; onSelect: (id: string) => void;
  children: React.ReactNode;
}) {
  const drag = useRef(false);
  const off = useRef({ x: 0, z: 0 });
  const hit = useMemo(() => new THREE.Vector3(), []);
  const [hover, setHover] = useState(false);

  const limX = cfg.width / 2 - 0.35;
  const limZ = cfg.depth / 2 - 0.35;

  return (
    <group
      position={[p.x, 0, p.z]}
      rotation={[0, p.rotY, 0]}
      onPointerOver={(e) => { e.stopPropagation(); setHover(true); document.body.style.cursor = 'grab'; }}
      onPointerOut={() => { setHover(false); document.body.style.cursor = 'auto'; }}
      onPointerDown={(e) => {
        e.stopPropagation();
        (e.target as any).setPointerCapture?.(e.pointerId);
        e.ray.intersectPlane(FLOOR, hit);
        off.current = { x: p.x - hit.x, z: p.z - hit.z };
        drag.current = true;
        onSelect(p.id);
        onGrab();
        document.body.style.cursor = 'grabbing';
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        e.stopPropagation();
        if (!e.ray.intersectPlane(FLOOR, hit)) return;
        const nx = THREE.MathUtils.clamp(snap(hit.x + off.current.x), -limX, limX);
        const nz = THREE.MathUtils.clamp(snap(hit.z + off.current.z), -limZ, limZ);
        onMove(p.id, nx, nz);
      }}
      onPointerUp={(e) => {
        if (!drag.current) return;
        e.stopPropagation();
        (e.target as any).releasePointerCapture?.(e.pointerId);
        drag.current = false;
        onRelease();
        document.body.style.cursor = 'grab';
      }}
    >
      {children}
      {(selected || hover) && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}>
          <ringGeometry args={[0.52, 0.58, 40]} />
          <meshBasicMaterial color={selected ? '#2f81f7' : '#8aa6c8'} transparent opacity={0.85} />
        </mesh>
      )}
    </group>
  );
}

// ---------------------------------------------------------------------------

export default function Scene({
  cfg, placements, tvs, onMove, setOrbit, selected, onSelect,
  artTex, hoverSurface, selectedSurface, onPickSurface, showSafeArea, view,
}: {
  cfg: Config; placements: Placement[]; tvs: Tv[];
  onMove: (id: string, x: number, z: number) => void;
  setOrbit: (v: boolean) => void;
  selected: string | null; onSelect: (id: string | null) => void;
  artTex: Record<SurfaceId, THREE.Texture>;
  hoverSurface: SurfaceId | null;
  selectedSurface: SurfaceId | null;
  onPickSurface: (id: SurfaceId) => void;
  showSafeArea: boolean;
  view: string;
}) {
  const [logoImg, setLogoImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!cfg.logo) { setLogoImg(null); return; }
    const img = new Image();
    img.onload = () => setLogoImg(img);
    img.src = cfg.logo;
  }, [cfg.logo]);

  const fasciaTexs = useMemo(() => {
    const lens = Array.from(new Set(
      fasciaEdges(cfg.openSides, cfg.mirror).map((e) => edgeLength(e, cfg.width, cfg.depth))));
    const m = new Map<number, THREE.Texture>();
    for (const l of lens) {
      m.set(l, makeFasciaTexture(cfg.companyName || 'COMPANY NAME', logoImg, l,
        FASCIA_H, FASCIA_PRINT_H, cfg.fasciaColor, cfg.fasciaTextColor));
    }
    return m;
  }, [cfg.companyName, logoImg, cfg.width, cfg.depth, cfg.openSides, cfg.mirror,
      cfg.fasciaColor, cfg.fasciaTextColor]);
  const texFor = (len: number) => fasciaTexs.get(len)!;
  const counterTex = useMemo(
    () => makeCounterTexture(cfg.companyName || 'COMPANY NAME', logoImg, cfg.fasciaTextColor),
    [cfg.companyName, logoImg, cfg.fasciaTextColor]);
  const kioskTex = useMemo(
    () => makeKioskTexture(cfg.companyName || 'COMPANY NAME', '#4da3ff'),
    [cfg.companyName]);

  const { width: W, depth: D } = cfg;

  const ctx: SurfaceCtx = {
    tex: artTex, hover: hoverSurface, selected: selectedSurface,
    onPick: onPickSurface, safeArea: showSafeArea,
  };

  return (
    <group>
      {/* hall floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[70, 70]} />
        <meshStandardMaterial color={cfg.showHall ? '#4a4d52' : '#6e4b4b'} roughness={1} />
      </mesh>

      {cfg.showHall && view !== 'top' && <Hall cfg={cfg} />}

      <Carpet cfg={cfg} />
      <Walls cfg={cfg} ctx={ctx} />
      <Fascia cfg={cfg} texFor={texFor} ctx={ctx} />
      <Lighting cfg={cfg} />

      {tvs.map((t) => {
        const p = wallPoint(t.wall, t.t, W, D);
        return (
          <group key={t.id} position={[p.x, TV_CENTRE_H, p.z]} rotation={[0, p.rotY, 0]}>
            <group position={[0, 0, WALL_T / 2 + TV_DEPTH / 2 + 0.02]}>
              <TvUnit sizeIdx={t.sizeIdx} />
            </group>
          </group>
        );
      })}

      {placements.map((p) => (
        <Draggable
          key={p.id} p={p} cfg={cfg} onMove={onMove}
          onGrab={() => setOrbit(false)} onRelease={() => setOrbit(true)}
          selected={selected === p.id} onSelect={onSelect}
        >
          {p.type === 'counter' && <Counter tex={counterTex} id={`counter:${p.id}`} ctx={ctx} />}
          {p.type === 'table' && <SeatingCluster chairs={cfg.chairsPerTable} />}
          {p.type === 'cabinet' && <Cabinet />}
          {p.type === 'kiosk' && <Kiosk tex={kioskTex} id={`kiosk:${p.id}`} ctx={ctx} />}
          {p.type === 'bin' && <Bin />}
        </Draggable>
      ))}
    </group>
  );
}
