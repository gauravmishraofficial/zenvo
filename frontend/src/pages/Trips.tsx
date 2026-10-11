import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { toApiError } from '../api/client';
import Photo from '../components/Photo';
import { ArrowRightIcon } from '../components/icons';
import { useAuth } from '../context/AuthContext';
import { usePageTitle } from '../hooks/usePageTitle';
import { formatMoney, formatRange, tripLength } from '../lib/format';

function TripCardSkeleton() {
  return (
    <div className="card overflow-hidden" aria-hidden="true">
      <div className="skeleton aspect-[4/3] w-full !rounded-none" />
      <div className="space-y-3 p-4">
        <div className="skeleton h-3 w-24" />
        <div className="skeleton h-6 w-2/3" />
        <div className="skeleton h-3 w-1/2" />
      </div>
    </div>
  );
}

export default function Trips() {
  usePageTitle('Saved trips');
  const { user } = useAuth();
  const query = useQuery({
    queryKey: ['trips', user?.id],
    queryFn: () => api.listTrips(),
    enabled: !!user,
  });

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="eyebrow">Your collection</p>
          <h1 className="mt-1 text-4xl font-extrabold sm:text-5xl">Saved trips</h1>
        </div>
        <Link to="/plan" className="btn btn-primary">
          New trip <ArrowRightIcon width={18} height={18} />
        </Link>
      </div>

      <div className="mt-8" aria-live="polite" aria-busy={query.isLoading}>
        {query.isLoading && (
          <>
            <p className="sr-only">Loading your trips…</p>
            <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {[0, 1, 2].map((i) => (
                <TripCardSkeleton key={i} />
              ))}
            </div>
          </>
        )}

        {query.isError && (
          <div role="alert" className="card border-accent p-6">
            <p className="text-lg font-bold">We could not load your trips.</p>
            <p className="mt-1 text-muted">{toApiError(query.error).message}</p>
            <button type="button" className="btn btn-primary mt-4" onClick={() => query.refetch()}>
              Try again
            </button>
          </div>
        )}

        {query.isSuccess && query.data.length === 0 && (
          <div className="card mx-auto max-w-xl p-8 text-center sm:p-12">
            <span className="stamp">No trips yet</span>
            <h2 className="mt-5 text-3xl font-extrabold">Your passport is empty.</h2>
            <p className="mt-2 text-muted">Plan your first trip and it will show up here, ready whenever you are.</p>
            <Link to="/plan" className="btn btn-primary mt-6">
              Plan a trip
            </Link>
          </div>
        )}

        {query.isSuccess && query.data.length > 0 && (
          <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {query.data.map((t) => {
              const n = t.days?.length || tripLength(t.start_date, t.end_date);
              return (
                <li key={t.id}>
                  <Link
                    to={`/trips/${encodeURIComponent(t.id)}`}
                    className="card block overflow-hidden transition duration-200 hover:-translate-y-1 hover:shadow-stamp-lg"
                  >
                    <Photo
                      query={t.destination}
                      width={960}
                      alt={t.destination}
                      aspect="aspect-[4/3]"
                      className="[&>div]:border-b-2 [&>div]:border-line"
                    />
                    <div className="p-4">
                      <p className="eyebrow">
                        {n} day{n === 1 ? '' : 's'} · {t.travelers} traveler{t.travelers === 1 ? '' : 's'}
                      </p>
                      <h2 className="mt-0.5 font-display text-2xl font-extrabold leading-tight">{t.destination}</h2>
                      <p className="mt-1 text-sm text-muted">{formatRange(t.start_date, t.end_date)}</p>
                      {formatMoney(t.total_cost_estimate) && (
                        <p className="mt-2 font-mono text-sm font-bold">{formatMoney(t.total_cost_estimate)}</p>
                      )}
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
