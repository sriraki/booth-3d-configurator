import type { Config, Placement, Tv, TvMedia } from './types';
import type { Artwork, SurfaceId } from './artwork';

// Minimal IndexedDB wrapper. Artwork is stored as Blobs (structured-cloneable)
// rather than data URLs, which keeps the database a fraction of the size and
// avoids base64 inflation on every save.

const DB_NAME = 'booth3d';
const STORE = 'state';
// Bumped when the saved shape changes in a way a merge cannot repair. The
// back-to-back pair re-keys every surface and every placement, so a v1
// session is left behind rather than half-restored.
const KEY = 'current-v2';
const VERSION = 1;

function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

type StoredArt = Omit<Artwork, 'src' | 'blob'> & { blob: Blob | null };
type StoredMediaItem = { name: string; blob: Blob | null };
type StoredMedia = Omit<TvMedia, 'items'> & { items: StoredMediaItem[] };

export interface Snapshot {
  cfg: Config;
  placements: Placement[];
  tvs: Tv[];
  artworks: Record<SurfaceId, StoredArt>;
  tvMedia: Record<string, StoredMedia>;
  savedAt: number;
}

export async function save(
  cfg: Config, placements: Placement[], tvs: Tv[],
  artworks: Record<SurfaceId, Artwork>,
  tvMedia: Record<string, TvMedia>,
) {
  try {
    const db = await open();
    const stored: Record<SurfaceId, StoredArt> = {};
    for (const [id, a] of Object.entries(artworks)) {
      const { src, blob, ...rest } = a;
      stored[id] = { ...rest, blob: blob ?? null };
    }
    const media: Record<string, StoredMedia> = {};
    for (const [id, m] of Object.entries(tvMedia)) {
      // A clip too large to persist has no blob; storing the shell would
      // restore a screen that can never play, so skip it entirely.
      if (!m.persisted) continue;
      media[id] = { ...m, items: m.items.map((i) => ({ name: i.name, blob: i.blob ?? null })) };
    }
    const snap: Snapshot = {
      cfg, placements, tvs, artworks: stored, tvMedia: media, savedAt: Date.now(),
    };
    await new Promise<void>((res, rej) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(snap, KEY);
      tx.oncomplete = () => res();
      tx.onerror = () => rej(tx.error);
    });
    db.close();
  } catch {
    // Private windows and blocked storage both land here. Auto-save is a
    // convenience, never a requirement -- the app must keep working without it.
  }
}

export async function load(): Promise<{
  cfg: Config; placements: Placement[]; tvs: Tv[];
  artworks: Record<SurfaceId, Artwork>;
  tvMedia: Record<string, TvMedia>;
} | null> {
  try {
    const db = await open();
    const snap = await new Promise<Snapshot | undefined>((res, rej) => {
      const tx = db.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(KEY);
      req.onsuccess = () => res(req.result);
      req.onerror = () => rej(req.error);
    });
    db.close();
    if (!snap) return null;

    const artworks: Record<SurfaceId, Artwork> = {};
    for (const [id, a] of Object.entries(snap.artworks ?? {})) {
      if (!a.blob) continue;
      artworks[id] = { ...a, blob: a.blob, src: URL.createObjectURL(a.blob) };
    }
    const tvMedia: Record<string, TvMedia> = {};
    for (const [id, m] of Object.entries(snap.tvMedia ?? {})) {
      const items = m.items
        .filter((i) => i.blob)
        .map((i) => ({ name: i.name, blob: i.blob!, src: URL.createObjectURL(i.blob!) }));
      if (items.length) tvMedia[id] = { ...m, items };
    }
    return { cfg: snap.cfg, placements: snap.placements, tvs: snap.tvs, artworks, tvMedia };
  } catch {
    return null;
  }
}

export async function clear() {
  try {
    const db = await open();
    await new Promise<void>((res) => {
      const tx = db.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(KEY);
      tx.oncomplete = () => res();
      tx.onerror = () => res();
    });
    db.close();
  } catch { /* nothing to clear */ }
}
