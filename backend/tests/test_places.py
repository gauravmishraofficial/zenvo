import asyncio

import httpx
import pytest

from app import places
from app.places import Place

LISBON = Place(name="Lisboa", lat=38.72, lon=-9.14, area="Portugal")


@pytest.fixture(autouse=True)
def _fresh_cache():
    places._cache.clear()


def _run(handler, coro_fn):
    async def go():
        async with httpx.AsyncClient(transport=httpx.MockTransport(handler)) as c:
            return await coro_fn(c)

    return asyncio.run(go())


@pytest.mark.parametrize(
    ("status", "body", "expected"),
    [
        (200, [{"name": "Kyoto", "lat": "35.01", "lon": "135.76", "display_name": "Kyoto, Japan"}], Place("Kyoto", 35.01, 135.76, "Kyoto, Japan")),
        (200, [], False),
        (503, {}, None),
    ],
)
def test_find_destination_reads_the_place_search(status, body, expected):
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen["q"] = request.url.params["q"]
        seen["ua"] = request.headers["user-agent"]
        return httpx.Response(status, json=body)

    assert _run(handler, lambda c: places.find_destination("Kyoto ", c)) == expected
    assert seen["q"] == "Kyoto"
    assert "Voyage" in seen["ua"]


def _photon(name, lat=38.71, lon=-9.13, **props):
    return {"features": [{"geometry": {"coordinates": [lon, lat]}, "properties": {"name": name, **props}}]}


def test_find_venue_returns_the_map_name_and_neighbourhood():
    seen = {}

    def handler(request: httpx.Request) -> httpx.Response:
        seen.update(request.url.params)
        return httpx.Response(200, json=_photon("Cervejaria Ramiro", district="Arroios", city="Lisboa"))

    found = _run(handler, lambda c: places.find_venue("Cervejaria Ramiro", LISBON, c))
    assert found == Place("Cervejaria Ramiro", 38.71, -9.13, "Arroios")
    assert seen["q"] == "Cervejaria Ramiro"
    assert seen["lat"] == "38.72" and "bbox" in seen  # searched around the destination only


def test_find_venue_rejects_a_different_place_with_a_similar_name():
    def handler(_):
        return httpx.Response(200, json=_photon("Rua 28 de Setembro"))

    assert _run(handler, lambda c: places.find_venue("Tram 28", LISBON, c)) is False


def test_find_venue_not_found_and_lookup_down():
    assert _run(lambda _: httpx.Response(200, json={"features": []}), lambda c: places.find_venue("Café Lello", LISBON, c)) is False
    places._cache.clear()
    assert _run(lambda _: httpx.Response(502), lambda c: places.find_venue("Café Lello", LISBON, c)) is None


def test_lookups_are_cached():
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(200, json=_photon("Alfama", suburb="Alfama"))

    async def twice(c):
        await places.find_venue("Alfama", LISBON, c)
        return await places.find_venue("alfama ", LISBON, c)

    assert _run(handler, twice).area == "Alfama"
    assert len(calls) == 1


@pytest.mark.parametrize(
    ("props", "area"),
    [
        ({"locality": "Trastevere", "district": "Municipio Roma I", "city": "Roma"}, "Trastevere"),
        ({"locality": "Anjos", "district": "Arroios", "city": "Lisboa"}, "Anjos"),
        ({"locality": "神南一丁目", "district": "渋谷区", "city": "渋谷区"}, "渋谷区"),  # a block number is too fine
        ({"district": "Municipio Roma I", "city": "Roma"}, "Roma"),  # admin unit names mean nothing to travellers
        ({"suburb": "Le Marais", "district": "Paris 4e Arrondissement"}, "Le Marais"),
    ],
)
def test_neighbourhood_is_the_one_travellers_know(props, area):
    def handler(_):
        return httpx.Response(200, json=_photon("Taverna Trilussa", **props))

    assert _run(handler, lambda c: places.find_venue("Taverna Trilussa", LISBON, c)).area == area


def _features(*items):
    """items: (name, props) pairs, all at the same spot."""
    return {"features": [{"geometry": {"coordinates": [-122.44, 37.75]}, "properties": {"name": n, **p}} for n, p in items]}


def test_the_best_name_among_several_results_wins_and_infrastructure_is_skipped():
    seen = {}

    def handler(request):
        seen.update(request.url.params)
        return httpx.Response(200, json=_features(
            ("Twin Peaks Tunnel", {"osm_key": "man_made", "osm_value": "tunnel"}),
            ("Twin Peaks", {"osm_key": "place", "osm_value": "locality"}),
        ))

    found = _run(handler, lambda c: places.find_venue("Twin Peaks", LISBON, c))
    assert found.name == "Twin Peaks"
    assert int(seen["limit"]) >= 5


@pytest.mark.parametrize(("key", "value"), [("railway", "station"), ("public_transport", "platform"), ("highway", "bus_stop"), ("amenity", "parking"), ("aeroway", "aerodrome")])
def test_transport_infrastructure_never_counts_as_the_venue(key, value):
    def handler(_):
        return httpx.Response(200, json=_features(("Broadway", {"osm_key": key, "osm_value": value})))

    assert _run(handler, lambda c: places.find_venue("Broadway", LISBON, c)) is False


def test_alternative_names_after_a_semicolon_are_dropped():
    def handler(_):
        return httpx.Response(200, json=_features(("United States Capitol Visitor Center;U.S. Capitol Visitor Center", {"osm_key": "tourism"})))

    assert _run(handler, lambda c: places.find_venue("United States Capitol Visitor Center", LISBON, c)).name == "United States Capitol Visitor Center"


def test_search_radius_can_be_widened_for_car_trips():
    seen = {}

    def handler(request):
        seen.update(request.url.params)
        return httpx.Response(200, json={"features": []})

    _run(handler, lambda c: places.find_venue("Mesa Arch", LISBON, c, radius_deg=0.7))
    west, south, east, north = map(float, seen["bbox"].split(","))
    assert round(east - west, 2) == 1.4 and round(north - south, 2) == 1.4
