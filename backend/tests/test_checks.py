import pytest

from app import checks
from app.places import Place


@pytest.mark.parametrize(
    ("notes", "expected"),
    [
        ("We hate early mornings.", "10:00"),
        ("we like to sleep in", "10:00"),
        ("Not morning people at all", "10:00"),
        ("Nothing before 11am please", "11:00"),
        ("no earlier than 9:30", "09:30"),
        ("start the day after 10.30", "10:30"),
        ("We love sunrise hikes", None),
        ("", None),
        (None, None),
    ],
)
def test_earliest_start_reads_the_travellers_notes(notes, expected):
    assert checks.earliest_start(notes) == expected


@pytest.mark.parametrize(
    ("raw", "minutes"),
    [("09:30", 570), ("9:30", 570), ("9:30 AM", 570), ("1:15 pm", 795), ("12:00 PM", 720), ("12:30 am", 30), ("noon", None), ("", None)],
)
def test_parse_time(raw, minutes):
    assert checks.parse_time(raw) == minutes


def test_too_early_lists_items_before_the_earliest_start():
    assert checks.too_early(["08:30", "10:00", "11:00"], "10:00") == [0]
    assert checks.too_early(["10:00", "bad"], "10:00") == []
    assert checks.too_early(["07:00"], None) == []


@pytest.mark.parametrize(
    ("location", "key"),
    [
        ("Cervejaria Ramiro, Campo de Ourique", "cervejaria ramiro"),
        ("Pastéis de Belém, Belém", "pasteis de belem"),
        ("  Time Out Market  ", "time out market"),
    ],
)
def test_place_key(location, key):
    assert checks.place_key(location) == key


def test_repeats_are_found_within_the_day_and_against_earlier_days():
    today = ["Cervejaria Ramiro, Arroios", "Alfama, Lisbon", "cervejaria ramiro, Chiado", "Torre de Belém, Belém"]
    assert checks.repeats(today, earlier=["Torre de Belem, Belem"]) == [2, 3]


def test_the_same_venue_under_a_longer_name_is_a_repeat():
    assert checks.repeats(["The Spotted Cat, Marigny"], earlier=["The Spotted Cat Music Club, French Quarter"]) == [0]


def test_different_venues_sharing_words_are_not_repeats():
    assert checks.repeats(["Pike Place Chowder, Downtown"], earlier=["Pike Place Market, Downtown"]) == []


@pytest.mark.parametrize(
    ("asked", "found", "same"),
    [
        ("Cervejaria Ramiro", "Cervejaria Ramiro", True),
        ("Marisqueira Uma", "Uma Marisqueira", True),
        ("Time Out Market", "Time Out Market Lisboa", True),
        ("Mosteiro de São Vicente de Fora", "Igreja de São Vicente de Fora", True),
        ("Clube de Fado", "Clube de Fado", True),
        ("Pastelaria São Roque", "Pastelaria São Jorge", False),
        ("Tram 28", "Rua 28 de Setembro", False),
        ("Café Lello", "Café Lisboa", False),
        ("Giordano’s", "Giordano's", True),
        ("Sarabeth's Central Park South", "Sarabeth's", True),  # a branch of the map's venue
        ("Twin Peaks", "Twin Peaks Tunnel", True),  # same words: the type check in places.py rules the tunnel out
        ("Lou Malnati’s", "Lou Malnati's Pizzeria", True),
        ("Central Park South", "Sarabeth's", False),
    ],
)
def test_same_place_name(asked, found, same):
    assert checks.same_place_name(asked, found, ignore={"lisboa", "lisbon"}) is same


def _p(name: str, lat: float, lon: float) -> Place:
    return Place(name=name, lat=lat, lon=lon, area="")


def test_zigzag_is_flagged_when_a_better_order_is_much_shorter():
    # Belém (west) -> Alfama (east) -> Belém again -> Alfama again: ~8 km each way.
    belem, alfama = (38.6916, -9.2160), (38.7114, -9.1300)
    stops = [_p("A", *belem), _p("B", *alfama), _p("C", *belem), _p("D", *alfama)]
    actual, best = checks.route_lengths(stops)
    assert best < 9 and actual > 20
    assert checks.zigzags(stops)


def test_a_sensible_route_is_not_flagged():
    stops = [_p("A", 38.6916, -9.2160), _p("B", 38.6970, -9.2060), _p("C", 38.7114, -9.1300), _p("D", 38.7130, -9.1290)]
    assert not checks.zigzags(stops)


def test_route_check_skips_unknown_stops():
    assert not checks.zigzags([_p("A", 38.69, -9.21), None, _p("B", 38.71, -9.13)])


def test_a_lone_far_away_stop_is_flagged():
    alfama, sintra = (38.7114, -9.1300), (38.7976, -9.3900)
    stops = [_p("A", *alfama), _p("B", 38.7130, -9.1290), _p("C", 38.7100, -9.1350), _p("Dinner", *sintra)]
    assert [s.name for s in checks.isolated(stops)] == ["Dinner"]


def test_a_day_trip_with_several_stops_out_of_town_is_fine():
    alfama, sintra = (38.7114, -9.1300), (38.7976, -9.3900)
    stops = [_p("A", *alfama), _p("Palace", *sintra), _p("Lunch", 38.7980, -9.3890), _p("Dinner", 38.7120, -9.1310)]
    assert checks.isolated(stops) == []


def test_name_match_prefers_the_exact_name():
    assert checks.name_match("Twin Peaks", "Twin Peaks") > checks.name_match("Twin Peaks", "Twin Peaks Tunnel") > 0
    assert checks.name_match("Sarabeth's Central Park South", "Sarabeth's") > 0
    assert checks.name_match("Pastelaria São Roque", "Pastelaria São Jorge") == 0


@pytest.mark.parametrize(
    ("time", "title", "wrong"),
    [
        ("13:30", "Early Dinner at The Pink Door", True),
        ("15:30", "Farewell Dinner", True),
        ("18:00", "Dinner at The Purple Pig", False),
        ("12:30", "Breakfast at Lou Mitchell's", True),
        ("10:30", "Brunch at Zazie", False),
        ("12:30", "Lunch at Roscioli", False),
        ("16:30", "Lunch at Roscioli", True),
        ("09:00", "Lunch at Roscioli", True),
        ("14:00", "Visit the Pantheon", False),
    ],
)
def test_meals_at_odd_times(time, title, wrong):
    assert bool(checks.odd_meal_time(time, title)) is wrong


def test_a_full_day_without_lunch_is_flagged():
    no_lunch = [("09:30", "Breakfast at Biscuit Love", ""), ("11:00", "Museum", ""), ("15:00", "Park walk", ""), ("19:00", "Dinner", "")]
    with_lunch = [("09:30", "Breakfast", ""), ("12:30", "Hot chicken at Hattie B's", "Spicy fried chicken lunch"), ("19:00", "Dinner", "")]
    short_day = [("15:00", "Arrive and stroll", ""), ("19:00", "Dinner", "")]
    assert checks.missing_lunch(no_lunch)
    assert not checks.missing_lunch(with_lunch)
    assert not checks.missing_lunch(short_day)


@pytest.mark.parametrize(
    ("title", "location", "transfer"),
    [
        ("Transfer to Nashville International Airport", "Nashville International Airport, Nashville", True),
        ("Departure from Sedona Airport", "Sedona Airport", True),
        ("Departure from Union Station", "Union Station, NoMa", True),
        ("Drive to LAX for Departure", "Los Angeles International Airport", True),
        ("Visit Union Station's Great Hall", "Union Station, Chicago", False),
        ("Dinner at Le Bernardin", "Le Bernardin, Midtown", False),
    ],
)
def test_airport_and_departure_items_are_recognised(title, location, transfer):
    assert checks.is_transfer(title, location) is transfer


def test_car_trips_allow_bigger_distances():
    town, park = (38.5733, -109.5498), (38.6167, -109.6200)  # Moab and an Arches trailhead, ~8 km
    far = (38.4590, -109.8210)  # Canyonlands, ~27 km
    stops = [_p("A", *town), _p("B", *town), _p("C", *park), _p("D", *far)]
    assert checks.isolated(stops)  # on foot / transit
    assert not checks.isolated(stops, by_car=True)
    zig = [_p("A", *town), _p("B", *far), _p("C", *town), _p("D", *far)]
    assert checks.zigzags(zig) and checks.zigzags(zig, by_car=True)
    mild = [_p("A", *town), _p("B", *park), _p("C", *town), _p("D", *park)]
    assert checks.zigzags(mild) and not checks.zigzags(mild, by_car=True)


def test_long_empty_stretches_in_the_day():
    assert checks.gaps(["10:00", "12:00", "18:30"]) == [("12:00", "18:30")]
    assert checks.gaps(["10:00", "12:30", "15:00", "18:30"]) == []
    assert checks.gaps(["18:00", "23:00"]) == []  # evenings end when they end
    assert checks.gaps(["09:00", "bad", "18:00"]) == []
