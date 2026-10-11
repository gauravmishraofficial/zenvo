import type {
  AuthResponse,
  ChatEvent,
  ChatTurn,
  GenerateEvent,
  PhotoOptions,
  PhotoResult,
  Trip,
  TripRequest,
  User,
} from '../types/trip';

/**
 * The single surface the UI talks to. `real.ts` and `mock.ts` both implement it,
 * so switching is just the VITE_USE_MOCK flag (see src/api/index.ts).
 */
export interface Api {
  health(): Promise<{ status: string }>;

  // auth (src/api/auth.ts)
  register(email: string, password: string): Promise<AuthResponse>;
  login(email: string, password: string): Promise<AuthResponse>;
  me(): Promise<User>;
  logout(): void;

  // trips (src/api/trips.ts)
  generateTrip(request: TripRequest, signal?: AbortSignal): AsyncGenerator<GenerateEvent, void, void>;
  listTrips(): Promise<Trip[]>;
  getTrip(id: string): Promise<Trip>;
  chatTrip(
    id: string,
    message: string,
    options?: { history?: ChatTurn[]; signal?: AbortSignal },
  ): AsyncGenerator<ChatEvent, void, void>;

  // photos (src/api/photos.ts). Resolves null when no photo exists.
  getDestinationPhoto(name: string, options?: PhotoOptions): Promise<PhotoResult | null>;
}
