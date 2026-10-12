"""Rule checks for a planned day: things the AI gets wrong that code can catch reliably."""
from __future__ import annotations

import itertools
import math
import re
import unicodedata
from typing import TYPE_CHECKING

if TYPE_CHECKING:
    from .places import Place

# ---------------------------------------------------------------- times

_LATE_START_PHRASES = re.compile(
    r"early mornings?|sleep(ing)? in|lie[- ]in|late risers?|late starts?|not (a )?morning (person|people)|"
    r"not morning (person|people)|hate mornings|no early",
    re.IGNORECASE,
)
_NOT_BEFORE = re.compile(
    r"(?:not before|nothing before|no earlier than|after|start(?:ing)?(?: the day)? (?:at|around|after)?)\s*"
    r"(\d{1,2})(?:[:.](\d{2}))?\s*(am|a\.m\.)?\b",
    re.IGNORECASE,
)
LATE_START = "10:00"


def earliest_start(notes: str | None) -> str | None:
    """Earliest time ("HH:MM") the travellers want to start, read from their notes, or None."""
    if not notes:
        return None
    m = _NOT_BEFORE.search(notes)
    if m and 5 <= int(m.group(1)) <= 14:
        return f"{int(m.group(1)):02d}:{m.group(2) or '00'}"
    return LATE_START if _LATE_START_PHRASES.search(notes) else None


_TIME = re.compile(r"^\s*(\d{1,2}):(\d{2})\s*([ap]\.?m\.?)?\s*$", re.IGNORECASE)


def parse_time(raw: str) -> int | None:
    """Minutes after midnight for "09:30", "9:30 AM" or "1:15 pm"; None if unreadable."""
    m = _TIME.match(raw or "")
    if not m:
        return None
    hour, minute, ampm = int(m.group(1)), int(m.group(2)), (m.group(3) or "").lower()
    if ampm.startswith("p") and hour < 12:
        hour += 12
    elif ampm.startswith("a") and hour == 12:
        hour = 0
    return hour * 60 + minute if hour < 24 and minute < 60 else None


def too_early(times: list[str], earliest: str | None) -> list[int]:
    """Indexes of items scheduled before the earliest allowed start."""
    limit = parse_time(earliest) if earliest else None
    if limit is None:
        return []
    return [i for i, t in enumerate(times) if (m := parse_time(t)) is not None and m < limit]


# ---------------------------------------------------------------- names

# Words that say what kind of place it is rather than which one, so they don't identify a venue.
_GENERIC = {
    "a", "an", "the", "of", "and", "at", "in", "on", "de", "da", "do", "das", "dos", "di", "del", "della", "du", "des",
    "la", "le", "les", "el", "los", "las", "il", "lo", "y", "e", "et", "und", "der", "die", "das", "von",
    "cafe", "coffee", "bar", "restaurant", "restaurante", "ristorante", "bistro", "pastelaria", "padaria", "bakery",
    "cervejaria", "taberna", "tasca", "trattoria", "pizzeria", "brasserie", "market", "mercado", "museum", "museu",
    "museo", "musee", "church", "igreja", "iglesia", "chiesa", "mosteiro", "monastery", "monasterio", "cathedral",
    "se", "palace", "palacio", "palazzo", "castle", "castelo", "castillo", "park", "parque", "garden", "gardens",
    "jardim", "jardin", "square", "praca", "plaza", "piazza", "street", "rua", "calle", "via", "tram", "bus", "route",
    "tour", "hotel", "hostel", "club", "clube", "house", "casa", "shop", "store", "station", "estacao", "viewpoint",
    "miradouro", "beach", "praia", "playa", "tower", "torre", "bridge", "ponte", "gallery", "galeria",
    "music", "nightclub", "lounge", "pub", "tavern", "grill", "kitchen", "diner", "eatery", "cafeteria",
}

_POSSESSIVE = re.compile(r"['’]s\b")


def _fold(text: str) -> str:
    """Lowercase, accents removed, possessives joined ("Giordano’s" -> "giordanos"), punctuation turned into spaces."""
    text = _POSSESSIVE.sub("s", text)  # before the ascii step, which would drop the curly apostrophe
    text = unicodedata.normalize("NFKD", text).encode("ascii", "ignore").decode().lower()
    return " ".join(re.sub(r"[^a-z0-9]+", " ", text).split())


def name_tokens(text: str) -> set[str]:
    return set(_fold(text).split())


def _distinctive(text: str, ignore: set[str] = frozenset()) -> list[str]:
    """The identifying words of a name, in order (no "café", "museum", "de"...)."""
    return [t for t in _fold(text).split() if t not in _GENERIC and t not in ignore]


def place_key(location: str) -> str:
    """Comparable key for a venue: the name part of "Venue, Neighbourhood", folded."""
    return _fold(location.split(",")[0])


def venue_key(location: str) -> frozenset[str] | str:
    """Identity of a venue for spotting repeats: "The Spotted Cat Music Club" and "The Spotted Cat" are one place,
    "Pike Place Market" and "Pike Place Chowder" are two."""
    words = _distinctive(location.split(",")[0])
    return frozenset(words) if words else place_key(location)


def repeats(locations: list[str], earlier: list[str]) -> list[int]:
    """Indexes of venues already used earlier in the trip or earlier the same day."""
    seen = {venue_key(loc) for loc in earlier}
    out = []
    for i, loc in enumerate(locations):
        key = venue_key(loc)
        if key and key in seen:
            out.append(i)
        seen.add(key)
    return out


def name_match(asked: str, found: str, ignore: set[str] = frozenset()) -> int:
    """How well the map's name matches the venue the AI asked for: 0 not the same place; 1 the map has the
    brand and the AI named a branch ("Sarabeth's Central Park South" vs "Sarabeth's"); 2 the map's name adds a
    little ("Time Out Market" vs "Time Out Market Lisboa"); 3 the same name.

    "Pastelaria São Roque" is not "Pastelaria São Jorge"; "Tram 28" is not "Rua 28 de Setembro".
    """
    a_words = _distinctive(asked, ignore)
    a, f = set(a_words), set(_distinctive(found, ignore))
    if not a or not f:
        # Only generic words ("Tasca" alone): the whole names must agree.
        return 3 if name_tokens(asked) - ignore == name_tokens(found) - ignore else 0
    if a == f:
        return 3
    if a <= f and len(a) / len(f) > 0.5:
        return 2
    if f < a and a_words[0] in f:
        return 1
    return 0


def same_place_name(asked: str, found: str, ignore: set[str] = frozenset()) -> bool:
    return name_match(asked, found, ignore) > 0


# ---------------------------------------------------------------- meals and transfers

_MEAL = re.compile(r"\b(breakfast|brunch|lunch|dinner|supper)\b", re.IGNORECASE)
_MEAL_HOURS = {"breakfast": (6 * 60, 11 * 60 + 30), "lunch": (11 * 60, 15 * 60 + 30), "dinner": (16 * 60 + 30, 23 * 60 + 30)}
_FOOD = re.compile(
    r"\b(lunch|brunch|restaurant|bbq|barbecue|pizza|tacos?|burgers?|sandwich(es)?|noodles?|ramen|sushi|"
    r"seafood|chicken|deli|bistro|trattoria|eat|food hall|food court)\b",
    re.IGNORECASE,
)


def odd_meal_time(time: str, title: str) -> str | None:
    """A message if a meal is at a time nobody eats it ("Dinner" at 13:30), else None."""
    m, minutes = _MEAL.search(title), parse_time(time)
    if not m or minutes is None:
        return None
    meal = m.group(1).lower().replace("supper", "dinner")
    if meal == "brunch":
        return None
    start, end = _MEAL_HOURS[meal]
    return None if start <= minutes <= end else f'"{title}" at {time}: that is not a time for {meal}.'


def missing_lunch(items: list[tuple[str, str, str]]) -> bool:
    """(time, title, description) items: does a day that runs through midday have no lunch?"""
    times = [parse_time(t) for t, _, _ in items]
    known = [m for m in times if m is not None]
    if not known or min(known) > 11 * 60 or max(known) < 15 * 60:
        return False  # the day doesn't span lunchtime
    for (_, title, desc), m in zip(items, times):
        if m is not None and 11 * 60 <= m <= 15 * 60 and _FOOD.search(f"{title} {desc}"):
            return False
    return True


GAP_MINUTES = 210  # 3.5 hours with nothing planned


def gaps(times: list[str]) -> list[tuple[str, str]]:
    """Long empty stretches during the day (evenings are allowed to end early)."""
    out = []
    for a, b in zip(times, times[1:]):
        ma, mb = parse_time(a), parse_time(b)
        if ma is not None and mb is not None and mb - ma > GAP_MINUTES and ma < 17 * 60:
            out.append((a, b))
    return out


_TRANSFER = re.compile(
    r"\b(departures?|depart|transfer to|drive to (the )?airport|head(ing)? to (the )?airport|airport transfer|"
    r"fly home|flight home|return the (rental )?car)\b",
    re.IGNORECASE,
)
_AIRPORT = re.compile(r"\bairport\b|\bLAX\b|\bJFK\b", re.IGNORECASE)


def is_transfer(title: str, location: str) -> bool:
    """Getting to the airport or station to leave: not a stop worth planning."""
    return bool(_TRANSFER.search(title) or _AIRPORT.search(f"{title} {location}"))


# ---------------------------------------------------------------- route


def km(a: "Place", b: "Place") -> float:
    """Straight-line distance in km."""
    la1, lo1, la2, lo2 = map(math.radians, (a.lat, a.lon, b.lat, b.lon))
    h = math.sin((la2 - la1) / 2) ** 2 + math.cos(la1) * math.cos(la2) * math.sin((lo2 - lo1) / 2) ** 2
    return 6371 * 2 * math.asin(math.sqrt(h))


def _length(stops: list["Place"]) -> float:
    return sum(km(a, b) for a, b in zip(stops, stops[1:]))


def route_lengths(stops: list["Place | None"]) -> tuple[float, float]:
    """(km in the planned order, km in the shortest order that keeps the same first stop)."""
    known = [s for s in stops if s is not None]
    if len(known) < 3 or len(known) > 8:
        return _length(known), _length(known)
    first, rest = known[0], known[1:]
    best = min(_length([first, *order]) for order in itertools.permutations(rest))
    return _length(known), best


ISOLATED_KM = 12


ISOLATED_KM_BY_CAR = 60
ZIGZAG_EXTRA_KM = 4
ZIGZAG_EXTRA_KM_BY_CAR = 25


def isolated(stops: list["Place | None"], by_car: bool = False) -> list["Place"]:
    """Stops far from every other stop of the day, like dinner 25 km out of town after a day in the centre.
    A day trip (several stops out there) is fine, and so are longer drives on a car trip."""
    known = [s for s in stops if s is not None]
    if len(known) < 3:
        return []
    limit = ISOLATED_KM_BY_CAR if by_car else ISOLATED_KM
    return [s for s in known if all(km(s, o) > limit for o in known if o is not s)]


def zigzags(stops: list["Place | None"], by_car: bool = False) -> bool:
    """True when the day sends travellers back and forth: a different order would be much shorter."""
    actual, best = route_lengths(stops)
    return actual > 1.5 * best and actual - best > (ZIGZAG_EXTRA_KM_BY_CAR if by_car else ZIGZAG_EXTRA_KM)
