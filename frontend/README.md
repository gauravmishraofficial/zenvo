# Voyage by Zenvo: frontend

Vite + React 18 + TypeScript, Tailwind CSS 3, react-router-dom 6, TanStack Query 5.
Light and dark mode (class based, follows the system by default, toggle in the nav, saved in `localStorage`).

## Run it

```powershell
cd C:\zenvo\frontend
npm install
npm run dev        # http://localhost:5173  (mock API on by default, see below)
npm run build      # tsc -b && vite build -> dist/
npm run preview    # serve the production build
npx tsc --noEmit -p tsconfig.app.json   # type check only
```

## Mock vs. real backend

| Variable | Default | Meaning |
| --- | --- | --- |
| `VITE_USE_MOCK` | `true` in `.env.development` (committed), unset (= `false`) otherwise | `true`: everything is served by `src/api/mock.ts`. `false`: real backend. |
| `VITE_API_BASE_URL` | `/api/v1` | Base URL of the API. In dev, Vite proxies `/api` to `http://localhost:8000`. |

To talk to the real backend in dev, create your own `.env.local` (git-ignored) with `VITE_USE_MOCK=false`,
start the backend on port 8000, and restart `npm run dev`. See `.env.example`. Never commit `.env` files with secrets.

**Mock mode** gives you: a fake SSE-like trip generator (status, 3-5 `day` events 500-900 ms apart, then `done`),
fake auth (any email and password works), saved trips stored in `localStorage`, and photos fetched straight
from the Wikipedia REST API. Tip: plan a trip to the destination `error` to see the error/retry state.

**Real mode** uses `POST /trips/generate` (SSE over fetch), `GET /trips`, `GET /trips/{id}`, `/auth/*` and
`GET /destinations/photo?name=...`.

## Code map

```
src/api/client.ts     fetch wrapper, bearer token, error shape, POST+SSE parser (single place for HTTP)
src/api/auth.ts       real auth endpoints (paths in AUTH_PATHS)
src/api/trips.ts      real trips: generate (SSE), list, get, chat
src/api/photos.ts     real GET /destinations/photo
src/api/wikipedia.ts  direct Wikipedia lookup (used by the mock)
src/api/mock.ts       full mock of the above (same signatures: see src/api/types.ts)
src/api/index.ts      picks real or mock from VITE_USE_MOCK
src/hooks/usePhoto.ts photo hook: memory + sessionStorage cache, gradient placeholder
src/types/trip.ts     API types (local copy; replace with shared/trip.ts when it exists)
```

Photos: `usePhoto(query)` is used for the destination hero, every day card, the home page destination ideas and
saved trip cards. Images are `loading="lazy"` inside fixed-aspect-ratio frames, so nothing jumps around.

Footer includes the required "Built with Llama" notice (https://www.llama.com/llama4/license/).
