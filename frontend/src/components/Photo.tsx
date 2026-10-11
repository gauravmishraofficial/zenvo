import { useCallback, useState, type ReactNode } from 'react';
import { usePhoto } from '../hooks/usePhoto';
import { ImageIcon } from './icons';

function gradientFor(seed: string): string {
  let h = 7;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) % 360;
  return `linear-gradient(135deg, hsl(${h} 55% 58%), hsl(${(h + 55) % 360} 60% 34%))`;
}

interface PhotoProps {
  /** Place to look up, e.g. "Lisbon" or "Belém Tower". */
  query: string;
  /** Used when `query` has no photo (e.g. the trip destination). */
  fallback?: string;
  variant?: number;
  width?: number;
  alt: string;
  /** Tailwind aspect-ratio class: reserves the space so nothing shifts. */
  aspect?: string;
  className?: string;
  /** Rounding for the photo frame (empty string for none). */
  rounded?: string;
  /** Small attribution line under the photo (space is always reserved). */
  showAttribution?: boolean;
  children?: ReactNode;
}

export default function Photo({
  query,
  fallback,
  variant,
  width,
  alt,
  aspect = 'aspect-[4/3]',
  className = '',
  rounded = '',
  showAttribution = false,
  children,
}: PhotoProps) {
  const photo = usePhoto(query, { fallback, variant, width });
  const [loaded, setLoaded] = useState<string | null>(null);
  const [failed, setFailed] = useState<string | null>(null);

  const imgRef = useCallback(
    (img: HTMLImageElement | null) => {
      // cached images can finish loading before React attaches onLoad
      if (img && img.complete && img.naturalWidth > 0) setLoaded(photo.url);
    },
    [photo.url],
  );

  const showImg = photo.url !== null && failed !== photo.url;
  const isLoaded = photo.url !== null && loaded === photo.url;

  return (
    <figure className={className}>
      <div
        className={`relative w-full overflow-hidden ${aspect} ${rounded}`}
        style={{ backgroundImage: gradientFor(query || fallback || 'voyage') }}
      >
        <div className="absolute inset-0 flex items-center justify-center text-white/60" aria-hidden="true">
          <ImageIcon width={32} height={32} />
        </div>
        {showImg && (
          <img
            key={photo.url}
            ref={imgRef}
            src={photo.url ?? undefined}
            alt={alt}
            loading="lazy"
            decoding="async"
            onLoad={() => setLoaded(photo.url)}
            onError={() => setFailed(photo.url)}
            className={`absolute inset-0 h-full w-full object-cover transition-opacity duration-700 ${
              isLoaded ? 'opacity-100' : 'opacity-0'
            }`}
          />
        )}
        {children}
      </div>
      {showAttribution && (
        <figcaption className="mt-1.5 min-h-[1rem] truncate font-mono text-[11px] leading-4 text-muted">
          {photo.status === 'ready' ? photo.attribution : ''}
        </figcaption>
      )}
    </figure>
  );
}
