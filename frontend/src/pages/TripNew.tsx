import { useEffect, useMemo, useReducer, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { api } from '../api';
import { isAbortError, toApiError } from '../api/client';
import DayCard from '../components/DayCard';
import DayCardSkeleton from '../components/DayCardSkeleton';
import TripHero from '../components/TripHero';
import { useAuth } from '../context/AuthContext';
import { usePageTitle } from '../hooks/usePageTitle';
import { formatMoney, formatRange, tripLength } from '../lib/format';
import { loadPendingRequest } from '../lib/pending';
import type { CostEstimate, GenerateEvent, ItineraryDay } from '../types/trip';

interface State {
  phase: 'streaming' | 'done' | 'error';
  status: string;
  days: ItineraryDay[];
  tripId: string | null;
  total: CostEstimate;
  error: { code: string; message: string } | null;
}

type Action = GenerateEvent | { type: 'reset' } | { type: 'fail'; code: string; message: string };

const initial: State = { phase: 'streaming', status: 'Connecting…', days: [], tripId: null, total: null, error: null };

function reducer(state: State, a: Action): State {
  switch (a.type) {
    case 'reset':
      return initial;
    case 'status':
      return { ...state, status: a.message };
    case 'day': {
      const days = [...state.days.filter((d) => d.index !== a.day.index), a.day].sort((x, y) => x.index - y.index);
      return { ...state, days };
    }
    case 'done':
      return { ...state, phase: 'done', tripId: a.trip_id, total: a.total_cost_estimate };
    case 'fail':
      return { ...state, phase: 'error', error: { code: a.code, message: a.message } };
  }
}

export default function TripNew() {
  const request = useMemo(() => loadPendingRequest(), []);
  const { user } = useAuth();
  const [state, dispatch] = useReducer(reducer, initial);
  const [attempt, setAttempt] = useState(0);
  usePageTitle(request ? `Your trip to ${request.destination}` : 'Your trip');

  useEffect(() => {
    if (!request) return;
    const ctrl = new AbortController();
    dispatch({ type: 'reset' });
    (async () => {
      try {
        for await (const ev of api.generateTrip(request, ctrl.signal)) {
          if (ctrl.signal.aborted) return;
          dispatch(ev);
        }
      } catch (e) {
        if (ctrl.signal.aborted || isAbortError(e)) return;
        const err = toApiError(e);
        dispatch({ type: 'fail', code: err.code, message: err.message });
      }
    })();
    return () => ctrl.abort();
  }, [request, attempt]);

  if (!request) return <Navigate to="/plan" replace />;

  const expected = Math.max(1, tripLength(request.start_date, request.end_date));
  const skeletons = state.phase === 'streaming' ? Math.max(1, Math.min(expected - state.days.length, 3)) : 0;
  const meta = `${formatRange(request.start_date, request.end_date)} · ${request.travelers} traveler${
    request.travelers === 1 ? '' : 's'
  }`;

  let statusText = state.status;
  if (state.phase === 'streaming' && state.days.length > 0) {
    statusText = `Planned ${state.days.length} day${state.days.length === 1 ? '' : 's'} so far…`;
  } else if (state.phase === 'done') {
    statusText = `Your ${state.days.length}-day itinerary is ready.`;
  } else if (state.phase === 'error') {
    statusText = 'Something went wrong.';
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <TripHero destination={request.destination} eyebrow="Your itinerary" meta={meta} />

      {/* live status: announced politely to screen readers */}
      <div className="flex min-h-[2.5rem] items-center gap-3" role="status" aria-live="polite">
        {state.phase === 'streaming' && (
          <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-line border-t-accent" aria-hidden="true" />
        )}
        <p className="font-mono text-xs font-bold uppercase tracking-widest text-muted">{statusText}</p>
      </div>

      {state.phase === 'error' && state.error && (
        <div role="alert" className="card border-accent p-5 sm:p-6">
          <p className="stamp">Delayed flight</p>
          <p className="mt-3 text-lg font-bold">We could not finish your itinerary.</p>
          <p className="mt-1 text-muted">{state.error.message}</p>
          <p className="mt-1 font-mono text-xs text-muted">Code: {state.error.code}</p>
          <div className="mt-4 flex flex-wrap gap-3">
            <button type="button" className="btn btn-primary" onClick={() => setAttempt((n) => n + 1)}>
              Try again
            </button>
            <Link to="/plan" className="btn btn-ghost">
              Edit trip details
            </Link>
          </div>
        </div>
      )}

      <div className="space-y-6">
        {state.days.map((day, i) => (
          <DayCard key={day.index} day={day} position={i} destination={request.destination} />
        ))}
        {Array.from({ length: skeletons }, (_, i) => (
          <DayCardSkeleton key={`sk-${i}`} />
        ))}
      </div>

      {state.phase === 'done' && (
        <div className="card flex flex-col gap-4 p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
          <div>
            <p className="eyebrow">Estimated total</p>
            <p className="font-display text-3xl font-extrabold">{formatMoney(state.total) || 'n/a'}</p>
            <p className="mt-1 text-sm text-muted">
              {user ? (
                <>
                  Saved to your trips.{' '}
                  {state.tripId && (
                    <Link to={`/trips/${encodeURIComponent(state.tripId)}`} className="link">
                      Open saved trip
                    </Link>
                  )}
                </>
              ) : (
                <>
                  <Link to="/login" state={{ from: '/trips' }} className="link">
                    Log in
                  </Link>{' '}
                  or{' '}
                  <Link to="/register" state={{ from: '/trips' }} className="link">
                    sign up
                  </Link>{' '}
                  to keep your trips.
                </>
              )}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <Link to="/plan" className="btn btn-ghost">
              Plan another
            </Link>
            <Link to="/trips" className="btn btn-primary">
              Saved trips
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
