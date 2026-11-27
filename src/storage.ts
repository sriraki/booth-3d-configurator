import type { Config, Placement, Tv } from './types';
import type { Artwork, SurfaceId } from './artwork';

// Minimal IndexedDB wrapper. Artwork is stored as Blobs (structured-cloneable)
// rather than data URLs, which keeps the database a fraction of the size and
// avoids base64 inflation on every save.

const DB_NAME = 'booth3d';
const STORE = 'state';
const KEY = 'current';
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

export interface Snapshot {
  cfg: Config;
  placements: Placement[];
  tvs: Tv[];
  artworks: Record<SurfaceId, StoredArt>;
  savedAt: number;
}

export async function save(
  cfg: Config, placements: Placement[], tvs: Tv[],
  artworks: Record<SurfaceId, Artwork>,
) {
  try {
    const db = await open();
    const stored: Record<SurfaceId, StoredArt> = {};
    for (const [id, a] of Object.entries(artworks)) {
      const { src, blob, ...rest } = a;
      stored[id] = { ...rest, blob: blob ?? null };
    }
    const snap: Snapshot = { cfg, placements, tvs, artworks: stored, savedAt: Date.now() };
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

export async function load(): Promise<
  { cfg: Config; placements: Placement[]; tvs: Tv[]; artworks: Record<SurfaceId, Artwork> } | null
> {
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
    return { cfg: snap.cfg, placements: snap.placements, tvs: snap.tvs, artworks };
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
