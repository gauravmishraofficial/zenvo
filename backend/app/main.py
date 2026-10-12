"""Voyage API. Only the AI part lives here; accounts and saved trips stay in the browser for now."""
from __future__ import annotations

import json
import os
import time
import uuid
from collections import defaultdict, deque

from dotenv import load_dotenv

load_dotenv()  # local dev: reads backend/.env. On Render the variables are set in the dashboard.

from fastapi import FastAPI, Request  # noqa: E402
from fastapi.exceptions import RequestValidationError  # noqa: E402
from fastapi.middleware.cors import CORSMiddleware  # noqa: E402
from fastapi.responses import JSONResponse, StreamingResponse  # noqa: E402

from . import places  # noqa: E402
from .planner import PlannerError, TripRequest, generate_days  # noqa: E402

API_KEY = os.getenv("LLAMA_API_KEY", "").strip()
ALLOWED_ORIGINS = [
    o.strip()
    for o in os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,https://gauravmishraofficial.github.io").split(",")
    if o.strip()
]
# Per-visitor cap so a public site can't burn through the free AI quota.
TRIPS_PER_HOUR = int(os.getenv("TRIPS_PER_HOUR", "10"))

app = FastAPI(title="Voyage API", docs_url="/api/v1/docs", openapi_url="/api/v1/openapi.json")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)


def error(status: int, code: str, message: str) -> JSONResponse:
    return JSONResponse({"error": {"code": code, "message": message}}, status_code=status)


@app.exception_handler(RequestValidationError)
async def _validation_error(_: Request, exc: RequestValidationError) -> JSONResponse:
    first = exc.errors()[0] if exc.errors() else {}
    msg = str(first.get("msg", "Invalid request.")).removeprefix("Value error, ")
    return error(422, "invalid_request", msg[:1].upper() + msg[1:])


_recent: dict[str, deque[float]] = defaultdict(deque)


def _client_ip(request: Request) -> str:
    fwd = request.headers.get("x-forwarded-for")
    return fwd.split(",")[0].strip() if fwd else (request.client.host if request.client else "unknown")


def _allow(ip: str) -> bool:
    now = time.monotonic()
    q = _recent[ip]
    while q and now - q[0] > 3600:
        q.popleft()
    if len(q) >= TRIPS_PER_HOUR:
        return False
    q.append(now)
    return True


def sse(event: str, data: dict) -> str:
    return f"event: {event}\ndata: {json.dumps(data)}\n\n"


@app.get("/api/v1/health")
async def health() -> dict:
    return {"status": "ok", "ai_configured": bool(API_KEY)}


@app.post("/api/v1/trips/generate")
async def generate_trip(req: TripRequest, request: Request):
    if not API_KEY:
        return error(503, "ai_not_configured", "The AI key is not set on the server yet.")
    # Checked before the hourly limit so a typo doesn't use up one of the visitor's trips.
    if await places.find_destination(req.destination) is False:
        return error(
            422,
            "unknown_destination",
            f"We couldn't find a place called \"{req.destination}\". Check the spelling or try a nearby city.",
        )
    if not _allow(_client_ip(request)):
        return error(429, "rate_limited", f"You've planned {TRIPS_PER_HOUR} trips this hour. Please try again later.")

    async def stream():
        people = f"{req.travelers} traveller{'s' if req.travelers != 1 else ''}"
        yield sse("status", {"message": f"Planning {req.num_days} days in {req.destination} for {people}…"})
        total = 0.0
        try:
            async for day in generate_days(req, API_KEY):
                total += sum(it["cost_estimate"] or 0 for it in day["items"])
                yield sse("day", day)
                if day["index"] + 1 < req.num_days:
                    yield sse("status", {"message": f"Planning day {day['index'] + 2} of {req.num_days}…"})
        except PlannerError as e:
            yield sse("error", {"code": e.code, "message": e.message})
            return
        except Exception:  # never leave the client hanging on an unexpected failure
            yield sse("error", {"code": "generation_failed", "message": "Something went wrong while planning. Please try again."})
            return
        yield sse("done", {"trip_id": f"trip_{uuid.uuid4().hex[:12]}", "total_cost_estimate": round(total)})

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
