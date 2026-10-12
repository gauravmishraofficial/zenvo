/**
 * In-browser mock of the whole API: fake SSE-like generator, fake auth (any email/password works)
 * and saved trips in localStorage. Same shapes as the real client, see ./types.ts.
 *
 * Tip: generate a trip for the destination "error" to see the error + retry state.
 */
import type {
  AuthResponse,
  ChatEvent,
  ChatTurn,
  CostEstimate,
  GenerateEvent,
  ItineraryDay,
  ItineraryItem,
  PhotoOptions,
  PhotoResult,
  Trip,
  TripRequest,
  User,
} from '../types/trip';
import { addDays, tripLength } from '../lib/format';
import { ApiError, clearToken, getToken, setToken } from './client';
import type { Api } from './types';
import { getWikipediaPhoto } from './wikipedia';

const TRIPS_KEY = 'zenvo.mock.trips';

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'));
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

const rand = (min: number, max: number) => Math.round(min + Math.random() * (max - min));

// ---------------------------------------------------------------- auth

function userFromEmail(email: string): User {
  let h = 0;
  for (const ch of email.toLowerCase()) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return { id: `u_${h.toString(16)}`, email };
}

function tokenFor(email: string): string {
  return `mock.${btoa(unescape(encodeURIComponent(email)))}`;
}

function currentUser(): User {
  const token = getToken();
  if (!token?.startsWith('mock.')) throw new ApiError('unauthorized', 'Please sign in to continue.', 401);
  try {
    return userFromEmail(decodeURIComponent(escape(atob(token.slice(5)))));
  } catch {
    throw new ApiError('unauthorized', 'Please sign in to continue.', 401);
  }
}

async function authenticate(email: string, password: string): Promise<AuthResponse> {
  await sleep(450);
  if (!email.trim() || !password) throw new ApiError('invalid_credentials', 'Email and password are required.', 400);
  const access_token = tokenFor(email.trim());
  setToken(access_token);
  return { access_token, token_type: 'bearer', user: userFromEmail(email.trim()) };
}

// ---------------------------------------------------------------- saved trips

type Store = Record<string, Trip[]>;

function readStore(): Store {
  try {
    return JSON.parse(localStorage.getItem(TRIPS_KEY) || '{}') as Store;
  } catch {
    return {};
  }
}

function writeStore(s: Store): void {
  try {
    localStorage.setItem(TRIPS_KEY, JSON.stringify(s));
  } catch {
    /* quota or private mode */
  }
}

function saveTrip(userId: string, trip: Trip): void {
  const store = readStore();
  store[userId] = [trip, ...(store[userId] ?? [])];
  writeStore(store);
}

/** Store a finished itinerary for the signed-in user, like the real backend would. No-op when signed out. */
export function rememberTrip(req: TripRequest, days: ItineraryDay[], tripId: string, total: CostEstimate): void {
  try {
    saveTrip(currentUser().id, {
      id: tripId,
      destination: req.destination.trim(),
      start_date: req.start_date,
      end_date: req.end_date,
      travelers: req.travelers,
      budget: req.budget,
      interests: req.interests,
      transport: req.transport,
      notes: req.notes,
      days,
      total_cost_estimate: total,
      created_at: new Date().toISOString(),
    });
  } catch {
    /* not signed in: trip is not saved */
  }
}

// ---------------------------------------------------------------- itinerary generation

const BUDGET_FACTOR: Record<string, number> = { budget: 0.6, mid: 1, luxury: 2.4 };

const INTEREST_ACTIVITIES: Record<string, { title: string; description: string; cost: number }> = {
  'Food & drink': { title: 'Market tasting walk', description: 'Graze through the local market with a guide who knows which stalls are worth the queue.', cost: 35 },
  Culture: { title: 'Evening of live local music', description: 'A small venue where locals actually go, with a short intro to the tradition behind it.', cost: 25 },
  History: { title: 'Guided history walk', description: 'Two hours through the layers of the old quarter, from founding myths to modern revival.', cost: 20 },
  Nature: { title: 'Sunset at the best natural lookout', description: 'An easy loop to an open viewpoint, timed for golden hour.', cost: 0 },
  Hiking: { title: 'Half-day trail hike', description: 'A moderate marked trail with big views and a picnic stop at the top.', cost: 10 },
  Beaches: { title: 'Beach afternoon', description: 'Sun, a swim and a beachside grill for a late lunch.', cost: 22 },
  Nightlife: { title: 'Bar-hopping after dark', description: 'Three well-loved bars, from a quiet cocktail den to a lively dance floor.', cost: 45 },
  'Art & museums': { title: 'Gallery hour', description: 'The one museum worth your time, plus a small independent gallery nearby.', cost: 18 },
  Shopping: { title: 'Makers and vintage shops', description: 'A curated browse through ateliers, record shops and secondhand finds.', cost: 30 },
  Wellness: { title: 'Spa or hot-bath session', description: 'Unwind with a local bathing ritual and a herbal tea afterwards.', cost: 40 },
  Photography: { title: 'Golden-hour photo walk', description: 'Quiet corners, colourful doors and rooftop angles most visitors miss.', cost: 0 },
  'Family friendly': { title: 'Hands-on family activity', description: 'A kid-approved workshop or park with plenty of room to run around.', cost: 28 },
};

const THEMES = [
  {
    title: (d: string) => `Arrival and first impressions of ${d}`,
    items: [
      { time: '10:00', title: 'Drop bags and stroll the neighbourhood', description: 'Settle in, then wander your immediate streets to get your bearings and spot a lunch place.', where: 'old town', cost: 0 },
      { time: '13:00', title: 'Easy local lunch', description: 'A short menu of regional classics at a spot full of locals.', where: 'central market', cost: 18 },
      { time: '16:00', title: 'Orientation walk to the main landmark', description: 'Take in the signature sight while the crowds thin out for the afternoon.', where: 'landmark square', cost: 12 },
    ],
  },
  {
    title: (d: string) => `Old quarters and local flavours in ${d}`,
    items: [
      { time: '09:00', title: 'Breakfast like a local', description: 'Fresh pastries and strong coffee at a neighbourhood café.', where: 'old town', cost: 9 },
      { time: '11:00', title: 'Historic quarter on foot', description: 'Narrow lanes, courtyards and the stories behind the buildings.', where: 'historic quarter', cost: 0 },
      { time: '14:00', title: 'Long lunch with regional specialities', description: 'Order the dish the owner recommends and take your time over it.', where: 'riverside', cost: 28 },
    ],
  },
  {
    title: (d: string) => `Views, hidden corners and a slower pace in ${d}`,
    items: [
      { time: '09:30', title: 'Morning at the best viewpoint', description: 'Beat the crowds for sweeping views over the rooftops.', where: 'viewpoint', cost: 6 },
      { time: '12:30', title: 'Lunch in an off-the-radar district', description: 'A less-visited neighbourhood with great food and friendly prices.', where: 'artisan district', cost: 20 },
      { time: '15:30', title: 'Browse studios and small shops', description: 'Pick up something made by hand, and chat to the makers.', where: 'artisan district', cost: 15 },
    ],
  },
  {
    title: (d: string) => `A day trip beyond ${d}`,
    items: [
      { time: '08:30', title: 'Head out of the city', description: 'An easy transfer to a nearby town or landscape that rewards the effort.', where: 'day trip', cost: 16 },
      { time: '12:00', title: 'Lunch with a view', description: 'A family-run place serving what is in season right now.', where: 'day trip', cost: 26 },
      { time: '15:00', title: 'Gentle walk and time to wander', description: 'No agenda, just good light and room to explore.', where: 'day trip', cost: 0 },
    ],
  },
  {
    title: (d: string) => `Last bites and farewell to ${d}`,
    items: [
      { time: '09:30', title: 'Final café stop and souvenirs', description: 'Pick up edible gifts you can fit in a suitcase.', where: 'central market', cost: 24 },
      { time: '12:30', title: 'Farewell lunch', description: 'Revisit the favourite from earlier in the trip, or try the one you missed.', where: 'riverside', cost: 30 },
      { time: '15:00', title: 'One last wander', description: 'A slow lap of your favourite square before heading to the airport or station.', where: 'landmark square', cost: 0 },
    ],
  },
];

function buildDay(req: TripRequest, i: number, date: string): ItineraryDay {
  const dest = req.destination.split(',')[0].trim();
  const theme = THEMES[i % THEMES.length];
  const factor = BUDGET_FACTOR[req.budget] ?? 1;
  const people = Math.max(1, req.travelers);
  const money = (n: number): CostEstimate => Math.round(n * factor * people);

  const items: ItineraryItem[] = theme.items.map((it) => ({
    time: it.time,
    title: it.title,
    description: it.description,
    location: `${dest} ${it.where}`,
    cost_estimate: money(it.cost),
  }));

  const interest = req.interests.length ? req.interests[i % req.interests.length] : undefined;
  const extra = interest ? INTEREST_ACTIVITIES[interest] : undefined;
  if (extra) {
    items.push({
      time: '19:30',
      title: extra.title,
      description: extra.description,
      location: `${dest} ${i % 2 ? 'harbour' : 'city centre'}`,
      cost_estimate: money(extra.cost),
    });
  } else {
    items.push({
      time: '19:30',
      title: 'Dinner at a well-reviewed local restaurant',
      description: 'Book ahead if you can; ask for the seasonal tasting plates.',
      location: `${dest} city centre`,
      cost_estimate: money(34),
    });
  }
  if (req.transport.mode === 'car' && i > 0 && req.transport.car_model) {
    items[0].description += ` Parking tip for your ${req.transport.car_model}: use a garage on the edge of the centre.`;
  }

  return { index: i, date, title: theme.title(dest), items };
}

async function* generateTrip(req: TripRequest, signal?: AbortSignal): AsyncGenerator<GenerateEvent, void, void> {
  await sleep(350, signal);
  yield { type: 'status', message: `Researching ${req.destination.trim()} for ${req.travelers} traveller${req.travelers === 1 ? '' : 's'}…` };

  if (req.destination.trim().toLowerCase() === 'error') {
    await sleep(900, signal);
    throw new ApiError('generation_failed', 'The itinerary service hit a problem (mock failure). Try again or pick another destination.');
  }

  const count = Math.min(5, Math.max(3, tripLength(req.start_date, req.end_date)));
  const days: ItineraryDay[] = [];
  for (let i = 0; i < count; i++) {
    await sleep(rand(500, 900), signal);
    const day = buildDay(req, i, addDays(req.start_date, i));
    days.push(day);
    yield { type: 'day', day };
  }

  await sleep(300, signal);
  const total = days.reduce(
    (acc, d) => acc + d.items.reduce((a, it) => a + (typeof it.cost_estimate === 'number' ? it.cost_estimate : 0), 0),
    0,
  );
  const tripId = `mock_${Date.now().toString(36)}`;

  // The real backend stores the trip for the signed-in user; mimic that here.
  rememberTrip(req, days, tripId, total);
  yield { type: 'done', trip_id: tripId, total_cost_estimate: total };
}

async function* chatTrip(
  _id: string,
  message: string,
  options: { history?: ChatTurn[]; signal?: AbortSignal } = {},
): AsyncGenerator<ChatEvent, void, void> {
  currentUser();
  const reply = `Good question about "${message.slice(0, 60)}". In the real app the assistant would adjust your itinerary here. `;
  for (const word of reply.split(' ')) {
    await sleep(60, options.signal);
    yield { type: 'delta', text: `${word} ` };
  }
}

export const mockApi: Api = {
  async health() {
    return { status: 'ok (mock)' };
  },
  register: authenticate,
  login: authenticate,
  async me() {
    await sleep(150);
    return currentUser();
  },
  logout() {
    clearToken();
  },
  generateTrip,
  async listTrips() {
    await sleep(650);
    return readStore()[currentUser().id] ?? [];
  },
  async getTrip(id) {
    await sleep(350);
    const trip = (readStore()[currentUser().id] ?? []).find((t) => t.id === id);
    if (!trip) throw new ApiError('not_found', 'We could not find that trip.', 404);
    return trip;
  },
  chatTrip,
  async getDestinationPhoto(name: string, options?: PhotoOptions): Promise<PhotoResult | null> {
    return getWikipediaPhoto(name, options);
  },
};
