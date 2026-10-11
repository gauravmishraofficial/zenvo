/**
 * Direct Wikipedia/Wikimedia REST lookup. Used as the photo implementation in MOCK mode
 * (the real backend exposes GET /destinations/photo instead). No API key needed.
 */
import type { PhotoOptions, PhotoResult } from '../types/trip';

const WIKI = 'https://en.wikipedia.org/api/rest_v1';

interface WikiImage {
  source: string;
  width: number;
  height: number;
}

interface WikiSummary {
  type?: string;
  thumbnail?: WikiImage;
  originalimage?: WikiImage;
}

interface WikiMediaList {
  items?: Array<{
    title?: string;
    type?: string;
    showInGallery?: boolean;
    srcset?: Array<{ src: string; scale?: string }>;
  }>;
}

async function getJSON<T>(url: string): Promise<T | null> {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Wikipedia request failed (${res.status})`);
  return (await res.json()) as T;
}

const slug = (title: string) => encodeURIComponent(title.trim().replace(/\s+/g, '_'));

/** Pick a URL near `width`, never asking Wikimedia for a thumbnail larger than the original. */
function sizedUrl(s: WikiSummary, width: number): string {
  const { thumbnail, originalimage } = s;
  if (originalimage && originalimage.width <= width) return originalimage.source;
  if (originalimage && thumbnail && /\/\d+px-[^/]+$/.test(thumbnail.source)) {
    return thumbnail.source.replace(/\/\d+px-([^/]+)$/, `/${width}px-$1`);
  }
  return thumbnail?.source ?? originalimage?.source ?? '';
}

async function leadPhoto(title: string, width: number): Promise<PhotoResult | null> {
  const s = await getJSON<WikiSummary>(`${WIKI}/page/summary/${slug(title)}`);
  if (!s || s.type === 'disambiguation' || (!s.thumbnail && !s.originalimage)) return null;
  const url = sizedUrl(s, width);
  return url ? { url, attribution: 'Photo: Wikipedia / Wikimedia Commons' } : null;
}

const galleries = new Map<string, Promise<string[]>>();

/** Extra photos from the article, so different days of one trip can show different pictures. */
function gallery(title: string): Promise<string[]> {
  let p = galleries.get(title);
  if (!p) {
    p = getJSON<WikiMediaList>(`${WIKI}/page/media-list/${slug(title)}`)
      .then((list) => {
        const urls: string[] = [];
        for (const item of list?.items ?? []) {
          const name = item.title ?? '';
          if (item.type !== 'image' || item.showInGallery === false) continue;
          if (!/\.jpe?g$/i.test(name) || /flag|coat[ _]of|map|locator|logo|seal|icon|panoram/i.test(name)) continue;
          const src = item.srcset?.[item.srcset.length - 1]?.src;
          if (src) urls.push(src.startsWith('//') ? `https:${src}` : src);
        }
        // the first gallery image is usually the lead image we already show
        return urls.length > 3 ? urls.slice(1) : urls;
      })
      .catch(() => []);
    galleries.set(title, p);
  }
  return p;
}

export async function getWikipediaPhoto(name: string, options: PhotoOptions = {}): Promise<PhotoResult | null> {
  const width = options.width ?? 960;
  const variant = options.variant ?? 0;
  const full = name.trim();
  const first = full.split(',')[0].trim();
  const candidates = first && first !== full ? [full, first] : [full];

  for (const title of candidates) {
    if (!title) continue;
    const lead = await leadPhoto(title, width);
    if (!lead) continue;
    if (variant > 0) {
      const extra = await gallery(title);
      if (extra.length > 0) {
        return { url: extra[(variant - 1) % extra.length], attribution: 'Photo: Wikipedia / Wikimedia Commons' };
      }
    }
    return lead;
  }
  return null;
}
