/**
 * Voyage API types (frontend copy).
 *
 * shared/trip.ts (owned by Beck) did not exist when this scaffold was created, so these
 * types live here. When shared/trip.ts lands, replace this file with a re-export of it.
 */

export interface ApiErrorBody {
  error: { code: string; message: string };
}

export interface User {
  id: string;
  email: string;
}

export interface AuthResponse {
  access_token: string;
  token_type: 'bearer';
  user: User;
}

export interface TransportPreference {
  /** e.g. "public_transit" | "car" | "walking" | "bike" | "mixed" (free-form string on the wire) */
  mode: string;
  car_model?: string;
}

/** Body of POST /trips/generate */
export interface TripRequest {
  destination: string;
  /** YYYY-MM-DD */
  start_date: string;
  /** YYYY-MM-DD */
  end_date: string;
  travelers: number;
  /** "budget" | "mid" | "luxury" ... may change, so keep it a string */
  budget: string;
  interests: string[];
  transport: TransportPreference;
  notes?: string;
}

/** USD for the whole party (per Beck). A pre-formatted string is tolerated too. */
export type CostEstimate = number | string | null;

export interface ItineraryItem {
  time: string;
  title: string;
  description: string;
  location: string;
  cost_estimate: CostEstimate;
}

export interface ItineraryDay {
  index: number;
  /** YYYY-MM-DD */
  date: string;
  title: string;
  items: ItineraryItem[];
}

/** A saved trip (GET /trips, GET /trips/{id}). `days` may be omitted by the list endpoint. */
export interface Trip {
  id: string;
  destination: string;
  start_date: string;
  end_date: string;
  travelers: number;
  budget: string;
  interests?: string[];
  transport?: TransportPreference;
  notes?: string;
  days?: ItineraryDay[];
  total_cost_estimate?: CostEstimate;
  created_at?: string;
}

/** Events parsed from the POST /trips/generate SSE stream. Server `error` events are thrown as ApiError. */
export type GenerateEvent =
  | { type: 'status'; message: string }
  | { type: 'day'; day: ItineraryDay }
  | { type: 'done'; trip_id: string; total_cost_estimate: CostEstimate };

/** One prior turn sent along with a chat message (POST /trips/{id}/chat body: { message, history? }). */
export interface ChatTurn {
  role: 'user' | 'assistant';
  content: string;
}

/** Events from POST /trips/{id}/chat (event names are an assumption until Beck documents them). */
export type ChatEvent = { type: 'delta'; text: string };

/** GET /destinations/photo?name=... */
export interface PhotoResult {
  url: string;
  attribution?: string | null;
}

export interface PhotoOptions {
  /** Wikimedia-only hint: 0 = lead image, n>0 = nth gallery image. Ignored by the real backend. */
  variant?: number;
  /** Wikimedia-only hint: desired image width in px. Ignored by the real backend. */
  width?: number;
}
