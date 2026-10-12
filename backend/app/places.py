"""Map lookups (OpenStreetMap data): is the destination real, and does each suggested venue exist there?"""
from __future__ import annotations

import os
import re
from dataclasses import dataclass

import httpx

from .checks import name_match, name_tokens

DESTINATION_SEARCH_URL = os.getenv("PLACE_SEARCH_URL", "https://nominatim.openstreetmap.org/search")
VENUE_SEARCH_URL = os.getenv("VENUE_SEARCH_URL", "https://photon.komoot.io/api/")
# OpenStreetMap services ask for an identifying User-Agent.
HEADERS = {"User-Agent": "Voyage trip planner (https://gauravmishraofficial.github.io)"}
# Venues are searched within this many degrees (~30 km) of the destination, so day trips still count.
VENUE_RADIUS_DEG = 0.3
VENUE_RADIUS_DEG_BY_CAR = 0.7  # ~75 km: national parks and scenic drives


@dataclass(frozen=True)
class Place:
    name: str
    lat: float
    lon: float
    area: str  # neighbourhood for a venue, full display name for a destination


# key -> Place (found) or False (not found). Failed lookups are not cached.
_cache: dict[tuple, Place | bool] = {}


def _clean(name: str) -> str:
    return " ".join(name.split())


async def _get(client: httpx.AsyncClient | None, url: str, params: dict) -> object:
    if client is None:
        async with httpx.AsyncClient(timeout=8.0) as c:
            return await _get(c, url, params)
    res = await client.get(url, params=params, headers=HEADERS)
    res.raise_for_status()
    return res.json()


async def find_destination(name: str, client: httpx.AsyncClient | None = None) -> Place | bool | None:
    """The destination as a Place, False if the map doesn't know it, None if the lookup itself failed.

    Without this the AI happily invents a full itinerary for a typo like "dsfafD".
    """
    query = _clean(name)
    key = ("dest", query.casefold())
    if key in _cache:
        return _cache[key]
    try:
        results = await _get(client, DESTINATION_SEARCH_URL, {"q": query, "format": "jsonv2", "limit": 1})
        found: Place | bool = False
        if results:
            r = results[0]
            found = Place(name=r.get("name") or query, lat=float(r["lat"]), lon=float(r["lon"]), area=r.get("display_name", ""))
    except (httpx.HTTPError, ValueError, KeyError, TypeError):
        return None
    _cache[key] = found
    return found


_ADMIN_UNIT = re.compile(r"\d|丁目|^(municipio|municipality|arrondissement|bezirk|distrito)\b", re.IGNORECASE)


def _neighbourhood(props: dict) -> str:
    """The most specific area name a traveller would recognise: "Trastevere", not "Municipio Roma I" or a block number."""
    for field in ("locality", "suburb", "district"):
        value = (props.get(field) or "").strip()
        if value and not _ADMIN_UNIT.search(value):
            return value
    return props.get("city") or ""


# Map features that are never what a traveller means: "Twin Peaks" is not the Twin Peaks Tunnel.
_INFRASTRUCTURE = {
    "railway": None,
    "public_transport": None,
    "aeroway": None,
    "highway": {"bus_stop", "platform", "motorway_junction", "elevator"},
    "amenity": {"parking", "parking_entrance", "bus_station", "taxi", "car_rental", "fuel"},
    "man_made": {"tunnel", "works", "wastewater_plant", "storage_tank", "mast"},
}
CANDIDATES = 6


def _is_infrastructure(props: dict) -> bool:
    key = props.get("osm_key")
    if key not in _INFRASTRUCTURE:
        return False
    values = _INFRASTRUCTURE[key]
    return values is None or props.get("osm_value") in values


async def find_venue(
    name: str, near: Place, client: httpx.AsyncClient | None = None, radius_deg: float = VENUE_RADIUS_DEG
) -> Place | bool | None:
    """The venue as it appears on the map (real name + neighbourhood), False if there is no such place
    near the destination, None if the lookup itself failed."""
    query = _clean(name)
    key = ("venue", query.casefold(), round(near.lat, 2), round(near.lon, 2), radius_deg)
    if key in _cache:
        return _cache[key]
    r = radius_deg
    params = {
        "q": query,
        "lat": near.lat,
        "lon": near.lon,
        "limit": CANDIDATES,
        "bbox": f"{near.lon - r},{near.lat - r},{near.lon + r},{near.lat + r}",
    }
    try:
        features = (await _get(client, VENUE_SEARCH_URL, params)).get("features") or []
        found: Place | bool = False
        best = 0
        for feature in features:
            props = feature.get("properties", {})
            # OSM lists alternative names after ";" ("United States Capitol Visitor Center;U.S. Capitol Visitor Center").
            map_name = (props.get("name") or "").split(";")[0].strip()
            if not map_name or _is_infrastructure(props):
                continue
            # The city's own name is noise when comparing ("Time Out Market" vs "Time Out Market Lisboa").
            ignore = name_tokens(near.name) | name_tokens(props.get("city", ""))
            score = name_match(query, map_name, ignore=ignore)
            if score > best:  # results come most relevant first: only a better name match replaces one
                lon, lat = feature["geometry"]["coordinates"][:2]
                found, best = Place(name=map_name, lat=float(lat), lon=float(lon), area=_neighbourhood(props)), score
    except (httpx.HTTPError, ValueError, KeyError, TypeError, AttributeError):
        return None
    _cache[key] = found
    return found
