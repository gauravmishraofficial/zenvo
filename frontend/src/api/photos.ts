import type { PhotoOptions, PhotoResult } from '../types/trip';
import { ApiError, apiFetch } from './client';

/**
 * GET /destinations/photo?name=Lisbon[&width=800] -> { url, attribution }. Resolves null if there is no photo.
 * `width` is an optional sized-thumbnail hint (assumed param): a backend that ignores it just returns its usual URL.
 */
export async function getDestinationPhoto(name: string, options: PhotoOptions = {}): Promise<PhotoResult | null> {
  const qs = new URLSearchParams({ name });
  if (options.width) qs.set('width', String(options.width));
  try {
    const res = await apiFetch<PhotoResult>(`/destinations/photo?${qs.toString()}`, { auth: false });
    return res?.url ? res : null;
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) return null;
    throw e;
  }
}
