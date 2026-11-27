import { TV_SIZES, SIZES, PANEL_PRINT_H } from './constants';
import { wallsFor, wallLength, defaultCounts } from './booth';
import type { Config, Placement, Tv, WallId } from './types';
import type { Specs } from './booth';
import {
  surfaceLabel, surfacePrint, effectiveDpi, resolutionVerdict,
  TARGET_DPI, type Artwork, type FitMode, type SurfaceId,
} from './artwork';

const f1 = (n: number) => n.toFixed(1);
const f0 = (n: number) => Math.round(n).toString();

function Row({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className={`row${strong ? ' strong' : ''}`}>
      <span>{label}</span><span>{value}</span>
    </div>
  );
}

export function Controls({
  cfg, set, tvs, setTvs, placements, setPlacements, onReset, view, setView,
  artworks, selectedSurface, onPickSurface, updateArt, clearArt,
  showSafeArea, setShowSafeArea, assign,
}: {
  cfg: Config; set: (p: Partial<Config>) => void;
  tvs: Tv[]; setTvs: (t: Tv[]) => void;
  placements: Placement[]; setPlacements: (p: Placement[]) => void;
  onReset: () => void;
  view: string; setView: (v: string) => void;
  artworks: Record<SurfaceId, Artwork>;
  selectedSurface: SurfaceId | null;
  onPickSurface: (id: SurfaceId | null) => void;
  updateArt: (id: SurfaceId, patch: Partial<Artwork>) => void;
  clearArt: (id: SurfaceId) => void;
  showSafeArea: boolean; setShowSafeArea: (v: boolean) => void;
  assign: (id: SurfaceId, f: File) => void;
}) {
  const walls = wallsFor(cfg.openSides, cfg.mirror);
  const kiosks = placements.filter((p) => p.type === 'kiosk');

  const addTv = () => {
    const wall: WallId = walls[0];
    setTvs([...tvs, { id: `tv-${Date.now()}`, wall, t: wallLength(wall, cfg.width, cfg.depth) / 2, sizeIdx: 3 }]);
  };
  const upTv = (id: string, patch: Partial<Tv>) =>
    setTvs(tvs.map((t) => (t.id === id ? { ...t, ...patch } : t)));

  const addKiosk = () => setPlacements([...placements, {
    id: `kiosk-${Date.now()}`, type: 'kiosk',
    x: (cfg.mirror ? -1 : 1) * (cfg.width / 2 - 0.45), z: cfg.depth / 2 - 0.7,
    rotY: (cfg.mirror ? -1 : 1) * 0.6,
  }]);

  const onLogo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const r = new FileReader();
    r.onload = () => set({ logo: r.result as string });
    r.readAsDataURL(file);
  };

  return (
    <aside className="panel left">
      <h1>Booth 3D<span>Shell-scheme configurator</span></h1>

      <section>
        <h2>Footprint</h2>
        <div className="grid2">
          <label>Width (frontage)
            <select value={cfg.width} onChange={(e) => set({ width: +e.target.value as any })}>
              {SIZES.map((s) => <option key={s} value={s}>{s} m</option>)}
            </select>
          </label>
          <label>Depth
            <select value={cfg.depth} onChange={(e) => set({ depth: +e.target.value as any })}>
              {SIZES.map((s) => <option key={s} value={s}>{s} m</option>)}
            </select>
          </label>
        </div>
        <div className="note">{cfg.width} × {cfg.depth} m — {cfg.width * cfg.depth} sqm</div>
      </section>

      <section>
        <h2>Open sides</h2>
        <div className="seg">
          {([1, 2, 3] as const).map((n) => (
            <button key={n} className={cfg.openSides === n ? 'on' : ''}
              onClick={() => set({ openSides: n })}>
              {n} side{n > 1 ? 's' : ''}
            </button>
          ))}
        </div>
        <div className="note">
          {cfg.openSides === 1 && 'Inline — back and both sides walled'}
          {cfg.openSides === 2 && 'Corner — back and one side walled'}
          {cfg.openSides === 3 && 'Peninsula — back wall only'}
        </div>
        {cfg.openSides === 2 && (
          <button className="ghost full" onClick={() => set({ mirror: !cfg.mirror })}>
            Flip open side → {cfg.mirror ? 'opens left' : 'opens right'}
          </button>
        )}
      </section>

      <section>
        <h2>Branding</h2>
        <label>Company name
          <input value={cfg.companyName} maxLength={40}
            onChange={(e) => set({ companyName: e.target.value })} />
        </label>
        <label className="file">Logo (optional)
          <input type="file" accept="image/*" onChange={onLogo} />
        </label>
        {cfg.logo && <button className="ghost full" onClick={() => set({ logo: null })}>Remove logo</button>}
        <div className="grid3">
          <label>Fascia<input type="color" value={cfg.fasciaColor}
            onChange={(e) => set({ fasciaColor: e.target.value })} /></label>
          <label>Text<input type="color" value={cfg.fasciaTextColor}
            onChange={(e) => set({ fasciaTextColor: e.target.value })} /></label>
          <label>Carpet<input type="color" value={cfg.carpet}
            onChange={(e) => set({ carpet: e.target.value })} /></label>
        </div>
      </section>

      <section>
        <h2>Screens <button className="mini" onClick={addTv}>+ Add TV</button></h2>
        {tvs.length === 0 && <div className="note">No TVs placed.</div>}
        {tvs.map((t) => {
          const len = wallLength(t.wall, cfg.width, cfg.depth);
          return (
            <div className="item" key={t.id}>
              <div className="grid2">
                <select value={t.wall} onChange={(e) => upTv(t.id, {
                  wall: e.target.value as WallId,
                  t: Math.min(t.t, wallLength(e.target.value as WallId, cfg.width, cfg.depth) / 2),
                })}>
                  {walls.map((w) => <option key={w} value={w}>{w} wall</option>)}
                </select>
                <select value={t.sizeIdx} onChange={(e) => upTv(t.id, { sizeIdx: +e.target.value })}>
                  {TV_SIZES.map((s, i) => <option key={s.label} value={i}>{s.label}</option>)}
                </select>
              </div>
              <input type="range" min={0.4} max={Math.max(0.4, len - 0.4)} step={0.05}
                value={t.t} onChange={(e) => upTv(t.id, { t: +e.target.value })} />
              <div className="itemfoot">
                <span>spans {Math.ceil(TV_SIZES[t.sizeIdx].w / 1.0)} panel
                  {Math.ceil(TV_SIZES[t.sizeIdx].w / 1.0) > 1 ? 's' : ''}</span>
                <button className="mini danger" onClick={() => setTvs(tvs.filter((x) => x.id !== t.id))}>Remove</button>
              </div>
            </div>
          );
        })}
      </section>

      <section>
        <h2>Kiosks <button className="mini" onClick={addKiosk}>+ Add kiosk</button></h2>
        <div className="note">
          {kiosks.length} placed. Drag them on the floor to reposition.
        </div>
        {kiosks.length > 0 && (
          <button className="ghost full" onClick={() =>
            setPlacements(placements.filter((p) => p.id !== kiosks[kiosks.length - 1].id))}>
            Remove last kiosk
          </button>
        )}
      </section>

      <section>
        <h2>
          Artwork
          <label className="check tight">
            <input type="checkbox" checked={showSafeArea}
              onChange={(e) => setShowSafeArea(e.target.checked)} />
            safe area
          </label>
        </h2>

        {!selectedSurface && (
          <div className="note">
            Drag a PNG or JPG onto any panel, fascia, counter or kiosk in the 3D view.
            Click a surface to adjust what is already on it.
          </div>
        )}

        {selectedSurface && (() => {
          const art = artworks[selectedSurface];
          const spec = surfacePrint(selectedSurface, cfg);
          if (!art) {
            return (
              <div className="item">
                <div className="selhead">{surfaceLabel(selectedSurface)}</div>
                {spec && <div className="tiny">
                  Printable {Math.round(spec.w)} × {Math.round(spec.h)} mm
                </div>}
                <label className="file">Choose an image
                  <input type="file" accept="image/*" onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) assign(selectedSurface, f);
                  }} />
                </label>
                <button className="ghost full" onClick={() => onPickSurface(null)}>Deselect</button>
              </div>
            );
          }
          const dpi = spec ? effectiveDpi(art, spec) : 0;
          const verdict = resolutionVerdict(dpi);
          return (
            <div className="item">
              <div className="selhead">{surfaceLabel(selectedSurface)}</div>
              <div className="artrow">
                <img className="thumb" src={art.src} alt="" />
                <div className="artmeta">
                  <div className="fname" title={art.name}>{art.name}</div>
                  <div className="tiny">{art.imgW} × {art.imgH} px</div>
                  {spec && (
                    <div className={`dpi ${verdict}`}>
                      {Math.round(dpi)} dpi at {Math.round(spec.w)} × {Math.round(spec.h)} mm
                    </div>
                  )}
                </div>
              </div>

              {verdict === 'bad' && <div className="warn tightwarn">
                Below 72 dpi — this will look visibly soft at full size.
                Ask the client for artwork at least {spec
                  ? Math.ceil((spec.w / 25.4) * TARGET_DPI) : 0} px wide.
              </div>}
              {verdict === 'soft' && <div className="warn tightwarn">
                Under {TARGET_DPI} dpi — acceptable viewed from 2 m+, not for close-up detail.
              </div>}

              <div className="seg tight">
                {(['cover', 'contain', 'stretch'] as FitMode[]).map((f) => (
                  <button key={f} className={art.fit === f ? 'on' : ''}
                    onClick={() => updateArt(selectedSurface, { fit: f })}>{f}</button>
                ))}
              </div>

              <label>Scale <b>{art.scale.toFixed(2)}×</b>
                <input type="range" min={0.5} max={2.5} step={0.01} value={art.scale}
                  onChange={(e) => updateArt(selectedSurface, { scale: +e.target.value })} />
              </label>
              <label>Nudge across
                <input type="range" min={-1} max={1} step={0.02} value={art.offsetX}
                  onChange={(e) => updateArt(selectedSurface, { offsetX: +e.target.value })} />
              </label>
              <label>Nudge up / down
                <input type="range" min={-1} max={1} step={0.02} value={art.offsetY}
                  onChange={(e) => updateArt(selectedSurface, { offsetY: +e.target.value })} />
              </label>
              {art.fit === 'contain' && (
                <label>Letterbox colour
                  <input type="color" value={art.bg}
                    onChange={(e) => updateArt(selectedSurface, { bg: e.target.value })} />
                </label>
              )}

              <div className="itemfoot">
                <button className="mini" onClick={() => updateArt(selectedSurface, {
                  rotation: ((art.rotation + 90) % 360) as 0 | 90 | 180 | 270,
                })}>Rotate 90°</button>
                <button className="mini" onClick={() => updateArt(selectedSurface, {
                  scale: 1, offsetX: 0, offsetY: 0, rotation: 0,
                })}>Reset fit</button>
                <button className="mini danger"
                  onClick={() => { clearArt(selectedSurface); onPickSurface(null); }}>Clear</button>
              </div>
            </div>
          );
        })()}

        {Object.keys(artworks).length > 0 && (
          <>
            <div className="note">{Object.keys(artworks).length} surface(s) with artwork</div>
            <div className="chips">
              {Object.keys(artworks).map((id) => (
                <button key={id}
                  className={`chip${selectedSurface === id ? ' on' : ''}`}
                  onClick={() => onPickSurface(id)}>{surfaceLabel(id)}</button>
              ))}
            </div>
          </>
        )}
      </section>

      <section>
        <h2>Seating &amp; light</h2>
        <label>Chairs per table: <b>{cfg.chairsPerTable}</b>
          <input type="range" min={2} max={8} step={1} value={cfg.chairsPerTable}
            onChange={(e) => set({ chairsPerTable: +e.target.value })} />
        </label>
        <label>Hall ambient: <b>{Math.round(cfg.ambient * 100)}%</b>
          <input type="range" min={0.1} max={1.4} step={0.05} value={cfg.ambient}
            onChange={(e) => set({ ambient: +e.target.value })} />
        </label>
        <label className="check">
          <input type="checkbox" checked={cfg.showSpotBeams}
            onChange={(e) => set({ showSpotBeams: e.target.checked })} />
          Show spotlight beams
        </label>
      </section>

      <section>
        <h2>View</h2>
        <div className="seg">
          {['hero', 'front', 'eye', 'top'].map((v) => (
            <button key={v} className={view === v ? 'on' : ''} onClick={() => setView(v)}>{v}</button>
          ))}
        </div>
        <button className="ghost full" onClick={onReset}>Reset layout</button>
      </section>
    </aside>
  );
}

export function SpecPanel({ cfg, specs, onPng, onTxt }: {
  cfg: Config; specs: Specs; onPng: () => void; onTxt: () => void;
}) {
  const c = defaultCounts(specs.area);
  return (
    <aside className="panel right">
      <h2 className="top">Specification</h2>

      <div className="block">
        <Row label="Footprint" value={`${cfg.width} × ${cfg.depth} m`} strong />
        <Row label="Area" value={`${specs.area} sqm · ${f0(specs.areaFt)} sq ft`} />
        <Row label="Open sides" value={`${cfg.openSides}${cfg.openSides === 2 ? cfg.mirror ? ' (left)' : ' (right)' : ''}`} />
        <Row label="Height" value="2500 mm (2200 + 300 fascia)" />
      </div>

      <h3>Structure</h3>
      <div className="block">
        <Row label="Wall panels" value={`${specs.panelCount} × 960 mm`} strong />
        <Row label="Fascia run" value={`${f1(specs.fasciaLen)} m`} strong />
        <Row label="Uprights" value={`${specs.panelCount + 3} approx.`} />
      </div>

      <h3>Print area</h3>
      <div className="block">
        <Row label="Fascia @ 2970 × 260" value={`${f1(specs.fasciaPrintSqft)} sq ft`} />
        <Row label="Panels (gross)" value={`${f1(specs.panelPrintGrossSqm * 10.7639)} sq ft`} />
        {specs.panelsConsumedByTv > 0 &&
          <Row label={`Less ${specs.panelsConsumedByTv} panel(s) behind TVs`}
            value={`−${f1(specs.panelsConsumedByTv * 0.96 * PANEL_PRINT_H * 10.7639)} sq ft`} />}
        <Row label="Total artwork" value={`${f1(specs.totalPrintSqft)} sq ft`} strong />
        <div className="tiny">Panel print height assumed 2180 mm — confirm with your fabricator.</div>
      </div>

      <h3>Bill of quantities</h3>
      <div className="block">
        <Row label="Reception counter" value={`${specs.counters}`} />
        <Row label="Round tables" value={`${specs.tables}`} />
        <Row label="Chairs" value={`${specs.chairs}`} />
        <Row label="Lockable cabinet" value={`${specs.cabinets}`} />
        <Row label="Touchscreen kiosk" value={`${specs.kiosks}`} />
        <Row label="TV screens" value={`${specs.tvs}`} />
        <Row label="Spotlights" value={`${specs.spotlights}`} />
        <Row label="Dustbin" value={`${specs.bins}`} />
        <Row label="Power points (5A)" value={`${specs.sockets}`} strong />
        <Row label="Carpet" value={`${specs.area} sqm`} />
      </div>

      <h3>Floor usage</h3>
      <div className="block">
        <div className="bar"><div className="fill" style={{
          width: `${Math.min(100, specs.density * 100)}%`,
          background: specs.density > 0.5 ? '#e0603a' : '#3f9e6a',
        }} /></div>
        <Row label="Committed" value={`${f1(specs.floorUsed)} of ${specs.area} sqm (${Math.round(specs.density * 100)}%)`} />
      </div>

      {specs.warnings.length > 0 && (
        <>
          <h3>Checks</h3>
          {specs.warnings.map((w, i) => <div className="warn" key={i}>{w}</div>)}
        </>
      )}

      <div className="actions">
        <button onClick={onPng}>Save PNG</button>
        <button className="ghost" onClick={onTxt}>Export spec</button>
      </div>
    </aside>
  );
}
