import type { ChatEvent, ChatTurn, CostEstimate, GenerateEvent, ItineraryDay, Trip, TripRequest } from '../types/trip';
import { ApiError, apiFetch, streamSSE } from './client';

export function health(): Promise<{ status: string }> {
  return apiFetch<{ status: string }>('/health', { auth: false });
}

/** GET /trips: tolerate either a bare array or `{ trips: [...] }`. */
export async function listTrips(): Promise<Trip[]> {
  const res = await apiFetch<Trip[] | { trips: Trip[] }>('/trips');
  return Array.isArray(res) ? res : (res.trips ?? []);
}

export function getTrip(id: string): Promise<Trip> {
  return apiFetch<Trip>(`/trips/${encodeURIComponent(id)}`);
}

function asRecord(v: unknown): Record<string, unknown> {
  return v && typeof v === 'object' ? (v as Record<string, unknown>) : {};
}

/**
 * POST /trips/generate -> SSE. Yields `status`, `day` and `done` events.
 * A server `error` event (or a stream that ends early) is thrown as ApiError.
 */
export async function* generateTrip(
  request: TripRequest,
  signal?: AbortSignal,
): AsyncGenerator<GenerateEvent, void, void> {
  for await (const msg of streamSSE('/trips/generate', request, signal)) {
    const data = asRecord(msg.data);
    switch (msg.event) {
      case 'status':
        yield { type: 'status', message: String(data.message ?? '') };
        break;
      case 'day':
        yield { type: 'day', day: msg.data as ItineraryDay };
        break;
      case 'done':
        yield {
          type: 'done',
          trip_id: String(data.trip_id ?? ''),
          total_cost_estimate: (data.total_cost_estimate as CostEstimate | undefined) ?? null,
        };
        return;
      case 'error':
        throw new ApiError(String(data.code ?? 'generation_failed'), String(data.message ?? 'Trip generation failed.'));
      default:
        break;
    }
  }
  throw new ApiError('stream_closed', 'The connection closed before your trip was finished.');
}

/** POST /trips/{id}/chat -> SSE. Event names are assumed (`delta`/`message` with {text}, then `done`). */
export async function* chatTrip(
  id: string,
  message: string,
  options: { history?: ChatTurn[]; signal?: AbortSignal } = {},
): AsyncGenerator<ChatEvent, void, void> {
  const body = options.history?.length ? { message, history: options.history } : { message };
  for await (const msg of streamSSE(`/trips/${encodeURIComponent(id)}/chat`, body, options.signal)) {
    const data = asRecord(msg.data);
    if (msg.event === 'done') return;
    if (msg.event === 'error') {
      throw new ApiError(String(data.code ?? 'chat_failed'), String(data.message ?? 'Chat failed.'));
    }
    const text = data.text ?? data.delta ?? data.message ?? (typeof msg.data === 'string' ? msg.data : '');
    if (text) yield { type: 'delta', text: String(text) };
  }
}
