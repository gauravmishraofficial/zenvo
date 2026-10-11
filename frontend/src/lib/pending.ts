import type { TripRequest } from '../types/trip';

const KEY = 'zenvo.pendingTrip';

/** The wizard hands its request to /trip/new through sessionStorage so a refresh keeps working. */
export function savePendingRequest(req: TripRequest): void {
  try {
    sessionStorage.setItem(KEY, JSON.stringify(req));
  } catch {
    /* ignore */
  }
}

export function loadPendingRequest(): TripRequest | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as TripRequest) : null;
  } catch {
    return null;
  }
}
