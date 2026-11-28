import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useThree } from '@react-three/fiber';
import {
  PANEL_LEAF, PANEL_ZONE_H, POST_W, TOTAL_H, FASCIA_H, FASCIA_PRINT_H, WALL_T,
  COUNTER, KIOSK, CABINET, RTABLE, CHAIR, BIN, TV_SIZES, TV_DEPTH, tvCentreH,
  AISLE_W, STEP, STEP_HEIGHTS, STEP_LABEL_H, STEP_TOPICS,
  GCASE, STANDEE, PHOTO, MCASE, MCASE_TITLE, DTABLE, MODEL_TITLES, BWALL, MANNEQUIN,
} from './constants';
import {
  wallsFor, fasciaEdges, panelsOnWall, wallPoint, wallLength, edgeLength, edgePoint,
  spotlights, stallsOf, stallCfg, stallOf, stallPose, arrangementBounds, pairDepth,
} from './booth';
import type { Config, EdgeId, Placement, StallId, Tv, TvMedia, WallId } from './types';
import {
  DEFAULT_ARTWORK, buildArtworkTexture, loadImage, nsOf, type SurfaceId,
} from './artwork';
import {
  makeFasciaTexture, makeCounterTexture, makeKioskTexture, makeCarpetTexture,
  makeTileTexture, makeStepLabelTexture, makeStandeeTexture, makePhotoBackdrop,
  makePlinthTexture, makeBandTexture, makeMentorshipHeader, makeTierTexture,
  makeFloralFrame, makePanelTitle,
} from './textures';

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
  /** Prefix that scopes every id below to one stall of a back-to-back pair. */
  ns: string;
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
  // Ids arrive bare from the geometry, which is written for a single stall;
  // the namespace is what keeps the rear stall's panels separate from the
  // front one's when the two are identical.
  const sid = ctx.ns + id;
  const art = ctx.tex[sid];
  const map = art ?? fallback ?? null;
  const isHover = ctx.hover === sid;
  const isSel = ctx.selected === sid;
  return (
    <group>
      <mesh
        userData={{ surfaceId: sid }}
        onClick={(e) => { e.stopPropagation(); ctx.onPick(sid); }}
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

function Walls({ cfg, ctx, panelTex }: {
  cfg: Config; ctx: SurfaceCtx;
  /** Printed panel titles. Artwork dropped on a panel still wins over these. */
  panelTex?: Map<string, THREE.Texture>;
}) {
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
                      ctx={ctx} frameMm={15} fallback={panelTex?.get(`${w}:${i}`)} />
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
// Indoor hall: white porcelain tile flooring, the walkways between the stalls
// picked out in a warmer tile, a high ceiling and warm high-bay lighting.
// Context only -- it never competes with the stalls.
// ---------------------------------------------------------------------------

const HALL_W = 80;
/** Deck height. Real halls are 8-12 m, and the headroom is what lets the
 *  overview camera sit high enough to read the arrangement as a plan. */
export const CEIL_H = 10;

/** Circulation between the stalls: the walkway the client's layout marks
 *  between the block and the diagonal stall, and the strip down the flank
 *  both halves of the block open onto. */
function Walkways({ cfg }: { cfg: Config }) {
  const b = arrangementBounds(cfg);
  const pair = pairDepth(cfg);
  const runs: { x: number; z: number; w: number; d: number; wide: boolean }[] = [];

  // Down the flank the back-to-back pair opens onto.
  const flank = cfg.mirror ? -1 : 1;
  runs.push({
    x: flank * (cfg.width / 2 + AISLE_W / 2), z: 0,
    w: AISLE_W, d: pair + AISLE_W, wide: false,
  });
  if (cfg.third) {
    // The marked walkway, between the block and the diagonal stall.
    runs.push({
      x: b.cx, z: -(pair / 2 + AISLE_W / 2),
      w: b.w + AISLE_W, d: AISLE_W, wide: true,
    });
  }

  return (
    <group>
      {runs.map((r, i) => (
        <group key={i}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[r.x, 0.003, r.z]} receiveShadow>
            <planeGeometry args={[r.w, r.d]} />
            <meshStandardMaterial color="#ccd1d5" roughness={0.55} metalness={0.03} />
          </mesh>
          {/* edge markings, so it reads as a route rather than a patch of
              differently coloured floor */}
          {[-1, 1].map((e) => (
            <mesh key={e} rotation={[-Math.PI / 2, 0, 0]}
              position={r.wide
                ? [r.x, 0.004, r.z + e * (r.d / 2 - 0.05)]
                : [r.x + e * (r.w / 2 - 0.05), 0.004, r.z]}>
              <planeGeometry args={r.wide ? [r.w, 0.07] : [0.07, r.d]} />
              <meshBasicMaterial color="#939ca3" />
            </mesh>
          ))}
        </group>
      ))}
    </group>
  );
}

function Hall({ cfg, view }: { cfg: Config; view: string }) {
  const b = arrangementBounds(cfg);
  // Any overhead view looks through the ceiling, or it sees only the deck.
  const overhead = view !== 'top' && view !== 'angle:plan';
  const tiles = useMemo(() => {
    const t = makeTileTexture();
    t.repeat.set(HALL_W / 2, HALL_W / 2);   // the canvas covers 2 x 2 m
    return t;
  }, []);

  return (
    <group>
      {/* tiled hall floor */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[b.cx, 0.002, b.cz]} receiveShadow>
        <planeGeometry args={[HALL_W, HALL_W]} />
        <meshStandardMaterial map={tiles} color="#ffffff" roughness={0.3} metalness={0.05} />
      </mesh>

      <Walkways cfg={cfg} />

      {/* ceiling deck and truss runs, warm rather than black */}
      {overhead && <>
      <mesh rotation={[Math.PI / 2, 0, 0]} position={[b.cx, CEIL_H, b.cz]}>
        <planeGeometry args={[HALL_W, HALL_W]} />
        <meshStandardMaterial color="#6f6a62" roughness={0.95} side={THREE.FrontSide} />
      </mesh>
      {[-18, -9, 0, 9, 18].map((x) => (
        <mesh key={`tr${x}`} position={[b.cx + x, CEIL_H - 0.9, b.cz]}>
          <boxGeometry args={[0.18, 0.18, 62]} />
          <meshStandardMaterial color="#8d8378" metalness={0.45} roughness={0.6} />
        </mesh>
      ))}
      {[-18, -6, 6, 18].map((z) => (
        <mesh key={`tz${z}`} position={[b.cx, CEIL_H - 1.05, b.cz + z]}>
          <boxGeometry args={[52, 0.16, 0.16]} />
          <meshStandardMaterial color="#8d8378" metalness={0.45} roughness={0.6} />
        </mesh>
      ))}

      {/* Warm high bays on a grid. These are what lift the hall out of the
          dull near-black it used to sit in. */}
      {[-12, 0, 12].flatMap((x) => [-12, 0, 12].map((z) => [x, z] as const))
        .map(([x, z], i) => (
          <group key={`hb${i}`} position={[b.cx + x, CEIL_H - 1.3, b.cz + z]}>
            <mesh>
              <cylinderGeometry args={[0.34, 0.46, 0.2, 16]} />
              <meshStandardMaterial color="#c9bfae" metalness={0.4} roughness={0.5} />
            </mesh>
            <mesh position={[0, -0.11, 0]} rotation={[Math.PI / 2, 0, 0]}>
              <circleGeometry args={[0.36, 20]} />
              <meshBasicMaterial color="#ffe9c4" toneMapped={false} />
            </mesh>
            {/* Pulled back deliberately: the stalls are meant to be the bright
                thing in the hall, not the venue lighting. */}
            <pointLight position={[0, -0.4, 0]} intensity={42} distance={30}
              color="#ffcf8f" />
          </group>
        ))}
      </>}
    </group>
  );
}

/**
 * The stall's own trim lighting: warm strips up each upright, a wash under
 * the fascia and a lit plinth along every open edge. Together with the
 * fascia spots this is what makes a stall read brighter than the hall it
 * stands in, which is the whole point of stand lighting.
 */
function TrimLight({ cfg }: { cfg: Config }) {
  const { width: W, depth: D } = cfg;
  const edges = fasciaEdges(cfg.openSides, cfg.mirror);
  const corners: [number, number][] = [
    [-W / 2, -D / 2], [W / 2, -D / 2], [-W / 2, D / 2], [W / 2, D / 2],
  ];

  return (
    <group>
      {/* vertical strips on the corner uprights */}
      {corners.map(([x, z], i) => (
        <group key={`u${i}`} position={[x, 0, z]}>
          {[0, 1].map((f) => (
            <mesh key={f} position={[f ? Math.sign(x) * 0.026 : 0, PANEL_ZONE_H / 2,
              f ? 0 : Math.sign(z) * 0.026]}
              rotation={[0, f ? Math.PI / 2 * Math.sign(x) : 0, 0]}>
              <planeGeometry args={[0.035, PANEL_ZONE_H - 0.1]} />
              <meshBasicMaterial color="#ffdfae" toneMapped={false} side={THREE.DoubleSide} />
            </mesh>
          ))}
          <pointLight position={[0, 1.5, 0]} intensity={2.4} distance={3.4} color="#ffd9a0" />
        </group>
      ))}

      {/* lit plinth along each open edge, and a soft uplight off it */}
      {edges.map((e) => {
        const len = edgeLength(e, W, D);
        const p = edgePoint(e, len / 2, W, D);
        return (
          <group key={`p${e}`} position={[p.x, 0, p.z]} rotation={[0, p.rotY, 0]}>
            <mesh position={[0, 0.035, 0.015]}>
              <planeGeometry args={[len - 0.1, 0.05]} />
              <meshBasicMaterial color="#ffe3b8" toneMapped={false} />
            </mesh>
            {/* under-fascia wash, aimed into the stall */}
            <mesh position={[0, PANEL_ZONE_H - 0.02, 0.06]} rotation={[Math.PI / 2, 0, 0]}>
              <planeGeometry args={[len - 0.2, 0.09]} />
              <meshBasicMaterial color="#ffe9c6" toneMapped={false} side={THREE.DoubleSide} />
            </mesh>
            {/* A rectAreaLight would be the right tool, but it emits nothing
                until RectAreaLightUniformsLib is initialised; points along the
                run give the same wash with no setup. */}
            {(() => {
              const n = Math.max(2, Math.round(len / 1.5));
              const run = len - 0.2;
              return Array.from({ length: n }, (_, k) => (
                <pointLight key={k} intensity={6} distance={3.6} color="#ffe2b4"
                  position={[((k + 0.5) / n) * run - run / 2, PANEL_ZONE_H - 0.12, -0.28]} />
              ));
            })()}
          </group>
        );
      })}

      {/* fills the volume so the interior is lifted, not just its edges */}
      <pointLight position={[0, 2.05, 0]} intensity={18} distance={Math.max(W, D) * 1.8}
        color="#ffeacb" />
      <pointLight position={[0, 1.15, -D / 4]} intensity={10} distance={Math.max(W, D) * 1.2}
        color="#fff1dc" />
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
          <meshStandardMaterial color="#fff8ea" emissive="#ffd9a0" emissiveIntensity={3.4} />
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
        angle={0.56}
        penumbra={0.6}
        distance={16}
        intensity={26}
        color="#fff1da"
        castShadow={shadow}
        shadow-mapSize-width={1024}
        shadow-mapSize-height={1024}
        shadow-bias={-0.0012}
      />
    </>
  );
}

/** Lights that belong to the venue, not to a stall. Rendered once -- adding
 *  them inside Stall would multiply the ambient by the number of stalls. */
function GlobalLight({ cfg }: { cfg: Config }) {
  const warm = cfg.showHall;
  return (
    <>
      {/* The fill stays close to neutral so white tiles read as white; the
          warmth comes from the high bays overhead, which pool on the floor. */}
      <ambientLight intensity={cfg.ambient * (warm ? 0.42 : 0.55)}
        color={warm ? '#fff6ec' : '#ffffff'} />
      <hemisphereLight
        args={[warm ? '#eef2fb' : '#eef3ff', warm ? '#ccc0ab' : '#8a8578',
          cfg.ambient * (warm ? 0.5 : 0.5)]} />
      <directionalLight position={[8, 13, 7]} intensity={cfg.ambient * (warm ? 0.3 : 0.55)}
        color={warm ? '#fff6ea' : '#ffffff'} castShadow
        shadow-mapSize-width={2048} shadow-mapSize-height={2048}
        shadow-camera-left={-20} shadow-camera-right={20}
        shadow-camera-top={20} shadow-camera-bottom={-20} />
    </>
  );
}

/** The stall's own fascia-mounted spotlights. */
function Lighting({ cfg }: { cfg: Config }) {
  const spots = useMemo(() => spotlights(cfg), [cfg.width, cfg.depth, cfg.openSides, cfg.mirror]);
  return (
    <>
      {spots.map((s, i) => (
        <Spot key={s.id} pos={s.pos} target={s.target} shadow={i < 4} beam={cfg.showSpotBeams} />
      ))}
    </>
  );
}

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

// ---------------------------------------------------------------------------
// Project display steps: a staircase of three 4 ft x 2 ft platforms with a
// working model on each, per the client's mockup. Built back to front so
// every riser face, and so every caption, is readable from the aisle.
// ---------------------------------------------------------------------------

const DARK_JOINT = { color: '#2a2d31', metalness: 0.55, roughness: 0.42 };

/** Articulated arm, folded into a display pose. */
function RobotArm() {
  return (
    <group>
      <mesh position={[0, 0.02, 0]} castShadow>
        <cylinderGeometry args={[0.1, 0.11, 0.04, 24]} />
        <meshStandardMaterial {...DARK_JOINT} />
      </mesh>
      <mesh position={[0, 0.1, 0]} castShadow>
        <cylinderGeometry args={[0.052, 0.058, 0.12, 20]} />
        <meshStandardMaterial color="#f2a81d" metalness={0.25} roughness={0.45} />
      </mesh>
      <mesh position={[0, 0.17, 0]}>
        <sphereGeometry args={[0.055, 18, 14]} />
        <meshStandardMaterial {...DARK_JOINT} />
      </mesh>
      {/* upper arm, swept forward */}
      <group position={[0, 0.17, 0]} rotation={[0.72, 0, 0]}>
        <mesh position={[0, 0.11, 0]} castShadow>
          <boxGeometry args={[0.062, 0.23, 0.052]} />
          <meshStandardMaterial color="#f2a81d" metalness={0.25} roughness={0.45} />
        </mesh>
        <mesh position={[0, 0.23, 0]}>
          <sphereGeometry args={[0.042, 16, 12]} />
          <meshStandardMaterial {...DARK_JOINT} />
        </mesh>
        {/* forearm, folded back */}
        <group position={[0, 0.23, 0]} rotation={[-1.35, 0, 0]}>
          <mesh position={[0, 0.095, 0]} castShadow>
            <boxGeometry args={[0.05, 0.2, 0.044]} />
            <meshStandardMaterial color="#f2a81d" metalness={0.25} roughness={0.45} />
          </mesh>
          <mesh position={[0, 0.2, 0]}>
            <cylinderGeometry args={[0.028, 0.028, 0.035, 14]} />
            <meshStandardMaterial {...DARK_JOINT} />
          </mesh>
          {[-1, 1].map((e) => (
            <mesh key={e} position={[e * 0.022, 0.235, 0]}>
              <boxGeometry args={[0.012, 0.05, 0.03]} />
              <meshStandardMaterial {...DARK_JOINT} />
            </mesh>
          ))}
        </group>
      </group>
    </group>
  );
}

/** Rolling EV chassis: battery pack, motor and wheels on an open frame. */
function EvChassis() {
  const wheel = (x: number, z: number) => (
    <mesh key={`${x}${z}`} position={[x, 0.047, z]} rotation={[0, 0, Math.PI / 2]} castShadow>
      <cylinderGeometry args={[0.047, 0.047, 0.032, 20]} />
      <meshStandardMaterial color="#1c1e21" roughness={0.85} />
    </mesh>
  );
  return (
    <group>
      <mesh position={[0, 0.072, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.46, 0.018, 0.24]} />
        <meshStandardMaterial color="#8c9299" metalness={0.65} roughness={0.38} />
      </mesh>
      {[-0.17, 0.17].flatMap((x) => [-0.1, 0.1].map((z) => wheel(x, z)))}
      {/* battery pack */}
      <mesh position={[0, 0.098, 0]} castShadow>
        <boxGeometry args={[0.27, 0.04, 0.17]} />
        <meshStandardMaterial color="#2f6fd0" metalness={0.3} roughness={0.42} />
      </mesh>
      {[-0.06, 0, 0.06].map((z) => (
        <mesh key={z} position={[0, 0.119, z]}>
          <boxGeometry args={[0.25, 0.004, 0.012]} />
          <meshStandardMaterial color="#9ec6ff" emissive="#2f6fd0" emissiveIntensity={0.4} />
        </mesh>
      ))}
      {/* drive motor */}
      <mesh position={[0.185, 0.095, 0]} rotation={[0, 0, Math.PI / 2]} castShadow>
        <cylinderGeometry args={[0.032, 0.032, 0.07, 18]} />
        <meshStandardMaterial color="#d8dde2" metalness={0.7} roughness={0.3} />
      </mesh>
    </group>
  );
}

/** Smart-agriculture plot: a planted tray under a tilted solar panel. */
function SolarFarm() {
  return (
    <group>
      {/* planting tray */}
      <mesh position={[-0.08, 0.025, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.3, 0.05, 0.21]} />
        <meshStandardMaterial color="#6b5540" roughness={0.95} />
      </mesh>
      <mesh position={[-0.08, 0.052, 0]}>
        <boxGeometry args={[0.28, 0.008, 0.19]} />
        <meshStandardMaterial color="#3b2d1f" roughness={1} />
      </mesh>
      {[-0.11, -0.04, 0.03].flatMap((x) => [-0.06, 0, 0.06].map((z) => (
        <group key={`${x}${z}`} position={[x - 0.03, 0.06, z]}>
          <mesh position={[0, 0.028, 0]}>
            <cylinderGeometry args={[0.003, 0.004, 0.055, 6]} />
            <meshStandardMaterial color="#3f7a35" roughness={0.9} />
          </mesh>
          {[0, 2.1, 4.2].map((a) => (
            <mesh key={a} position={[Math.sin(a) * 0.018, 0.05, Math.cos(a) * 0.018]}
              rotation={[0.5, a, 0]}>
              <coneGeometry args={[0.014, 0.038, 5]} />
              <meshStandardMaterial color="#56a349" roughness={0.85} />
            </mesh>
          ))}
        </group>
      )))}
      {/* solar array on a mast */}
      <group position={[0.16, 0, 0]}>
        <mesh position={[0, 0.06, 0]} castShadow>
          <cylinderGeometry args={[0.008, 0.01, 0.12, 10]} />
          <meshStandardMaterial color="#b9bfc5" metalness={0.6} roughness={0.4} />
        </mesh>
        <group position={[0, 0.125, 0]} rotation={[-0.42, 0, 0]}>
          <mesh castShadow>
            <boxGeometry args={[0.23, 0.009, 0.15]} />
            <meshStandardMaterial color="#20406e" metalness={0.35} roughness={0.25} />
          </mesh>
          {[-0.057, 0, 0.057].map((x) => (
            <mesh key={x} position={[x, 0.006, 0]}>
              <boxGeometry args={[0.003, 0.001, 0.14]} />
              <meshStandardMaterial color="#9fb6d4" />
            </mesh>
          ))}
        </group>
      </group>
    </group>
  );
}

// ---------------------------------------------------------------------------
// Display units: glass book cases, cutout standees, the photo booth and the
// model vitrine. Each is a self-contained item that can be added, removed,
// dragged and turned like any other piece of furniture.
// ---------------------------------------------------------------------------

const GLASS = {
  color: '#cfe3ee', transparent: true, opacity: 0.17,
  roughness: 0.05, metalness: 0.1, side: THREE.DoubleSide,
} as const;
const ALU_EDGE = { color: '#b8bfc6', metalness: 0.8, roughness: 0.3 };

/** Four uprights and a cap, the frame a vitrine actually has. */
function Vitrine({ w, d, h, y }: { w: number; d: number; h: number; y: number }) {
  const t = 0.03;
  return (
    <group position={[0, y, 0]}>
      <mesh position={[0, h / 2, 0]}>
        <boxGeometry args={[w, h, d]} />
        <meshStandardMaterial {...GLASS} />
      </mesh>
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], i) => (
        <mesh key={i} position={[sx * (w / 2 - t / 2), h / 2, sz * (d / 2 - t / 2)]}>
          <boxGeometry args={[t, h, t]} />
          <meshStandardMaterial {...ALU_EDGE} />
        </mesh>
      ))}
      <mesh position={[0, h + t / 2, 0]}>
        <boxGeometry args={[w + 0.02, t, d + 0.02]} />
        <meshStandardMaterial {...ALU_EDGE} />
      </mesh>
      {/* the vitrine's own lighting, which is what makes a case read at all */}
      <mesh position={[0, h - 0.012, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[w - 0.1, d - 0.08]} />
        <meshBasicMaterial color="#fff3dd" toneMapped={false} />
      </mesh>
      <pointLight position={[0, h - 0.1, 0]} intensity={2.6} distance={1.6} color="#fff0d2" />
    </group>
  );
}

/** Glass book display: plinth, three lit shelves, books. */
function GlassCase() {
  const { w, d, plinth, glass, shelves } = GCASE;
  const spine = ['#8d2f2f', '#1f4d7a', '#2f6b45', '#8a6a2a', '#4a3570', '#a04a1e'];
  return (
    <group>
      <mesh position={[0, plinth / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, plinth, d]} />
        <meshStandardMaterial color="#f4f4f2" roughness={0.6} />
      </mesh>
      <Vitrine w={w} d={d} h={glass} y={plinth} />
      {Array.from({ length: shelves }, (_, i) => {
        const y = plinth + 0.1 + ((i + 1) * glass) / (shelves + 1);
        return (
          <group key={i}>
            <mesh position={[0, y, 0]} castShadow>
              <boxGeometry args={[w - 0.07, 0.016, d - 0.06]} />
              <meshStandardMaterial {...GLASS} opacity={0.35} />
            </mesh>
            {/* a run of books, leaning the last one as a real shelf does */}
            {Array.from({ length: 9 }, (__, b) => {
              const bw = 0.035 + (b % 3) * 0.012;
              const bh = 0.2 + ((b * 7) % 5) * 0.012;
              return (
                <mesh key={b}
                  position={[-w / 2 + 0.09 + b * 0.075, y + bh / 2 + 0.008, 0]}
                  rotation={[0, 0, b === 8 ? 0.28 : 0]} castShadow>
                  <boxGeometry args={[bw, bh, d - 0.14]} />
                  <meshStandardMaterial color={spine[(b + i * 2) % spine.length]}
                    roughness={0.8} />
                </mesh>
              );
            })}
          </group>
        );
      })}
    </group>
  );
}

/** 2D cutout standee: printed board on a weighted foot. */
function Standee({ tex }: { tex: THREE.Texture }) {
  const { w, h } = STANDEE;
  return (
    <group>
      <mesh position={[0, 0.012, 0]} receiveShadow>
        <cylinderGeometry args={[w * 0.42, w * 0.46, 0.024, 24]} />
        <meshStandardMaterial color="#d7dbe0" roughness={0.6} metalness={0.1} />
      </mesh>
      {/* The alphaTest is what makes this a cutout: without it the board
          renders as a rectangle with the figure painted on it. */}
      <mesh position={[0, h / 2 + 0.024, 0]} castShadow>
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial map={tex} transparent alphaTest={0.5}
          side={THREE.DoubleSide} roughness={0.85} />
      </mesh>
      {/* edge of the board, so it reads as 6 mm foam rather than a decal */}
      <mesh position={[0, h / 2 + 0.024, -0.004]}>
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial map={tex} transparent alphaTest={0.5}
          color="#d8d8d8" side={THREE.BackSide} />
      </mesh>
    </group>
  );
}

/**
 * Photo frame cutout at the exit: a board with a decorated border and a real
 * opening, on two feet, that visitors stand behind for a photo. It is a prop
 * in the floor plan, not a wall treatment -- hence the open back and the
 * timber battens holding it up.
 */
function PhotoFrame({ tex }: { tex: THREE.Texture }) {
  const { w, h, d, bottom } = PHOTO;
  const cy = bottom + h / 2;
  return (
    <group>
      {/* timber legs holding the frame at standing height */}
      {[-1, 1].map((e) => (
        <group key={e} position={[e * (w / 2 - 0.09), 0, 0]}>
          <mesh position={[0, 0.025, 0.04]} castShadow>
            <boxGeometry args={[0.14, 0.05, 0.38]} />
            <meshStandardMaterial color="#a8朗8a5f" roughness={0.85} />
          </mesh>
          <mesh position={[0, (bottom + 0.1) / 2, 0]} castShadow>
            <boxGeometry args={[0.05, bottom + 0.1, 0.045]} />
            <meshStandardMaterial color="#a8865f" roughness={0.85} />
          </mesh>
        </group>
      ))}
      {/* The cut board. alphaTest is what makes the centre an opening rather
          than a white rectangle with flowers drawn round it. */}
      <mesh position={[0, cy, 0]} castShadow>
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial map={tex} transparent alphaTest={0.5}
          side={THREE.DoubleSide} roughness={0.9} />
      </mesh>
      <mesh position={[0, cy, -d]}>
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial map={tex} transparent alphaTest={0.5}
          color="#e4e0d8" side={THREE.DoubleSide} roughness={0.95} />
      </mesh>
      {/* where to stand */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.006, -0.5]}>
        <ringGeometry args={[0.3, 0.36, 36]} />
        <meshBasicMaterial color="#c0398f" toneMapped={false} />
      </mesh>
      <pointLight position={[0, cy + 0.4, 0.6]} intensity={4} distance={2.6}
        color="#fff0d8" />
    </group>
  );
}

/**
 * U-shaped book wall: two full-height glazed columns of shelves with a bridge
 * across the top and an open centre, so a wall-mounted screen sits recessed in
 * the niche. Modelled on the client's reference unit -- dark frame, light
 * shelves, glazed doors.
 */
function BookWallU() {
  const { w, d, h, col, nicheBottom, nicheTop, shelves } = BWALL;
  const FRAME = { color: '#3a2b23', roughness: 0.68, metalness: 0.05 };
  const nicheW = w - col * 2;
  const spine = ['#8d2f2f', '#1f4d7a', '#2f6b45', '#8a6a2a', '#4a3570', '#a04a1e'];

  const column = (sx: number) => (
    <group position={[sx * (w / 2 - col / 2), 0, 0]}>
      <mesh position={[0, h / 2, -d / 2 + 0.01]} receiveShadow>
        <boxGeometry args={[col, h, 0.02]} />
        <meshStandardMaterial color="#efe9e2" roughness={0.85} />
      </mesh>
      {/* carcass */}
      {[[-1, 0], [1, 0]].map(([e]) => (
        <mesh key={e} position={[(e * (col - 0.05)) / 2, h / 2, 0]} castShadow>
          <boxGeometry args={[0.05, h, d]} />
          <meshStandardMaterial {...FRAME} />
        </mesh>
      ))}
      <mesh position={[0, h - 0.03, 0]} castShadow>
        <boxGeometry args={[col, 0.06, d]} />
        <meshStandardMaterial {...FRAME} />
      </mesh>
      <mesh position={[0, 0.03, 0]} castShadow>
        <boxGeometry args={[col, 0.06, d]} />
        <meshStandardMaterial {...FRAME} />
      </mesh>
      {Array.from({ length: shelves }, (_, i) => {
        const y = 0.12 + ((i + 1) * (h - 0.24)) / (shelves + 1);
        return (
          <group key={i}>
            <mesh position={[0, y, 0]} castShadow>
              <boxGeometry args={[col - 0.08, 0.022, d - 0.04]} />
              <meshStandardMaterial color="#f4f2ee" roughness={0.7} />
            </mesh>
            {Array.from({ length: 6 }, (__, b) => {
              const bh = 0.17 + ((b * 5) % 4) * 0.015;
              return (
                <mesh key={b} position={[-col / 2 + 0.1 + b * 0.072, y + bh / 2 + 0.012, 0]}
                  rotation={[0, 0, b === 5 ? 0.3 : 0]} castShadow>
                  <boxGeometry args={[0.04, bh, d - 0.16]} />
                  <meshStandardMaterial color={spine[(b + i) % spine.length]} roughness={0.8} />
                </mesh>
              );
            })}
          </group>
        );
      })}
      {/* glazed door */}
      <mesh position={[0, h / 2, d / 2 - 0.01]}>
        <boxGeometry args={[col - 0.1, h - 0.14, 0.012]} />
        <meshStandardMaterial {...GLASS} />
      </mesh>
      <mesh position={[col * 0.3, h * 0.5, d / 2 + 0.012]}>
        <boxGeometry args={[0.018, 0.26, 0.018]} />
        <meshStandardMaterial color="#c8ccd0" metalness={0.8} roughness={0.3} />
      </mesh>
      <pointLight position={[0, h * 0.72, d / 2 - 0.1]} intensity={2.2}
        distance={1.8} color="#fff0d2" />
    </group>
  );

  return (
    <group>
      {column(-1)}
      {column(1)}

      {/* bridge over the niche: a glazed display box */}
      <group position={[0, (nicheTop + h) / 2, 0]}>
        <mesh position={[0, 0, -d / 2 + 0.01]} receiveShadow>
          <boxGeometry args={[nicheW, h - nicheTop, 0.02]} />
          <meshStandardMaterial color="#efe9e2" roughness={0.85} />
        </mesh>
        <mesh position={[0, (h - nicheTop) / 2 - 0.03, 0]} castShadow>
          <boxGeometry args={[nicheW, 0.06, d]} />
          <meshStandardMaterial {...FRAME} />
        </mesh>
        <mesh position={[0, -(h - nicheTop) / 2 + 0.04, 0]} castShadow>
          <boxGeometry args={[nicheW, 0.08, d]} />
          <meshStandardMaterial {...FRAME} />
        </mesh>
        <mesh position={[0, 0, d / 2 - 0.012]}>
          <boxGeometry args={[nicheW - 0.04, h - nicheTop - 0.14, 0.012]} />
          <meshStandardMaterial {...GLASS} />
        </mesh>
        {/* a few display pieces behind the glass */}
        {[-0.5, -0.1, 0.35, 0.7].map((x, i) => (
          <mesh key={x} position={[x, -(h - nicheTop) / 2 + 0.12, 0]} castShadow>
            <boxGeometry args={[0.1, 0.14 + (i % 2) * 0.05, 0.1]} />
            <meshStandardMaterial color={['#c8a24a', '#9ab5c8', '#c08a6a', '#8fae92'][i]}
              roughness={0.6} metalness={0.2} />
          </mesh>
        ))}
        <pointLight position={[0, 0, d / 2 - 0.08]} intensity={2.4} distance={2}
          color="#fff0d2" />
      </group>

      {/* niche: open back so a wall-mounted screen shows through, recessed */}
      <mesh position={[0, nicheBottom / 2, -d / 2 + 0.01]} receiveShadow>
        <boxGeometry args={[nicheW, nicheBottom, 0.02]} />
        <meshStandardMaterial color="#efe9e2" roughness={0.85} />
      </mesh>
      <mesh position={[0, nicheBottom - 0.03, 0]} castShadow receiveShadow>
        <boxGeometry args={[nicheW, 0.06, d]} />
        <meshStandardMaterial {...FRAME} />
      </mesh>
      {/* plinth */}
      <mesh position={[0, 0.05, 0]} castShadow>
        <boxGeometry args={[w, 0.1, d]} />
        <meshStandardMaterial {...FRAME} />
      </mesh>
    </group>
  );
}

/** The scale model under a 4 ft x 2 ft vitrine, on a captioned plinth. */
function ModelCase({ caption }: { caption: THREE.Texture }) {
  const { w, d, plinth, glass } = MCASE;
  const build = (x: number, z: number, bw: number, bd: number, bh: number, c: string) => (
    <mesh position={[x, plinth + bh / 2 + 0.01, z]} castShadow>
      <boxGeometry args={[bw, bh, bd]} />
      <meshStandardMaterial color={c} roughness={0.75} />
    </mesh>
  );
  return (
    <group>
      <mesh position={[0, plinth / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, plinth, d]} />
        <meshStandardMaterial color="#f4f4f2" roughness={0.6} />
      </mesh>
      {/* caption on all four plinth faces, so it reads from any approach */}
      {[0, Math.PI / 2, Math.PI, -Math.PI / 2].map((r, i) => (
        <mesh key={i} position={[
          r === 0 ? 0 : r === Math.PI ? 0 : (r > 0 ? -w / 2 - 0.003 : w / 2 + 0.003),
          plinth - 0.14,
          r === 0 ? d / 2 + 0.003 : r === Math.PI ? -d / 2 - 0.003 : 0,
        ]} rotation={[0, r, 0]}>
          <planeGeometry args={[(i % 2 ? d : w) * 0.92, 0.17]} />
          <meshStandardMaterial map={caption} roughness={0.5} />
        </mesh>
      ))}

      {/* the diorama: school, pathway, campus, workplace */}
      <mesh position={[0, plinth + 0.008, 0]} receiveShadow>
        <boxGeometry args={[w - 0.05, 0.016, d - 0.05]} />
        <meshStandardMaterial color="#cfd6cb" roughness={0.95} />
      </mesh>
      {/* the pathway running the length of it */}
      <mesh position={[0, plinth + 0.018, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <planeGeometry args={[w - 0.12, 0.075]} />
        <meshStandardMaterial color="#d9b26a" roughness={0.6} />
      </mesh>
      {build(-0.42, -0.14, 0.2, 0.15, 0.13, '#e8e4dc')}
      {build(-0.42, -0.14 + 0.0, 0.2, 0.15, 0.13, '#e8e4dc')}
      {build(-0.14, -0.15, 0.17, 0.14, 0.18, '#dfe6ee')}
      {build(0.16, -0.15, 0.19, 0.14, 0.23, '#cfd8e6')}
      {build(0.45, -0.14, 0.21, 0.16, 0.3, '#b9c6d8')}
      {/* graduation cap marking the turn from study to work */}
      <group position={[0.02, plinth + 0.07, 0.13]}>
        <mesh castShadow>
          <cylinderGeometry args={[0.03, 0.035, 0.03, 14]} />
          <meshStandardMaterial color="#15306d" roughness={0.6} />
        </mesh>
        <mesh position={[0, 0.022, 0]} rotation={[0.12, 0.5, 0]}>
          <boxGeometry args={[0.1, 0.006, 0.1]} />
          <meshStandardMaterial color="#15306d" roughness={0.6} />
        </mesh>
      </group>
      {/* direction arrows along the path */}
      {[-0.3, 0, 0.3].map((x) => (
        <mesh key={x} position={[x, plinth + 0.026, 0]} rotation={[-Math.PI / 2, 0, -Math.PI / 2]}>
          <coneGeometry args={[0.022, 0.05, 3]} />
          <meshStandardMaterial color="#15306d" />
        </mesh>
      ))}
      <Vitrine w={w} d={d} h={glass} y={plinth} />
    </group>
  );
}

// ---------------------------------------------------------------------------
// Scale models on display tables. These are physical models standing on a
// table in the stall, so they are built at model scale: what has to read from
// across the booth is the massing, the colour blocking and the title bands.
// ---------------------------------------------------------------------------

/** The table a scale model stands on, with a caption on its front rail. */
// ---------------------------------------------------------------------------
// People: uniform mannequins on stands, and the visitors and staff that make
// a stall read at human scale.
// ---------------------------------------------------------------------------

const SKIN = ['#e0ac7e', '#c68642', '#8d5524', '#f0c8a0'];

/**
 * A uniform display mannequin: a featureless form on a disc base, wearing the
 * garments. Deliberately faceless -- that is what distinguishes a mannequin
 * from a figure of a person.
 */
function Mannequin({ girl }: { girl: boolean }) {
  const FORM = { color: '#e8e3d9', roughness: 0.55, metalness: 0.05 };
  const NAVY = { color: '#15306d', roughness: 0.8 };
  const SHIRT = { color: '#fbfbfa', roughness: 0.85 };
  const h = MANNEQUIN.h;
  return (
    <group>
      {/* base and post */}
      <mesh position={[0, 0.012, 0]} receiveShadow castShadow>
        <cylinderGeometry args={[MANNEQUIN.base, MANNEQUIN.base * 1.08, 0.024, 28]} />
        <meshStandardMaterial color="#b9bfc5" metalness={0.6} roughness={0.35} />
      </mesh>
      <mesh position={[0, 0.2, 0]} castShadow>
        <cylinderGeometry args={[0.018, 0.022, 0.38, 12]} />
        <meshStandardMaterial color="#b9bfc5" metalness={0.6} roughness={0.35} />
      </mesh>

      {/* legs */}
      {[-1, 1].map((e) => (
        <mesh key={e} position={[e * 0.07, 0.58, 0]} castShadow>
          <cylinderGeometry args={[0.052, 0.062, 0.52, 14]} />
          <meshStandardMaterial {...FORM} />
        </mesh>
      ))}
      {/* socks + shoes, since a uniform display includes them */}
      {[-1, 1].map((e) => (
        <group key={`f${e}`}>
          <mesh position={[e * 0.07, 0.4, 0]} castShadow>
            <cylinderGeometry args={[0.055, 0.058, 0.16, 14]} />
            <meshStandardMaterial {...SHIRT} />
          </mesh>
          <mesh position={[e * 0.07, 0.33, 0.02]} castShadow>
            <boxGeometry args={[0.1, 0.06, 0.2]} />
            <meshStandardMaterial color="#23262b" roughness={0.6} />
          </mesh>
        </group>
      ))}

      {/* hips / skirt or shorts */}
      {girl ? (
        <mesh position={[0, 0.98, 0]} castShadow>
          <cylinderGeometry args={[0.17, 0.3, 0.46, 20]} />
          <meshStandardMaterial {...NAVY} />
        </mesh>
      ) : (
        <mesh position={[0, 0.83, 0]} castShadow>
          <cylinderGeometry args={[0.17, 0.2, 0.26, 18]} />
          <meshStandardMaterial {...NAVY} />
        </mesh>
      )}

      {/* torso in the shirt */}
      <mesh position={[0, 1.22, 0]} castShadow>
        <cylinderGeometry args={[0.15, 0.17, 0.42, 20]} />
        <meshStandardMaterial {...SHIRT} />
      </mesh>
      {/* arms */}
      {[-1, 1].map((e) => (
        <mesh key={e} position={[e * 0.19, 1.2, 0]} rotation={[0, 0, e * 0.1]} castShadow>
          <cylinderGeometry args={[0.042, 0.05, 0.44, 12]} />
          <meshStandardMaterial {...SHIRT} />
        </mesh>
      ))}
      {/* tie */}
      <mesh position={[0, 1.26, 0.152]} castShadow>
        <boxGeometry args={[0.05, 0.28, 0.012]} />
        <meshStandardMaterial {...NAVY} />
      </mesh>
      {girl && (
        <mesh position={[0, 1.18, 0]} castShadow>
          <cylinderGeometry args={[0.175, 0.185, 0.2, 20]} />
          <meshStandardMaterial {...NAVY} />
        </mesh>
      )}
      {/* shoulders and a blank head form */}
      <mesh position={[0, 1.46, 0]} castShadow>
        <cylinderGeometry args={[0.055, 0.075, 0.1, 14]} />
        <meshStandardMaterial {...FORM} />
      </mesh>
      <mesh position={[0, h - 0.04, 0]} castShadow>
        <sphereGeometry args={[0.1, 20, 16]} />
        <meshStandardMaterial {...FORM} />
      </mesh>
    </group>
  );
}

/** One person, built to a height so the same part makes adults and children. */
function Person({ h, top, bottom, skin, hair, bag = false }: {
  h: number; top: string; bottom: string; skin: string; hair: string; bag?: boolean;
}) {
  const u = h / 1.7;
  return (
    <group>
      {[-1, 1].map((e) => (
        <mesh key={e} position={[e * 0.065 * u, 0.4 * u, 0]} castShadow>
          <cylinderGeometry args={[0.05 * u, 0.058 * u, 0.8 * u, 12]} />
          <meshStandardMaterial color={bottom} roughness={0.85} />
        </mesh>
      ))}
      {[-1, 1].map((e) => (
        <mesh key={`s${e}`} position={[e * 0.065 * u, 0.025 * u, 0.02 * u]} castShadow>
          <boxGeometry args={[0.1 * u, 0.05 * u, 0.2 * u]} />
          <meshStandardMaterial color="#23262b" roughness={0.7} />
        </mesh>
      ))}
      <mesh position={[0, 1.05 * u, 0]} castShadow>
        <cylinderGeometry args={[0.14 * u, 0.16 * u, 0.5 * u, 16]} />
        <meshStandardMaterial color={top} roughness={0.85} />
      </mesh>
      {[-1, 1].map((e) => (
        <mesh key={`a${e}`} position={[e * 0.185 * u, 1.03 * u, 0]} rotation={[0, 0, e * 0.12]} castShadow>
          <cylinderGeometry args={[0.04 * u, 0.045 * u, 0.46 * u, 10]} />
          <meshStandardMaterial color={top} roughness={0.85} />
        </mesh>
      ))}
      <mesh position={[0, 1.34 * u, 0]} castShadow>
        <cylinderGeometry args={[0.05 * u, 0.06 * u, 0.08 * u, 12]} />
        <meshStandardMaterial color={skin} roughness={0.8} />
      </mesh>
      <mesh position={[0, 1.46 * u, 0]} castShadow>
        <sphereGeometry args={[0.1 * u, 18, 14]} />
        <meshStandardMaterial color={skin} roughness={0.8} />
      </mesh>
      <mesh position={[0, 1.5 * u, -0.012 * u]} castShadow>
        <sphereGeometry args={[0.102 * u, 18, 14, 0, Math.PI * 2, 0, Math.PI * 0.62]} />
        <meshStandardMaterial color={hair} roughness={0.9} />
      </mesh>
      {bag && (
        <mesh position={[0, 1.05 * u, -0.17 * u]} castShadow>
          <boxGeometry args={[0.22 * u, 0.3 * u, 0.1 * u]} />
          <meshStandardMaterial color="#c0392b" roughness={0.85} />
        </mesh>
      )}
    </group>
  );
}

/** An instructor with a small group of students, facing them. */
function FigureGroup() {
  const kids = [
    { x: -0.46, z: 0.26, h: 1.26, top: '#fbfbfa', bottom: '#15306d', hair: '#241a14', a: 0.25 },
    { x: -0.14, z: 0.40, h: 1.2, top: '#fbfbfa', bottom: '#15306d', hair: '#2b1d14', a: 0.1 },
    { x: 0.2, z: 0.34, h: 1.32, top: '#fbfbfa', bottom: '#15306d', hair: '#1c1510', a: -0.12 },
    { x: 0.5, z: 0.2, h: 1.22, top: '#fbfbfa', bottom: '#15306d', hair: '#3a2a1c', a: -0.3 },
  ];
  return (
    <group>
      {/* instructor, turned to face the group */}
      <group position={[0.1, 0, -0.34]} rotation={[0, Math.PI, 0]}>
        <Person h={1.7} top="#1f6fd0" bottom="#2c3138" skin={SKIN[1]} hair="#1b1510" />
      </group>
      {kids.map((k, i) => (
        <group key={i} position={[k.x, 0, k.z]} rotation={[0, k.a, 0]}>
          <Person h={k.h} top={k.top} bottom={k.bottom} skin={SKIN[i % SKIN.length]}
            hair={k.hair} bag={i % 2 === 0} />
        </group>
      ))}
    </group>
  );
}

function DisplayTable({ caption }: { caption: THREE.Texture }) {
  const { w, d, h, top } = DTABLE;
  return (
    <group>
      <mesh position={[0, h - top / 2, 0]} castShadow receiveShadow>
        <boxGeometry args={[w, top, d]} />
        <meshStandardMaterial color="#ffffff" roughness={0.42} metalness={0.04} />
      </mesh>
      <mesh position={[0, (h - top) / 2, 0]} castShadow>
        <boxGeometry args={[w - 0.12, h - top, d - 0.12]} />
        <meshStandardMaterial color="#f1f1ee" roughness={0.65} />
      </mesh>
      <mesh position={[0, h - 0.17, d / 2 - 0.055]}>
        <planeGeometry args={[w * 0.84, 0.13]} />
        <meshStandardMaterial map={caption} roughness={0.5} />
      </mesh>
      {/* a warm line under the top, as a lit display table has */}
      <mesh position={[0, h - top - 0.012, d / 2 - 0.058]}>
        <planeGeometry args={[w - 0.16, 0.016]} />
        <meshBasicMaterial color="#ffd9a0" toneMapped={false} />
      </mesh>
    </group>
  );
}

/** A crowd of little figures, the way a scale model shows people. */
function Figures({ n, w: spanW, d: spanD, colors, scale = 1 }: {
  n: number; w: number; d: number; colors: string[]; scale?: number;
}) {
  return (
    <group>
      {Array.from({ length: n }, (_, i) => {
        const cols = Math.ceil(Math.sqrt(n * (spanW / Math.max(spanD, 0.01))));
        const row = Math.floor(i / cols), col = i % cols;
        const rows = Math.ceil(n / cols);
        const x = spanW * ((col + 0.5) / cols - 0.5);
        const z = spanD * ((row + 0.5) / Math.max(rows, 1) - 0.5);
        const c = colors[(i * 7) % colors.length];
        return (
          <group key={i} position={[x, 0, z]} scale={scale}>
            <mesh position={[0, 0.016, 0]}>
              <cylinderGeometry args={[0.008, 0.009, 0.032, 7]} />
              <meshStandardMaterial color={c} roughness={0.8} />
            </mesh>
            <mesh position={[0, 0.039, 0]}>
              <sphereGeometry args={[0.009, 8, 6]} />
              <meshStandardMaterial color="#e0ac7e" roughness={0.8} />
            </mesh>
          </group>
        );
      })}
    </group>
  );
}

const TIERS = [
  { t: '135 MASTER TRAINERS', c: '#8a3fd1', w: 0.34, n: 6 },
  { t: '543 NODAL FACULTY', c: '#17a398', w: 0.46, n: 10 },
  { t: '36,800 COLLEGE INTERNS', c: '#1e9e4a', w: 0.58, n: 14 },
  { t: '4,32,000+ STUDENTS REACHED', c: '#e8721c', w: 0.70, n: 18 },
  { t: 'FINAL TARGET  10 LAKH', c: '#f0b400', w: 0.82, n: 0 },
];

const STACK = [
  ['Education Department', '#1769d6'], ['Higher Education Dept.', '#7b3fd1'],
  ['Collegiate & Technical Edn.', '#f0b400'], ['All State Universities', '#17a398'],
  ['Degree & Polytechnic Colleges', '#1e9e4a'], ['Directorate of School Edn.', '#e8721c'],
  ['SCERT', '#e0318b'], ['Government Schools', '#d93025'],
] as const;

/** Simple sectioned building: floor slabs with figures between them. */
function MiniBuilding({ w, d, floors, wall, band, people }: {
  w: number; d: number; floors: number; wall: string; band: string; people: string[];
}) {
  const fh = 0.075;
  return (
    <group>
      {Array.from({ length: floors }, (_, f) => (
        <group key={f} position={[0, f * fh, 0]}>
          <mesh position={[0, 0.004, 0]} receiveShadow>
            <boxGeometry args={[w, 0.008, d]} />
            <meshStandardMaterial color="#f2f2ef" roughness={0.8} />
          </mesh>
          <mesh position={[0, fh / 2, -d / 2 + 0.004]}>
            <boxGeometry args={[w, fh, 0.008]} />
            <meshStandardMaterial color={wall} roughness={0.85} />
          </mesh>
          <group position={[0, 0.008, 0.01]}>
            <Figures n={10} w={w - 0.06} d={d - 0.08} colors={people} scale={0.85} />
          </group>
        </group>
      ))}
      <mesh position={[0, floors * fh + 0.008, 0]}>
        <boxGeometry args={[w + 0.02, 0.016, d + 0.02]} />
        <meshStandardMaterial color={band} roughness={0.7} />
      </mesh>
      {/* corner posts */}
      {[[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([sx, sz], i) => (
        <mesh key={i} position={[sx * w / 2, (floors * fh) / 2, sz * d / 2]}>
          <boxGeometry args={[0.012, floors * fh, 0.012]} />
          <meshStandardMaterial color="#1b2a4a" roughness={0.6} />
        </mesh>
      ))}
    </group>
  );
}

function MentorshipModel({ header, tiers, stack, banner }: {
  header: THREE.Texture; tiers: THREE.Texture[];
  stack: THREE.Texture[]; banner: THREE.Texture;
}) {
  const PEOPLE = ['#d93025', '#1769d6', '#f0b400', '#1e9e4a', '#7b3fd1', '#e8721c'];
  return (
    <group>
      {/* base board */}
      <mesh position={[0, 0.015, 0]} receiveShadow castShadow>
        <boxGeometry args={[1.6, 0.03, 0.74]} />
        <meshStandardMaterial color="#11224a" roughness={0.7} />
      </mesh>
      <mesh position={[0, 0.032, 0]} receiveShadow>
        <boxGeometry args={[1.56, 0.006, 0.70]} />
        <meshStandardMaterial color="#cfe4d2" roughness={0.9} />
      </mesh>
      {/* bottom banner across the front edge */}
      <mesh position={[0, 0.018, 0.372]}>
        <planeGeometry args={[1.5, 0.034]} />
        <meshStandardMaterial map={banner} roughness={0.5} />
      </mesh>

      {/* left: degree / polytechnic college */}
      <group position={[-0.56, 0.035, -0.04]}>
        <MiniBuilding w={0.42} d={0.26} floors={2} wall="#e8b9c6" band="#e0318b"
          people={PEOPLE} />
      </group>
      {/* right: government school */}
      <group position={[0.58, 0.035, -0.02]}>
        <MiniBuilding w={0.40} d={0.24} floors={1} wall="#d9c4a0" band="#e8721c"
          people={PEOPLE} />
      </group>

      {/* centre: the cascade, widest at the bottom */}
      <group position={[0, 0.035, 0.02]}>
        {TIERS.map((t, i) => {
          const y = (TIERS.length - 1 - i) * 0.042;
          const z = -0.16 + i * 0.062;
          return (
            <group key={t.t} position={[0, y, z]}>
              <mesh position={[0, 0.018, 0]} castShadow receiveShadow>
                <boxGeometry args={[t.w, 0.036, 0.058]} />
                <meshStandardMaterial color="#f4f4f2" roughness={0.7} />
              </mesh>
              <mesh position={[0, 0.03, 0.03]}>
                <planeGeometry args={[t.w * 0.96, 0.016]} />
                <meshStandardMaterial map={tiers[i]} roughness={0.5} />
              </mesh>
              {t.n > 0 && (
                <group position={[0, 0.036, -0.004]}>
                  <Figures n={t.n} w={t.w - 0.05} d={0.03} colors={PEOPLE} scale={0.8} />
                </group>
              )}
            </group>
          );
        })}
      </group>

      {/* the header board on two posts */}
      <group position={[-0.12, 0.035, -0.1]}>
        {[-0.3, 0.3].map((x) => (
          <mesh key={x} position={[x, 0.17, 0]}>
            <boxGeometry args={[0.014, 0.34, 0.014]} />
            <meshStandardMaterial color="#11224a" roughness={0.6} />
          </mesh>
        ))}
        <mesh position={[0, 0.4, 0]} castShadow>
          <boxGeometry args={[0.78, 0.3, 0.012]} />
          <meshStandardMaterial map={header} roughness={0.5} />
        </mesh>
      </group>

      {/* right: the institution stack, bottom to top */}
      <group position={[0.58, 0.035, -0.02]}>
        <mesh position={[0, 0.2, -0.02]}>
          <boxGeometry args={[0.012, 0.4, 0.012]} />
          <meshStandardMaterial color="#11224a" roughness={0.6} />
        </mesh>
        {STACK.map(([, c], i) => (
          <group key={i} position={[0, 0.07 + (STACK.length - 1 - i) * 0.047, 0]}>
            <mesh castShadow>
              <boxGeometry args={[0.34, 0.038, 0.03]} />
              <meshStandardMaterial color={c} roughness={0.6} />
            </mesh>
            <mesh position={[0, 0, 0.016]}>
              <planeGeometry args={[0.32, 0.03]} />
              <meshStandardMaterial map={stack[i]} roughness={0.5} />
            </mesh>
          </group>
        ))}
      </group>

      {/* the seven-step chip row in front of the cascade */}
      {Array.from({ length: 7 }, (_, i) => (
        <mesh key={i} position={[-0.33 + i * 0.11, 0.05, 0.25]} castShadow>
          <boxGeometry args={[0.095, 0.03, 0.07]} />
          <meshStandardMaterial
            color={['#e0318b', '#1769d6', '#e8721c', '#17a398', '#1e9e4a', '#f0b400', '#d93025'][i]}
            roughness={0.6} />
        </mesh>
      ))}
    </group>
  );
}

const AEDP_STATIONS: { x: number; z: number; r: number; c: string; kind: string }[] = [
  { x: -0.60, z: -0.04, r: 0.115, c: '#1b8f93', kind: 'books' },
  { x: -0.26, z: 0.06, r: 0.115, c: '#e07b24', kind: 'people' },
  { x: 0.05, z: -0.08, r: 0.105, c: '#c0392b', kind: 'workshop' },
  { x: 0.33, z: 0.04, r: 0.105, c: '#1f6fd0', kind: 'gear' },
  { x: 0.62, z: -0.02, r: 0.115, c: '#1e9e4a', kind: 'tower' },
];

function AedpModel({ band, cards }: { band: THREE.Texture; cards: THREE.Texture[] }) {
  const PEOPLE = ['#1f6fd0', '#e07b24', '#1e9e4a', '#c0392b', '#f0b400'];
  const tree = (x: number, z: number, h: number) => (
    <group key={`${x}${z}`} position={[x, 0.036, z]}>
      <mesh position={[0, h / 2, 0]} castShadow>
        <coneGeometry args={[h * 0.4, h, 8]} />
        <meshStandardMaterial color="#2f7d3f" roughness={0.9} />
      </mesh>
    </group>
  );
  return (
    <group>
      {/* white base with the titled edge band */}
      <mesh position={[0, 0.018, 0]} receiveShadow castShadow>
        <boxGeometry args={[1.6, 0.036, 0.74]} />
        <meshStandardMaterial color="#f7f7f5" roughness={0.6} />
      </mesh>
      <mesh position={[0, 0.016, 0.371]}>
        <planeGeometry args={[1.56, 0.03]} />
        <meshStandardMaterial map={band} roughness={0.5} />
      </mesh>

      {AEDP_STATIONS.map((st, i) => (
        <group key={i} position={[st.x, 0.036, st.z]}>
          <mesh position={[0, 0.012, 0]} castShadow receiveShadow>
            <cylinderGeometry args={[st.r, st.r, 0.024, 28]} />
            <meshStandardMaterial color={st.c} roughness={0.7} />
          </mesh>

          {st.kind === 'books' && Array.from({ length: 8 }, (_, b) => (
            <mesh key={b} position={[-0.06 + (b % 4) * 0.04, 0.038, -0.03 + Math.floor(b / 4) * 0.05]}
              rotation={[0, 0.2, 0]} castShadow>
              <boxGeometry args={[0.032, 0.02, 0.042]} />
              <meshStandardMaterial color={b % 2 ? '#e07b24' : '#1b8f93'} roughness={0.8} />
            </mesh>
          ))}
          {st.kind === 'people' && (
            <group position={[0, 0.024, 0]}>
              <Figures n={12} w={0.16} d={0.12} colors={PEOPLE} />
            </group>
          )}
          {st.kind === 'workshop' && (
            <group position={[0, 0.024, 0]}>
              <mesh position={[0, 0.04, -0.02]} castShadow>
                <boxGeometry args={[0.13, 0.08, 0.09]} />
                <meshStandardMaterial color="#c0392b" roughness={0.7} />
              </mesh>
              <mesh position={[0.03, 0.025, 0.04]} rotation={[0, 0.4, 0]} castShadow>
                <boxGeometry args={[0.09, 0.05, 0.05]} />
                <meshStandardMaterial color="#e8c84a" roughness={0.6} />
              </mesh>
            </group>
          )}
          {st.kind === 'gear' && (
            <group position={[0, 0.03, 0]}>
              <mesh rotation={[Math.PI / 2, 0, 0]} castShadow>
                <cylinderGeometry args={[0.05, 0.05, 0.014, 12]} />
                <meshStandardMaterial color="#e8c84a" metalness={0.5} roughness={0.4} />
              </mesh>
              <Figures n={6} w={0.14} d={0.08} colors={PEOPLE} />
            </group>
          )}
          {st.kind === 'tower' && (
            <group position={[0, 0.024, 0]}>
              <mesh position={[0, 0.11, -0.01]} castShadow>
                <cylinderGeometry args={[0.022, 0.028, 0.22, 10]} />
                <meshStandardMaterial color="#2f7d3f" roughness={0.7} />
              </mesh>
              <mesh position={[0, 0.235, -0.01]} castShadow>
                <boxGeometry args={[0.07, 0.012, 0.07]} />
                <meshStandardMaterial color="#1b2a4a" roughness={0.6} />
              </mesh>
              <Figures n={8} w={0.16} d={0.1} colors={PEOPLE} />
            </group>
          )}

          {/* numbered caption card on a stalk */}
          <mesh position={[0, 0.17, 0]}>
            <boxGeometry args={[0.004, 0.13, 0.004]} />
            <meshStandardMaterial color="#9aa3aa" />
          </mesh>
          <mesh position={[0, 0.25, 0]} castShadow>
            <planeGeometry args={[0.2, 0.05]} />
            <meshStandardMaterial map={cards[i]} roughness={0.5} side={THREE.DoubleSide} />
          </mesh>
        </group>
      ))}

      {/* the college building at the back */}
      <group position={[-0.18, 0.036, -0.25]}>
        <mesh position={[0, 0.05, 0]} castShadow>
          <boxGeometry args={[0.3, 0.1, 0.14]} />
          <meshStandardMaterial color="#f0ece2" roughness={0.8} />
        </mesh>
        <mesh position={[0, 0.112, 0]} castShadow>
          <boxGeometry args={[0.32, 0.026, 0.16]} />
          <meshStandardMaterial color="#b4472e" roughness={0.8} />
        </mesh>
        <mesh position={[0, 0.138, 0]}>
          <sphereGeometry args={[0.028, 14, 10, 0, Math.PI * 2, 0, Math.PI / 2]} />
          <meshStandardMaterial color="#e8e4d8" roughness={0.7} />
        </mesh>
      </group>

      {[[-0.72, 0.26, 0.09], [0.0, 0.3, 0.075], [0.45, 0.28, 0.08], [0.74, 0.2, 0.07],
        [-0.42, 0.3, 0.07]].map(([x, z, h]) => tree(x, z, h))}
    </group>
  );
}

function DisplaySteps({ labels }: { labels: THREE.Texture[] }) {
  return (
    <group>
      {STEP_HEIGHTS.map((h, i) => (
        <group key={i} position={[0, 0, STEP.d * (i - 1)]}>
          <mesh position={[0, h / 2, 0]} castShadow receiveShadow>
            <boxGeometry args={[STEP.w, h, STEP.d]} />
            <meshStandardMaterial color="#f6f6f4" roughness={0.62} />
          </mesh>
          {/* worktop lip */}
          <mesh position={[0, h + 0.012, 0]} castShadow>
            <boxGeometry args={[STEP.w + 0.05, 0.024, STEP.d + 0.05]} />
            <meshStandardMaterial color="#ffffff" roughness={0.3} metalness={0.06} />
          </mesh>
          {/* caption plate on the riser */}
          <mesh position={[0, h - 0.145, STEP.d / 2 + 0.006]}>
            <planeGeometry args={[STEP.w * 0.84, STEP_LABEL_H]} />
            <meshStandardMaterial map={labels[i]} roughness={0.5} />
          </mesh>
          {/* warm strip washing the floor under the front lip */}
          <mesh position={[0, 0.03, STEP.d / 2 + 0.004]}>
            <planeGeometry args={[STEP.w * 0.94, 0.02]} />
            <meshBasicMaterial color="#ffd9a0" toneMapped={false} />
          </mesh>
          {/* Scaled to very nearly fill the 4 ft x 2 ft platform -- at
              model scale these read as exhibits, not as desk ornaments. */}
          <group position={[0, h + 0.024, 0]}>
            {i === 0 && <group scale={1.85}><RobotArm /></group>}
            {i === 1 && <group scale={2.3}><EvChassis /></group>}
            {i === 2 && <group scale={2.25}><SolarFarm /></group>}
          </group>
        </group>
      ))}
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

/**
 * Live screen content. A video drives a VideoTexture directly; a slideshow
 * pre-composites each image to the screen's aspect and cycles them on a timer.
 * The element and its texture are owned here so playback is torn down cleanly
 * when the media, the TV or the whole stall changes.
 */
function TvScreen({ id, w, h, media, ctx }: {
  id: SurfaceId; w: number; h: number;
  media: TvMedia | undefined; ctx: SurfaceCtx;
}) {
  const [tex, setTex] = useState<THREE.Texture | null>(null);
  const [slides, setSlides] = useState<THREE.Texture[]>([]);
  const [idx, setIdx] = useState(0);
  const video = useRef<HTMLVideoElement | null>(null);

  const srcKey = media ? media.items.map((i) => i.src).join('|') : '';

  // --- video ---
  useEffect(() => {
    if (media?.kind !== 'video' || !media.items[0]) return;
    const v = document.createElement('video');
    v.src = media.items[0].src;
    v.loop = media.loop;
    v.muted = media.muted;
    v.playsInline = true;
    v.preload = 'auto';
    video.current = v;
    const t = new THREE.VideoTexture(v);
    t.colorSpace = THREE.SRGBColorSpace;
    setTex(t);
    if (media.playing) v.play().catch(() => { /* autoplay refused until a gesture */ });
    return () => {
      v.pause();
      v.removeAttribute('src');
      v.load();
      t.dispose();
      video.current = null;
      setTex(null);
    };
  }, [media?.kind, srcKey]);

  // transport changes shouldn't rebuild the element
  useEffect(() => {
    const v = video.current;
    if (!v || media?.kind !== 'video') return;
    v.loop = media.loop;
    v.muted = media.muted;
    if (media.playing) v.play().catch(() => {}); else v.pause();
  }, [media?.playing, media?.muted, media?.loop, media?.kind]);

  // --- slideshow ---
  useEffect(() => {
    if (media?.kind !== 'slideshow') { setSlides([]); return; }
    let dead = false;
    const built: THREE.Texture[] = [];
    (async () => {
      const spec = { w: w * 1000, h: h * 1000, frame: 0, label: 'TV' };
      for (const it of media.items) {
        try {
          const img = await loadImage(it.src);
          if (dead) return;
          built.push(buildArtworkTexture(img, {
            ...DEFAULT_ARTWORK, name: it.name, src: it.src,
            imgW: img.naturalWidth, imgH: img.naturalHeight,
          }, spec));
        } catch { /* skip an unreadable slide */ }
      }
      if (dead) { built.forEach((t) => t.dispose()); return; }
      setSlides(built);
      setIdx(0);
    })();
    return () => { dead = true; built.forEach((t) => t.dispose()); };
  }, [media?.kind, srcKey, w, h]);

  useEffect(() => {
    if (media?.kind !== 'slideshow' || !media.playing || slides.length < 2) return;
    const t = setInterval(
      () => setIdx((i) => (i + 1) % slides.length),
      Math.max(800, media.intervalMs),
    );
    return () => clearInterval(t);
  }, [media?.kind, media?.playing, media?.intervalMs, slides.length]);

  const map = media?.kind === 'slideshow' ? slides[idx] ?? null : tex;
  const lit = ctx.hover === id || ctx.selected === id;

  return (
    <group>
      <mesh
        position={[0, 0, TV_DEPTH / 2 + 0.002]}
        userData={{ surfaceId: id }}
        onClick={(e) => { e.stopPropagation(); ctx.onPick(id); }}
      >
        <planeGeometry args={[w, h]} />
        {/* keyed so adding or removing a map recompiles the shader */}
        <meshBasicMaterial key={map ? map.uuid : 'idle'}
          map={map ?? undefined} color={map ? '#ffffff' : '#16314a'} toneMapped={false} />
      </mesh>
      {!map && (
        <mesh position={[0, 0, TV_DEPTH / 2 + 0.003]}>
          <planeGeometry args={[w * 0.96, h * 0.96]} />
          <meshBasicMaterial color="#1d4e74" toneMapped={false} />
        </mesh>
      )}
      {lit && (
        <mesh position={[0, 0, TV_DEPTH / 2 + 0.006]}>
          <planeGeometry args={[w, h]} />
          <meshBasicMaterial color={ctx.hover === id ? '#4da3ff' : '#2f81f7'}
            transparent opacity={ctx.hover === id ? 0.34 : 0.14} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}

function TvUnit({ id, sizeIdx, media, ctx }: {
  id: SurfaceId; sizeIdx: number; media: TvMedia | undefined; ctx: SurfaceCtx;
}) {
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
      <TvScreen id={id} w={s.w - 0.03} h={s.h - 0.03} media={media} ctx={ctx} />
    </group>
  );
}

// ---------------------------------------------------------------------------
// Dragging
// ---------------------------------------------------------------------------

const FLOOR = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
const SNAP = 0.05;
const snap = (v: number) => Math.round(v / SNAP) * SNAP;

/** Where a stall sits in the world, so a world-space drag can be read back
 *  into the stall's own coordinates. The rear stall is turned exactly 180
 *  degrees, which is why one sign flip covers both axes. */
export interface Frame { x: number; z: number; flip: boolean }

function Draggable({
  p, cfg, frame, onMove, onRotate, onGrab, onRelease, selected, onSelect,
  rotateMode, children,
}: {
  p: Placement; cfg: Config; frame: Frame;
  rotateMode: boolean;
  onMove: (id: string, x: number, z: number) => void;
  onRotate: (id: string, rotY: number) => void;
  onGrab: () => void; onRelease: () => void;
  selected: boolean; onSelect: (id: string) => void;
  children: React.ReactNode;
}) {
  const drag = useRef(false);
  const mode = useRef<'move' | 'rotate'>('move');
  const spin = useRef(false);
  const off = useRef({ x: 0, z: 0 });
  const hit = useMemo(() => new THREE.Vector3(), []);
  const [hover, setHover] = useState(false);

  const sign = frame.flip ? -1 : 1;
  const local = () => ({
    x: sign * (hit.x - frame.x),
    z: sign * (hit.z - frame.z),
  });

  const STEP = Math.PI / 36;   // 5 degree detents
  const aimAt = (e: any) => {
    if (!e.ray.intersectPlane(FLOOR, hit)) return;
    const l = local();
    const a = Math.atan2(l.x - p.x, l.z - p.z);
    onRotate(p.id, Math.round(a / STEP) * STEP);
  };

  const limX = cfg.width / 2 - 0.35;
  const limZ = cfg.depth / 2 - 0.35;

  return (
    <group
      position={[p.x, 0, p.z]}
      rotation={[0, p.rotY, 0]}
      onPointerOver={(e) => {
        e.stopPropagation(); setHover(true);
        document.body.style.cursor = rotateMode ? 'alias' : 'grab';
      }}
      onPointerOut={() => { setHover(false); document.body.style.cursor = 'auto'; }}
      onPointerDown={(e) => {
        e.stopPropagation();
        (e.target as any).setPointerCapture?.(e.pointerId);
        e.ray.intersectPlane(FLOOR, hit);
        // Shift turns the drag into a rotation: the item swings to face the
        // cursor, which is the gesture people expect for a counter.
        mode.current = (rotateMode || e.shiftKey) ? 'rotate' : 'move';
        const l0 = local();
        off.current = { x: p.x - l0.x, z: p.z - l0.z };
        drag.current = true;
        onSelect(p.id);
        onGrab();
        document.body.style.cursor = mode.current === 'rotate' ? 'alias' : 'grabbing';
      }}
      onPointerMove={(e) => {
        if (!drag.current) return;
        e.stopPropagation();
        if (!e.ray.intersectPlane(FLOOR, hit)) return;
        if (mode.current === 'rotate') { aimAt(e); return; }
        const l = local();
        const nx = THREE.MathUtils.clamp(snap(l.x + off.current.x), -limX, limX);
        const nz = THREE.MathUtils.clamp(snap(l.z + off.current.z), -limZ, limZ);
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
        <>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.012, 0]}>
            <ringGeometry args={[0.52, 0.58, 40]} />
            <meshBasicMaterial color={selected ? '#2f81f7' : '#8aa6c8'} transparent opacity={0.85} />
          </mesh>
          {/* which way the item faces, so a rotation is readable */}
          <mesh position={[0, 0.014, 0.72]} rotation={[-Math.PI / 2, 0, 0]}>
            <coneGeometry args={[0.1, 0.22, 3]} />
            <meshBasicMaterial color={selected ? '#2f81f7' : '#8aa6c8'} transparent opacity={0.9} />
          </mesh>
        </>
      )}

      {/* Passive indicator only. An interactive ring competing with the item
          for the raycast proved unreliable, so rotation rides the same drag
          path as moving, switched by an explicit mode. */}
      {selected && (
        <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0.02, 0]} raycast={() => null}>
          <ringGeometry args={[0.64, 0.84, 48]} />
          <meshBasicMaterial color={rotateMode ? '#f2b705' : '#2f81f7'} transparent
            opacity={rotateMode ? 0.5 : 0.18} side={THREE.DoubleSide} depthWrite={false} />
        </mesh>
      )}
    </group>
  );
}

// ---------------------------------------------------------------------------
// One stall. Everything here is written in the stall's own frame -- origin at
// its floor centre, front edge at +z -- so the same component builds both
// halves of a back-to-back pair, each inside its own group transform.
// ---------------------------------------------------------------------------

function Stall({
  cfg, stall, placements, tvs, logoImg, frame,
  onMove, onRotate, rotateMode, setOrbit, selected, onSelect,
  artTex, hoverSurface, selectedSurface, onPickSurface, showSafeArea, tvMedia,
}: {
  cfg: Config; stall: StallId; placements: Placement[]; tvs: Tv[];
  logoImg: HTMLImageElement | null; frame: Frame;
  onMove: (id: string, x: number, z: number) => void;
  onRotate: (id: string, rotY: number) => void;
  rotateMode: boolean;
  setOrbit: (v: boolean) => void;
  selected: string | null; onSelect: (id: string | null) => void;
  artTex: Record<SurfaceId, THREE.Texture>;
  hoverSurface: SurfaceId | null;
  selectedSurface: SurfaceId | null;
  onPickSurface: (id: SurfaceId) => void;
  showSafeArea: boolean;
  tvMedia: Record<string, TvMedia>;
}) {
  const name = cfg.companyName || 'COMPANY NAME';

  const fasciaTexs = useMemo(() => {
    const lens = Array.from(new Set(
      fasciaEdges(cfg.openSides, cfg.mirror).map((e) => edgeLength(e, cfg.width, cfg.depth))));
    const m = new Map<number, THREE.Texture>();
    for (const l of lens) {
      m.set(l, makeFasciaTexture(name, logoImg, l,
        FASCIA_H, FASCIA_PRINT_H, cfg.fasciaColor, cfg.fasciaTextColor));
    }
    return m;
  }, [name, logoImg, cfg.width, cfg.depth, cfg.openSides, cfg.mirror,
      cfg.fasciaColor, cfg.fasciaTextColor]);
  const texFor = (len: number) => fasciaTexs.get(len)!;

  const counterTex = useMemo(
    () => makeCounterTexture(name, logoImg, cfg.fasciaTextColor),
    [name, logoImg, cfg.fasciaTextColor]);
  const kioskTex = useMemo(() => makeKioskTexture(name, '#4da3ff'), [name]);
  const stepLabels = useMemo(() => STEP_TOPICS.map(makeStepLabelTexture), []);
  const standeeTex = useMemo(
    () => ({ girl: makeStandeeTexture('girl'), boy: makeStandeeTexture('boy') }), []);
  const panelTex = useMemo(() => {
    const m = new Map<string, THREE.Texture>();
    for (const p of cfg.kit?.[stall]?.panels ?? []) {
      m.set(`${p.wall}:${p.i}`, makePanelTitle(p.title));
    }
    return m;
  }, [cfg.kit, stall]);
  const frameTex = useMemo(
    () => makeFloralFrame(PHOTO.w, PHOTO.h, PHOTO.openW, PHOTO.openH), []);
  const plinthTex = useMemo(() => makePlinthTexture(MCASE_TITLE), []);
  const modelTex = useMemo(() => ({
    tableA: makeBandTexture(MODEL_TITLES.mentorship, '#11224a', '#ffc425', 1.5, 0.13),
    tableB: makeBandTexture('SKILLING TELANGANA · AEDP', '#12463f', '#ffffff', 1.5, 0.13),
    header: makeMentorshipHeader(),
    banner: makeBandTexture(MODEL_TITLES.mentorshipSub, '#1e9e4a', '#ffffff', 1.5, 0.034),
    tiers: TIERS.map((t) => makeTierTexture(t.t, t.c)),
    stack: STACK.map(([t, c]) => makeTierTexture(t, c)),
    aedpBand: makeBandTexture(MODEL_TITLES.aedp, '#12463f', '#ffffff', 1.56, 0.03),
    cards: ['1 Curriculum revision', '2 New-age courses', '3 Faculty capacity',
      '4 Industry linkages', '5 Apprenticeship'].map((t) => makeTierTexture(t, '#ffffff', '#15306d')),
  }), []);

  const { width: W, depth: D } = cfg;

  const ctx: SurfaceCtx = {
    ns: nsOf(stall),
    tex: artTex, hover: hoverSurface, selected: selectedSurface,
    onPick: onPickSurface, safeArea: showSafeArea,
  };

  return (
    <group>
      <Carpet cfg={cfg} />
      <Walls cfg={cfg} ctx={ctx} panelTex={panelTex} />
      <Fascia cfg={cfg} texFor={texFor} ctx={ctx} />
      <Lighting cfg={cfg} />
      <TrimLight cfg={cfg} />

      {tvs.map((t) => {
        const p = wallPoint(t.wall, t.t, W, D);
        return (
          <group key={t.id}
            position={[p.x, tvCentreH(TV_SIZES[t.sizeIdx].h, PANEL_ZONE_H), p.z]}
            rotation={[0, p.rotY, 0]}>
            <group position={[0, 0, WALL_T / 2 + TV_DEPTH / 2 + 0.02]}>
              <TvUnit id={`tv:${t.id}`} sizeIdx={t.sizeIdx}
                media={tvMedia[t.id]} ctx={ctx} />
            </group>
          </group>
        );
      })}

      {placements.map((p) => (
        <Draggable
          key={p.id} p={p} cfg={cfg} frame={frame}
          onMove={onMove} onRotate={onRotate} rotateMode={rotateMode}
          onGrab={() => setOrbit(false)} onRelease={() => setOrbit(true)}
          selected={selected === p.id} onSelect={onSelect}
        >
          {p.type === 'counter' && <Counter tex={counterTex} id={`counter:${p.id}`} ctx={ctx} />}
          {p.type === 'table' && <SeatingCluster chairs={cfg.chairsPerTable} />}
          {p.type === 'cabinet' && <Cabinet />}
          {p.type === 'kiosk' && <Kiosk tex={kioskTex} id={`kiosk:${p.id}`} ctx={ctx} />}
          {p.type === 'steps' && <DisplaySteps labels={stepLabels} />}
          {p.type === 'glasscase' && <GlassCase />}
          {p.type === 'standeeGirl' && <Standee tex={standeeTex.girl} />}
          {p.type === 'standeeBoy' && <Standee tex={standeeTex.boy} />}
          {p.type === 'photobooth' && <PhotoFrame tex={frameTex} />}
          {p.type === 'bookwallU' && <BookWallU />}
          {p.type === 'mannequinGirl' && <Mannequin girl />}
          {p.type === 'mannequinBoy' && <Mannequin girl={false} />}
          {p.type === 'figureGroup' && <FigureGroup />}
          {p.type === 'modelcase' && <ModelCase caption={plinthTex} />}
          {p.type === 'modelMentorship' && (
            <group>
              <DisplayTable caption={modelTex.tableA} />
              <group position={[0, DTABLE.h, 0]}>
                <MentorshipModel header={modelTex.header} tiers={modelTex.tiers}
                  stack={modelTex.stack} banner={modelTex.banner} />
              </group>
            </group>
          )}
          {p.type === 'modelAedp' && (
            <group>
              <DisplayTable caption={modelTex.tableB} />
              <group position={[0, DTABLE.h, 0]}>
                <AedpModel band={modelTex.aedpBand} cards={modelTex.cards} />
              </group>
            </group>
          )}
          {p.type === 'bin' && <Bin />}
        </Draggable>
      ))}
    </group>
  );
}

// ---------------------------------------------------------------------------

export default function Scene({
  cfg, placements, tvs, onMove, onRotate, setOrbit, selected, onSelect, rotateMode,
  artTex, hoverSurface, selectedSurface, onPickSurface, showSafeArea, view, tvMedia,
}: {
  cfg: Config; placements: Placement[]; tvs: Tv[];
  onMove: (id: string, x: number, z: number) => void;
  onRotate: (id: string, rotY: number) => void;
  rotateMode: boolean;
  setOrbit: (v: boolean) => void;
  selected: string | null; onSelect: (id: string | null) => void;
  artTex: Record<SurfaceId, THREE.Texture>;
  hoverSurface: SurfaceId | null;
  selectedSurface: SurfaceId | null;
  onPickSurface: (id: SurfaceId) => void;
  showSafeArea: boolean;
  view: string;
  tvMedia: Record<string, TvMedia>;
}) {
  const [logoImg, setLogoImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!cfg.logo) { setLogoImg(null); return; }
    const img = new Image();
    img.onload = () => setLogoImg(img);
    img.src = cfg.logo;
  }, [cfg.logo]);

  return (
    <group>
      <GlobalLight cfg={cfg} />

      {/* Base plane. The hall lays its tiled floor just above this; without
          the hall it is the studio sweep the stall sits on. */}
      <mesh rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <planeGeometry args={[80, 80]} />
        <meshStandardMaterial color={cfg.showHall ? '#d9d3c7' : '#6e4b4b'} roughness={1} />
      </mesh>

      {cfg.showHall && <Hall cfg={cfg} view={view} />}

      {stallsOf(cfg).map((s) => {
        const pose = stallPose(cfg, s);
        return (
          <group key={s} position={[pose.x, 0, pose.z]} rotation={[0, pose.rotY, 0]}>
            <Stall
              cfg={stallCfg(cfg, s)} stall={s}
              frame={{ x: pose.x, z: pose.z, flip: pose.flip }}
              placements={placements.filter((p) => stallOf(p) === s)}
              tvs={tvs.filter((t) => stallOf(t) === s)}
              logoImg={logoImg}
              onMove={onMove} onRotate={onRotate} rotateMode={rotateMode} setOrbit={setOrbit}
              selected={selected} onSelect={onSelect}
              artTex={artTex} hoverSurface={hoverSurface} selectedSurface={selectedSurface}
              onPickSurface={onPickSurface} showSafeArea={showSafeArea} tvMedia={tvMedia}
            />
          </group>
        );
      })}
    </group>
  );
}
