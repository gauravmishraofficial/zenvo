import { useQuery } from '@tanstack/react-query';
import { Link, useParams } from 'react-router-dom';
import { api } from '../api';
import { toApiError } from '../api/client';
import DayCard from '../components/DayCard';
import DayCardSkeleton from '../components/DayCardSkeleton';
import TripHero from '../components/TripHero';
import { useAuth } from '../context/AuthContext';
import { usePageTitle } from '../hooks/usePageTitle';
import { formatMoney, formatRange } from '../lib/format';

export default function TripDetail() {
  const { id = '' } = useParams();
  const { user } = useAuth();
  const query = useQuery({ queryKey: ['trip', user?.id, id], queryFn: () => api.getTrip(id), enabled: !!user && !!id });
  usePageTitle(query.data ? `Trip to ${query.data.destination}` : 'Trip');

  if (query.isError) {
    return (
      <div role="alert" className="card mx-auto max-w-xl p-8 text-center">
        <h1 className="text-3xl font-extrabold">Trip not found</h1>
        <p className="mt-2 text-muted">{toApiError(query.error).message}</p>
        <Link to="/trips" className="btn btn-primary mt-6">
          Back to saved trips
        </Link>
      </div>
    );
  }

  const trip = query.data;
  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <Link to="/trips" className="link inline-block text-sm">
        ← All saved trips
      </Link>
      {trip ? (
        <>
          <TripHero
            destination={trip.destination}
            eyebrow="Saved trip"
            meta={`${formatRange(trip.start_date, trip.end_date)} · ${trip.travelers} traveler${trip.travelers === 1 ? '' : 's'}${
              formatMoney(trip.total_cost_estimate) ? ` · about ${formatMoney(trip.total_cost_estimate)}` : ''
            }`}
          />
          <div className="space-y-6">
            {(trip.days ?? []).map((day, i) => (
              <DayCard key={day.index} day={day} position={i} destination={trip.destination} />
            ))}
          </div>
        </>
      ) : (
        <div className="space-y-6" aria-busy="true">
          <p className="sr-only" role="status">Loading trip…</p>
          <div className="skeleton aspect-[16/10] w-full sm:aspect-[21/9]" />
          <DayCardSkeleton />
        </div>
      )}
    </div>
  );
}
