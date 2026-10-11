import { useEffect, useState } from 'react';
import { api, USE_MOCK } from '../api';
import type { PhotoResult } from '../types/trip';

/**
 * usePhoto(query): resolves a good photo for a destination / place.
 *  - mock mode: Wikipedia REST summary (en.wikipedia.org/api/rest_v1/page/summary/<title>)
 *  - real mode: GET /api/v1/destinations/photo?name=<query> via src/api/client.ts
 * Results (including "no photo") are cached in memory and in sessionStorage, and concurrent
 * requests for the same key share one network call.
 */

export interface UsePhotoOptions {
  /** Used when `query` has no photo (e.g. the trip's destination for a day card). */
  fallback?: string;
  /** With a fallback: 0 = lead image, n>0 = nth alternate image (mock mode only). */
  variant?: number;
  /** Preferred width in px (mock mode only). */
  width?: number;
}

export interface PhotoState {
  url: string | null;
  attribution: string | null;
  status: 'loading' | 'ready' | 'missing';
}

const LOADING: PhotoState = { url: null, attribution: null, status: 'loading' };
const MISSING: PhotoState = { url: null, attribution: null, status: 'missing' };

const memory = new Map<string, PhotoResult | null>();
const inflight = new Map<string, Promise<PhotoResult | null>>();
const SS_PREFIX = 'zenvo.photo.v1.';
const SOURCE = USE_MOCK ? 'wiki' : 'api';

const keyOf = (name: string, variant: number, width: number) =>
  `${SOURCE}|${name.trim().toLowerCase()}|${variant}|${width}`;

/** undefined = never looked up, null = looked up and none exists. */
function peek(key: string): PhotoResult | null | undefined {
  if (memory.has(key)) return memory.get(key);
  try {
    const raw = sessionStorage.getItem(SS_PREFIX + key);
    if (raw !== null) {
      const value = JSON.parse(raw) as PhotoResult | null;
      memory.set(key, value);
      return value;
    }
  } catch {
    /* storage unavailable or corrupt: fall through */
  }
  return undefined;
}

function remember(key: string, value: PhotoResult | null): void {
  memory.set(key, value);
  try {
    sessionStorage.setItem(SS_PREFIX + key, JSON.stringify(value));
  } catch {
    /* quota or private mode */
  }
}

function load(name: string, variant: number, width: number): Promise<PhotoResult | null> {
  const key = keyOf(name, variant, width);
  const cached = peek(key);
  if (cached !== undefined) return Promise.resolve(cached);
  let p = inflight.get(key);
  if (!p) {
    p = api
      .getDestinationPhoto(name, { variant, width })
      .then((r) => {
        remember(key, r);
        return r;
      })
      // Network/server errors are not cached, so a later mount can try again.
      .catch(() => null)
      .finally(() => inflight.delete(key));
    inflight.set(key, p);
  }
  return p;
}

const ready = (r: PhotoResult): PhotoState => ({ url: r.url, attribution: r.attribution ?? null, status: 'ready' });

/** Synchronous best-effort answer from caches, or null if we still need the network. */
function fromCache(q: string, fb: string, variant: number, width: number): PhotoState | null {
  if (q) {
    const primary = peek(keyOf(q, 0, width));
    if (primary === undefined) return null;
    if (primary) return ready(primary);
  }
  if (!fb) return MISSING;
  const second = peek(keyOf(fb, variant, width));
  if (second === undefined) return null;
  return second ? ready(second) : MISSING;
}

async function resolve(q: string, fb: string, variant: number, width: number): Promise<PhotoState> {
  if (q) {
    const r = await load(q, 0, width);
    if (r) return ready(r);
  }
  if (fb) {
    const r = await load(fb, variant, width);
    if (r) return ready(r);
  }
  return MISSING;
}

export function usePhoto(query: string, options: UsePhotoOptions = {}): PhotoState {
  const q = query.trim();
  const fb = (options.fallback ?? '').trim();
  const variant = options.variant ?? 0;
  const width = options.width ?? 960;
  const key = `${q}|${fb}|${variant}|${width}`;

  const [state, setState] = useState<{ key: string; photo: PhotoState }>(() => ({
    key,
    photo: fromCache(q, fb, variant, width) ?? LOADING,
  }));

  useEffect(() => {
    let cancelled = false;
    const cached = fromCache(q, fb, variant, width);
    if (cached) {
      setState({ key, photo: cached });
      return;
    }
    setState({ key, photo: LOADING });
    resolve(q, fb, variant, width).then((photo) => {
      if (!cancelled) setState({ key, photo });
    });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return state.key === key ? state.photo : (fromCache(q, fb, variant, width) ?? LOADING);
}
