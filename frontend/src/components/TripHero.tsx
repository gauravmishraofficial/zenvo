import Photo from './Photo';

interface TripHeroProps {
  destination: string;
  eyebrow: string;
  meta: string;
}

/** Big destination photo with title overlay. Attribution sits (small) right under the photo. */
export default function TripHero({ destination, eyebrow, meta }: TripHeroProps) {
  return (
    <div className="card overflow-hidden !p-0">
      <Photo
        query={destination}
        width={1280}
        alt={`${destination}`}
        aspect="aspect-[16/10] sm:aspect-[21/9]"
        className="[&>div]:border-b-2 [&>div]:border-line [&>figcaption]:px-4 [&>figcaption]:pb-1.5"
        showAttribution
      >
        <div className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/75 via-black/20 to-transparent p-5 text-white sm:p-8">
          <p className="font-mono text-xs font-bold uppercase tracking-[0.2em] text-white/80">{eyebrow}</p>
          <h1 className="mt-1 text-4xl font-extrabold leading-none sm:text-6xl">{destination}</h1>
          <p className="mt-2 text-sm text-white/85">{meta}</p>
        </div>
      </Photo>
    </div>
  );
}
