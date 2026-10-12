import json

import pytest
from fastapi.testclient import TestClient

from app import main, places, planner
from app.places import Place

TRIP = {
    "destination": "Lisbon",
    "start_date": "2026-11-03",
    "end_date": "2026-11-05",
    "travelers": 2,
    "budget": "mid",
    "interests": ["History"],
    "transport": {"mode": "public_transit"},
}


def parse_sse(text: str) -> list[tuple[str, dict]]:
    events = []
    for block in text.strip().split("\n\n"):
        lines = dict(line.split(": ", 1) for line in block.splitlines())
        events.append((lines["event"], json.loads(lines["data"])))
    return events


LISBON = Place("Lisboa", 38.72, -9.14, "Lisboa, Portugal")


@pytest.fixture
def places_stub(monkeypatch):
    """Stub the map: the destination exists and every venue is found (in "Centro") unless a test says otherwise."""
    state = {"destination": LISBON, "venues": {}, "lookups": []}

    async def find_destination(name, client=None):
        return state["destination"]

    async def find_venue(name, near, client=None, radius_deg=None):
        state["lookups"].append(name)
        return state["venues"].get(name, Place(name, 38.71, -9.13, "Centro"))

    monkeypatch.setattr(places, "find_destination", find_destination)
    monkeypatch.setattr(places, "find_venue", find_venue)
    return state


@pytest.fixture
def critic(monkeypatch):
    """Stub the fact-checker: no problems unless a test queues some."""
    state = {"answers": [], "prompts": []}

    async def critique_call(_client, _key, prompt):
        state["prompts"].append(prompt)
        return json.dumps({"problems": state["answers"].pop(0) if state["answers"] else []})

    monkeypatch.setattr(planner, "_critique_call", critique_call)
    return state


@pytest.fixture
def client(monkeypatch, places_stub, critic):
    monkeypatch.setattr(main, "API_KEY", "test-key")
    main._recent.clear()
    return TestClient(main.app)


@pytest.fixture
def fake_ai(monkeypatch):
    prompts = []

    async def complete(_client, _key, prompt):
        prompts.append(prompt)
        n = len(prompts)
        return json.dumps(
            {"title": f"Day {n}", "items": [{"time": "09:00", "title": f"Sight {n}", "location": f"Place {n}, Alfama", "cost_estimate": "$12"}]}
        )

    monkeypatch.setattr(planner, "_complete", complete)
    return prompts


def test_health(client):
    assert client.get("/api/v1/health").json() == {"status": "ok", "ai_configured": True}


def test_generate_streams_one_day_per_trip_day(client, fake_ai):
    res = client.post("/api/v1/trips/generate", json=TRIP)
    assert res.status_code == 200
    events = parse_sse(res.text)
    days = [d for e, d in events if e == "day"]
    assert [d["date"] for d in days] == ["2026-11-03", "2026-11-04", "2026-11-05"]
    assert days[0]["items"][0]["cost_estimate"] == 12.0
    assert events[0][0] == "status"
    assert events[-1][0] == "done"
    assert events[-1][1]["total_cost_estimate"] == 36
    # later days are told what was already planned, to avoid repeats
    assert "Sight 1" in fake_ai[1] and "Sight 2" in fake_ai[2]


def test_unreadable_ai_output_becomes_error_event(client, monkeypatch):
    async def complete(*_):
        return "not json"

    monkeypatch.setattr(planner, "_complete", complete)
    events = parse_sse(client.post("/api/v1/trips/generate", json=TRIP).text)
    assert events[-1] == ("error", {"code": "bad_ai_output", "message": "The AI returned an unreadable plan. Please try again."})


def test_rejects_end_before_start(client, fake_ai):
    res = client.post("/api/v1/trips/generate", json={**TRIP, "end_date": "2026-11-01"})
    assert res.status_code == 422
    assert res.json()["error"]["code"] == "invalid_request"


def test_rejects_trips_longer_than_max(client, fake_ai):
    res = client.post("/api/v1/trips/generate", json={**TRIP, "end_date": "2026-12-30"})
    assert res.status_code == 422


def test_rate_limit_per_visitor(client, fake_ai, monkeypatch):
    monkeypatch.setattr(main, "TRIPS_PER_HOUR", 2)
    trip = {**TRIP, "end_date": TRIP["start_date"]}
    assert client.post("/api/v1/trips/generate", json=trip).status_code == 200
    assert client.post("/api/v1/trips/generate", json=trip).status_code == 200
    res = client.post("/api/v1/trips/generate", json=trip)
    assert res.status_code == 429
    assert res.json()["error"]["code"] == "rate_limited"


def test_missing_key_is_reported(client, monkeypatch):
    monkeypatch.setattr(main, "API_KEY", "")
    res = client.post("/api/v1/trips/generate", json=TRIP)
    assert res.status_code == 503


def test_cors_allows_the_live_site(client):
    res = client.options(
        "/api/v1/trips/generate",
        headers={"Origin": "https://gauravmishraofficial.github.io", "Access-Control-Request-Method": "POST"},
    )
    assert res.headers["access-control-allow-origin"] == "https://gauravmishraofficial.github.io"


def test_url_encoded_names_are_decoded():
    item = planner.ItineraryItem(title="Breakfast at %E3%81%93%E3%81%93 (Koko)", location="100% Kyoto")
    assert item.title == "Breakfast at ここ (Koko)"
    assert item.location == "100% Kyoto"


def test_rejects_a_destination_that_is_not_a_real_place(client, fake_ai, places_stub):
    places_stub["destination"] = False
    res = client.post("/api/v1/trips/generate", json={**TRIP, "destination": "dsfafD"})
    assert res.status_code == 422
    assert res.json()["error"]["code"] == "unknown_destination"
    assert "dsfafD" in res.json()["error"]["message"]
    assert fake_ai == []  # the AI is never asked to invent a place


def test_unknown_destination_does_not_use_up_the_hourly_limit(client, fake_ai, places_stub, monkeypatch):
    monkeypatch.setattr(main, "TRIPS_PER_HOUR", 1)
    places_stub["destination"] = False
    client.post("/api/v1/trips/generate", json=TRIP)
    places_stub["destination"] = LISBON
    assert client.post("/api/v1/trips/generate", json={**TRIP, "end_date": TRIP["start_date"]}).status_code == 200


def test_trip_still_generates_when_the_place_lookup_is_down(client, fake_ai, places_stub):
    places_stub["destination"] = None  # lookup failed: don't block real users because of it
    res = client.post("/api/v1/trips/generate", json={**TRIP, "end_date": TRIP["start_date"]})
    assert res.status_code == 200
    assert parse_sse(res.text)[-1][0] == "done"


# ---------------------------------------------------------------- the review/correction round


def scripted_ai(monkeypatch, *answers):
    """The AI replies with these days in order, then keeps repeating the last one; returns the prompts it was sent."""
    prompts = []

    async def complete(_client, _key, prompt):
        prompts.append(prompt)
        return json.dumps(answers[min(len(prompts), len(answers)) - 1])

    monkeypatch.setattr(planner, "_complete", complete)
    return prompts


def day(*items):
    return {"title": "A day", "items": [{"time": t, "title": f"Visit {loc}", "location": f"{loc}, Somewhere"} for t, loc in items]}


ONE_DAY = {**TRIP, "end_date": TRIP["start_date"]}


def days_of(res):
    return [d for e, d in parse_sse(res.text) if e == "day"]


def names(d):
    return [it["location"].split(",")[0] for it in d["items"]]


def test_venue_names_and_neighbourhoods_come_from_the_map(client, monkeypatch, places_stub):
    places_stub["venues"]["Cervejaria Ramiro"] = Place("Cervejaria Ramiro", 38.72, -9.13, "Arroios")
    places_stub["venues"]["Campo de Ourique"] = Place("Campo de Ourique", 38.716, -9.168, "Lisboa")  # ~3 km away
    prompts = scripted_ai(monkeypatch, {"title": "T", "items": [
        {"time": "12:00", "title": "Lunch", "location": "Cervejaria Ramiro, Campo de Ourique"},
        {"time": "14:00", "title": "Walk", "location": "Alfama, Lisbon"},
    ]})
    [d] = days_of(client.post("/api/v1/trips/generate", json=ONE_DAY))
    assert d["items"][0]["location"] == "Cervejaria Ramiro, Arroios"
    assert len(prompts) == 1  # nothing wrong, no correction round


def test_invented_venue_is_sent_back_to_the_ai_with_the_reason(client, monkeypatch, places_stub):
    places_stub["venues"]["Cafe Lello"] = False
    prompts = scripted_ai(
        monkeypatch,
        day(("10:00", "Cafe Lello"), ("12:00", "Alfama")),
        day(("10:00", "Pastelaria Versailles"), ("12:00", "Alfama")),
    )
    [d] = days_of(client.post("/api/v1/trips/generate", json=ONE_DAY))
    assert '"Cafe Lello" is not on the map near Lisbon' in prompts[1]
    assert names(d) == ["Pastelaria Versailles", "Alfama"]


def test_venue_still_invented_after_the_correction_is_dropped(client, monkeypatch, places_stub):
    places_stub["venues"]["Cafe Lello"] = False
    bad = day(("10:00", "Cafe Lello"), ("12:00", "Alfama"), ("15:00", "Baixa"))
    scripted_ai(monkeypatch, bad, bad)
    [d] = days_of(client.post("/api/v1/trips/generate", json=ONE_DAY))
    assert names(d) == ["Alfama", "Baixa"]


def test_a_day_is_never_emptied_by_the_checks(client, monkeypatch, places_stub):
    places_stub["venues"]["Nowhere"] = False
    bad = day(("10:00", "Nowhere"), ("12:00", "Alfama"))
    scripted_ai(monkeypatch, bad, bad)
    [d] = days_of(client.post("/api/v1/trips/generate", json=ONE_DAY))
    assert len(d["items"]) == 2


def test_late_risers_get_no_early_plans(client, monkeypatch):
    prompts = scripted_ai(
        monkeypatch,
        day(("08:00", "Pastelaria Versailles"), ("12:00", "Alfama")),
        day(("10:30", "Pastelaria Versailles"), ("12:00", "Alfama")),
    )
    [d] = days_of(client.post("/api/v1/trips/generate", json={**ONE_DAY, "notes": "We hate early mornings."}))
    assert "no earlier than 10:00" in prompts[0]
    assert '"Visit Pastelaria Versailles" at 08:00 is too early' in prompts[1]
    assert d["items"][0]["time"] == "10:30"


def test_a_venue_from_an_earlier_day_is_not_repeated(client, monkeypatch):
    two_days = {**TRIP, "end_date": "2026-11-04"}
    prompts = scripted_ai(
        monkeypatch,
        day(("10:00", "Cervejaria Ramiro"), ("13:00", "Alfama")),
        day(("10:00", "Cervejaria Ramiro"), ("13:00", "Belem")),
        day(("10:00", "Tasca da Esquina"), ("13:00", "Belem")),
    )
    _, d2 = days_of(client.post("/api/v1/trips/generate", json=two_days))
    assert "(Cervejaria Ramiro, Somewhere)" in prompts[1]  # day 2 is told what day 1 used
    assert '"Cervejaria Ramiro" is already in this trip' in prompts[2]
    assert names(d2) == ["Tasca da Esquina", "Belem"]


def test_zigzag_route_is_sent_back_for_reordering(client, monkeypatch, places_stub):
    west, east = (38.6916, -9.2160), (38.7114, -9.1300)
    for name, (lat, lon) in {"W1": west, "E1": east, "W2": west, "E2": east}.items():
        places_stub["venues"][name] = Place(name, lat, lon, "West" if name[0] == "W" else "East")
    prompts = scripted_ai(
        monkeypatch,
        day(("10:00", "W1"), ("12:00", "E1"), ("14:00", "W2"), ("16:00", "E2")),
        day(("10:00", "W1"), ("12:00", "W2"), ("14:00", "E1"), ("16:00", "E2")),
    )
    [d] = days_of(client.post("/api/v1/trips/generate", json=ONE_DAY))
    assert "back and forth" in prompts[1]
    assert names(d) == ["W1", "W2", "E1", "E2"]


def test_when_the_map_is_down_the_plan_is_kept_as_is(client, monkeypatch, places_stub):
    places_stub["destination"] = None
    prompts = scripted_ai(monkeypatch, day(("10:00", "Anything"), ("12:00", "Else")))
    [d] = days_of(client.post("/api/v1/trips/generate", json=ONE_DAY))
    assert len(prompts) == 1 and places_stub["lookups"] == []
    assert len(d["items"]) == 2


def test_a_lone_stop_far_out_of_town_is_replaced(client, monkeypatch, places_stub):
    places_stub["venues"]["Tascantiga"] = Place("Tascantiga", 38.7976, -9.3900, "Sintra")
    prompts = scripted_ai(
        monkeypatch,
        day(("10:00", "Alfama"), ("12:00", "Baixa"), ("19:30", "Tascantiga")),
        day(("10:00", "Alfama"), ("12:00", "Baixa"), ("19:30", "Clube de Fado")),
    )
    [d] = days_of(client.post("/api/v1/trips/generate", json=ONE_DAY))
    assert '"Tascantiga" (Sintra) is far from everything else' in prompts[1]
    assert names(d) == ["Alfama", "Baixa", "Clube de Fado"]


def test_airport_and_departure_items_are_removed_without_a_correction(client, monkeypatch):
    prompts = scripted_ai(monkeypatch, {"title": "T", "items": [
        {"time": "10:00", "title": "Breakfast at Zazie", "location": "Zazie, Cole Valley"},
        {"time": "12:30", "title": "Lunch at Sotto Mare", "location": "Sotto Mare, North Beach"},
        {"time": "15:00", "title": "Transfer to SFO for departure", "location": "San Francisco International Airport"},
    ]})
    [d] = days_of(client.post("/api/v1/trips/generate", json=ONE_DAY))
    assert names(d) == ["Zazie", "Sotto Mare"]
    assert len(prompts) == 1


def test_dinner_at_lunchtime_is_sent_back(client, monkeypatch):
    prompts = scripted_ai(
        monkeypatch,
        {"title": "T", "items": [
            {"time": "12:30", "title": "Lunch at Pike Place Chowder", "location": "Pike Place Chowder, Downtown"},
            {"time": "13:30", "title": "Early Dinner at The Pink Door", "location": "The Pink Door, Downtown"},
        ]},
        {"title": "T", "items": [
            {"time": "12:30", "title": "Lunch at Pike Place Chowder", "location": "Pike Place Chowder, Downtown"},
            {"time": "18:30", "title": "Dinner at The Pink Door", "location": "The Pink Door, Downtown"},
        ]},
    )
    [d] = days_of(client.post("/api/v1/trips/generate", json=ONE_DAY))
    assert "not a time for dinner" in prompts[1]
    assert d["items"][1]["time"] == "18:30"


def test_car_trips_search_a_wider_area(client, monkeypatch, places_stub):
    radii = []

    async def find_venue(name, near, client=None, radius_deg=None):
        radii.append(radius_deg)
        return Place(name, 38.71, -9.13, "Centro")

    monkeypatch.setattr(places, "find_venue", find_venue)
    scripted_ai(monkeypatch, day(("10:00", "Arches"), ("12:30", "Moab Brewery")))
    client.post("/api/v1/trips/generate", json={**ONE_DAY, "transport": {"mode": "car"}})
    client.post("/api/v1/trips/generate", json=ONE_DAY)
    assert radii[0] == places.VENUE_RADIUS_DEG_BY_CAR and radii[-1] == places.VENUE_RADIUS_DEG


def test_the_ai_neighbourhood_is_kept_when_the_map_confirms_it_is_next_door(client, monkeypatch, places_stub):
    places_stub["venues"]["Wynwood Walls"] = Place("Wynwood Walls", 25.8010, -80.1993, "Overtown")
    places_stub["venues"]["Wynwood"] = Place("Wynwood", 25.8040, -80.1990, "Miami")  # ~0.3 km away
    scripted_ai(monkeypatch, {"title": "T", "items": [
        {"time": "10:00", "title": "Street art", "location": "Wynwood Walls, Wynwood"},
        {"time": "12:30", "title": "Lunch at Coyo Taco", "location": "Coyo Taco, Wynwood"},
    ]})
    [d] = days_of(client.post("/api/v1/trips/generate", json=ONE_DAY))
    assert d["items"][0]["location"] == "Wynwood Walls, Wynwood"


def test_the_fact_checker_problems_go_into_the_correction(client, monkeypatch, critic):
    critic["answers"] = [["Café Reconcile serves soul food with meat: not a vegetarian lunch."]]
    prompts = scripted_ai(
        monkeypatch,
        day(("10:00", "Jackson Square"), ("12:30", "Cafe Reconcile")),
        day(("10:00", "Jackson Square"), ("12:30", "Seed")),
    )
    [d] = days_of(client.post("/api/v1/trips/generate", json={**ONE_DAY, "notes": "vegetarian"}))
    assert "vegetarian" in critic["prompts"][0] and "Cafe Reconcile" in critic["prompts"][0]
    assert "soul food with meat" in prompts[1]
    assert names(d) == ["Jackson Square", "Seed"]


def test_a_broken_fact_checker_never_breaks_the_trip(client, monkeypatch):
    async def broken(*_):
        raise planner.PlannerError("llm_busy", "busy")

    monkeypatch.setattr(planner, "_critique_call", broken)
    scripted_ai(monkeypatch, day(("10:00", "Jackson Square"), ("12:30", "Seed")))
    [d] = days_of(client.post("/api/v1/trips/generate", json=ONE_DAY))
    assert names(d) == ["Jackson Square", "Seed"]


def test_a_busy_ai_during_a_correction_keeps_the_draft_instead_of_failing(client, monkeypatch, places_stub):
    places_stub["venues"]["Nowhere"] = False
    calls = []

    async def complete(_client, _key, prompt):
        calls.append(prompt)
        if len(calls) > 1:
            raise planner.PlannerError("llm_busy", "The AI service is busy right now. Please try again in a minute.")
        return json.dumps(day(("10:00", "Nowhere"), ("12:30", "Alfama"), ("15:00", "Baixa")))

    monkeypatch.setattr(planner, "_complete", complete)
    events = parse_sse(client.post("/api/v1/trips/generate", json=ONE_DAY).text)
    assert events[-1][0] == "done"
    [d] = [d for e, d in events if e == "day"]
    assert names(d) == ["Alfama", "Baixa"]


def test_rate_limits_are_waited_out(monkeypatch):
    import asyncio

    import httpx

    waits = []

    async def fake_sleep(s):
        waits.append(s)

    monkeypatch.setattr(planner.asyncio, "sleep", fake_sleep)
    responses = [
        httpx.Response(429, headers={"retry-after": "4"}),
        httpx.Response(429, headers={"x-ratelimit-reset-tokens": "7.5s"}),
        httpx.Response(429),
        httpx.Response(200, json={"choices": [{"message": {"content": "{}"}}]}),
    ]

    async def run():
        async with httpx.AsyncClient(transport=httpx.MockTransport(lambda _: responses.pop(0))) as c:
            return await planner._chat(c, "key", "system", "prompt")

    assert asyncio.run(run()) == "{}"
    assert waits[0] == 4 and waits[1] == 7.5 and 1 <= waits[2] <= 20


def test_a_used_up_daily_allowance_fails_fast_with_a_clear_message(monkeypatch):
    import asyncio

    import httpx

    waits = []

    async def fake_sleep(s):
        waits.append(s)

    monkeypatch.setattr(planner.asyncio, "sleep", fake_sleep)

    async def run():
        transport = httpx.MockTransport(lambda _: httpx.Response(429, headers={"retry-after": "458"}))
        async with httpx.AsyncClient(transport=transport) as c:
            return await planner._chat(c, "key", "system", "prompt")

    with pytest.raises(planner.PlannerError) as e:
        asyncio.run(run())
    assert e.value.code == "llm_quota"
    assert "about 8 minutes" in e.value.message
    assert waits == []


def test_a_long_empty_afternoon_is_sent_back(client, monkeypatch):
    prompts = scripted_ai(
        monkeypatch,
        {"title": "T", "items": [
            {"time": "10:00", "title": "The Met", "location": "The Metropolitan Museum of Art, Upper East Side"},
            {"time": "12:00", "title": "Lunch at Sant Ambroeus", "location": "Sant Ambroeus, Upper East Side"},
            {"time": "18:30", "title": "Dinner at Le Bernardin", "location": "Le Bernardin, Midtown"},
        ]},
        {"title": "T", "items": [
            {"time": "10:00", "title": "The Met", "location": "The Metropolitan Museum of Art, Upper East Side"},
            {"time": "12:00", "title": "Lunch at Sant Ambroeus", "location": "Sant Ambroeus, Upper East Side"},
            {"time": "14:30", "title": "Central Park walk", "location": "Central Park, Manhattan"},
            {"time": "18:30", "title": "Dinner at Le Bernardin", "location": "Le Bernardin, Midtown"},
        ]},
    )
    [d] = days_of(client.post("/api/v1/trips/generate", json=ONE_DAY))
    assert "Nothing is planned between 12:00 and 18:30" in prompts[1]
    assert len(d["items"]) == 4
