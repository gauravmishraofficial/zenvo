import type { ItineraryDay } from '../types/trip';
import { formatDate, formatMoney, pad2, sumCosts } from '../lib/format';
import { PinIcon } from './icons';
import Photo from './Photo';

interface DayCardProps {
  day: ItineraryDay;
  /** 0-based position in the list (used for the "Day 01" label and photo variety). */
  position: number;
  destination: string;
}

export default function DayCard({ day, position, destination }: DayCardProps) {
  const location = day.items.find((i) => i.location)?.location ?? '';
  const dayTotal = sumCosts(day.items.map((i) => i.cost_estimate));
  const titleId = `day-title-${position}`;

  return (
    <article className="card overflow-hidden md:flex" aria-labelledby={titleId}>
      <div className="border-b-2 border-line bg-paper md:w-[22rem] md:shrink-0 md:border-b-0 md:border-r-2">
        <Photo
          query={location}
          fallback={destination}
          variant={position + 1}
          width={960}
          alt={`${location || destination}, day ${position + 1}`}
          aspect="aspect-[16/9] md:aspect-[4/3]"
        >
          <span className="absolute left-3 top-3 rounded-md border-2 border-line bg-card px-2.5 py-1 font-mono text-xs font-bold uppercase tracking-widest text-ink shadow-stamp-sm">
            Day {pad2(position + 1)}
          </span>
        </Photo>
      </div>

      <div className="min-w-0 flex-1 p-5 sm:p-6">
        <p className="eyebrow">{formatDate(day.date, true)}</p>
        <h3 id={titleId} className="mt-1 text-2xl font-bold leading-tight sm:text-[1.7rem]">
          {day.title}
        </h3>

        <ol className="mt-5 space-y-5 border-l-2 border-dashed border-line/70 pl-5">
          {day.items.map((item, i) => (
            <li key={`${item.time}-${i}`} className="relative">
              <span
                className="absolute -left-[1.72rem] top-1.5 h-3 w-3 rounded-full border-2 border-line bg-accent"
                aria-hidden="true"
              />
              <p className="font-mono text-xs font-bold uppercase tracking-widest text-sea">{item.time}</p>
              <p className="mt-0.5 font-bold">{item.title}</p>
              {item.description && <p className="mt-1 text-[0.95rem] leading-relaxed text-muted">{item.description}</p>}
              <p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
                {item.location && (
                  <span className="inline-flex items-center gap-1">
                    <PinIcon width={14} height={14} />
                    {item.location}
                  </span>
                )}
                {formatMoney(item.cost_estimate) && (
                  <span className="font-mono font-bold text-ink">{formatMoney(item.cost_estimate)}</span>
                )}
              </p>
            </li>
          ))}
        </ol>

        {dayTotal > 0 && (
          <p className="mt-5 border-t-2 border-dashed border-line/50 pt-3 font-mono text-xs uppercase tracking-widest text-muted">
            Day estimate <span className="ml-1 font-bold text-ink">{formatMoney(dayTotal)}</span>
          </p>
        )}
      </div>
    </article>
  );
}
