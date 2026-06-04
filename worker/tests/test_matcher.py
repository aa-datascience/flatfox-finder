from datetime import datetime, timezone

import psycopg2
import pytest

from flatfox_worker.matcher import (
    ListingWithAttrs,
    Profile,
    compute_match,
    date_score,
    layer2_score,
    location_score,
    price_score,
    rooms_score,
    run_matching,
)

TEST_DB_URL = "postgresql://postgres:postgres@localhost:5432/studenthousing"


def _profile(**overrides) -> Profile:
    defaults = dict(
        user_id="u1",
        budget_max=1500,
        rooms_min=2.0,
        cities=["Zürich"],
        radius_km=10,
        move_in_from=datetime(2026, 8, 1, tzinfo=timezone.utc),
        move_in_flexible=True,
        languages=["de", "en"],
        vibe="quiet",
        pets_ok=False,
        smoking_ok=False,
        gender_pref="any",
    )
    defaults.update(overrides)
    return Profile(**defaults)


def _listing(**overrides) -> ListingWithAttrs:
    defaults = dict(
        id=1,
        slug="test",
        url="/en/flat/test",
        city="Zürich",
        rent_gross=1200.0,
        number_of_rooms=2.5,
        moving_date=datetime(2026, 8, 1, tzinfo=timezone.utc),
        lat=47.3769,
        lng=8.5417,
        public_title="Nice flat",
        vibe="quiet",
        languages=["de"],
        pets=False,
        smoking=False,
        gender_pref="any",
    )
    defaults.update(overrides)
    return ListingWithAttrs(**defaults)


# === Layer 1: Price ===

class TestPriceScore:
    def test_under_budget(self):
        score, _ = price_score(1000, 1500)
        assert score == 1.0

    def test_at_budget(self):
        score, _ = price_score(1500, 1500)
        assert score == 1.0

    def test_over_budget_within_130(self):
        score, _ = price_score(1800, 1500)
        assert 0 < score < 1

    def test_over_budget_at_130(self):
        score, _ = price_score(1950, 1500)
        assert score == pytest.approx(0.0, abs=0.01)

    def test_over_budget_hard_cut(self):
        score, _ = price_score(2000, 1500)
        assert score == 0.0

    def test_none_rent(self):
        score, _ = price_score(None, 1500)
        assert score == 0.5

    def test_none_budget(self):
        score, _ = price_score(1200, None)
        assert score == 0.5


# === Layer 1: Location ===

class TestLocationScore:
    def test_exact_city_match(self):
        score, _ = location_score(47.3769, 8.5417, "Zürich", ["Zürich"], 10)
        assert score == 1.0

    def test_within_radius(self):
        # Winterthur is ~25km from Zürich center
        score, _ = location_score(47.5001, 8.7240, "Winterthur", ["Zürich"], 30)
        assert score == 1.0

    def test_outside_radius_within_2x(self):
        # ~25km away, radius=15 → between 1x and 2x
        score, _ = location_score(47.5001, 8.7240, "Winterthur", ["Zürich"], 15)
        assert 0 < score < 1

    def test_hard_cut_beyond_2x(self):
        # ~25km away, radius=5 → over 2x
        score, _ = location_score(47.5001, 8.7240, "Winterthur", ["Zürich"], 5)
        assert score == 0.0

    def test_no_preference(self):
        score, _ = location_score(47.3769, 8.5417, "Zürich", [], 10)
        assert score == 0.5

    def test_city_name_fallback(self):
        score, _ = location_score(None, None, "Zürich", ["Zürich"], 10)
        assert score == 1.0


# === Layer 1: Rooms ===

class TestRoomsScore:
    def test_meets_minimum(self):
        score, _ = rooms_score(3.0, 2.0)
        assert score == 1.0

    def test_half_room_off(self):
        score, _ = rooms_score(1.5, 2.0)
        assert score == 0.5

    def test_more_than_half_off(self):
        score, _ = rooms_score(1.0, 2.0)
        assert score == 0.0

    def test_none_rooms(self):
        score, _ = rooms_score(None, 2.0)
        assert score == 0.5


# === Layer 1: Date ===

class TestDateScore:
    def test_exact_match(self):
        d = datetime(2026, 8, 1, tzinfo=timezone.utc)
        score, _ = date_score(d, d, False)
        assert score == 1.0

    def test_within_14_days(self):
        d1 = datetime(2026, 8, 1, tzinfo=timezone.utc)
        d2 = datetime(2026, 8, 10, tzinfo=timezone.utc)
        score, _ = date_score(d1, d2, False)
        assert score == 1.0

    def test_within_30_days_flexible(self):
        d1 = datetime(2026, 8, 1, tzinfo=timezone.utc)
        d2 = datetime(2026, 8, 25, tzinfo=timezone.utc)
        score, _ = date_score(d1, d2, True)
        assert score == 1.0

    def test_within_30_days_not_flexible(self):
        d1 = datetime(2026, 8, 1, tzinfo=timezone.utc)
        d2 = datetime(2026, 8, 25, tzinfo=timezone.utc)
        score, _ = date_score(d1, d2, False)
        assert score == 0.5

    def test_over_30_days(self):
        d1 = datetime(2026, 8, 1, tzinfo=timezone.utc)
        d2 = datetime(2026, 10, 1, tzinfo=timezone.utc)
        score, _ = date_score(d1, d2, True)
        assert score == 0.0


# === Layer 2: Text attributes ===

class TestLayer2:
    def test_all_match(self):
        p = _profile(vibe="quiet", languages=["de"], pets_ok=False, smoking_ok=False, gender_pref="any")
        l = _listing(vibe="quiet", languages=["de"], pets=False, smoking=False, gender_pref="any")
        score, reasons = layer2_score(p, l)
        assert score == 1.0

    def test_all_conflict(self):
        p = _profile(vibe="quiet", pets_ok=True, smoking_ok=True)
        l = _listing(vibe="social", pets=False, smoking=False, languages=[], gender_pref=None)
        score, _ = layer2_score(p, l)
        assert score == 0.0

    def test_mixed_vibe_no_conflict(self):
        p = _profile(vibe="quiet")
        l = _listing(vibe="mixed", languages=[], pets=None, smoking=None, gender_pref=None)
        score, _ = layer2_score(p, l)
        assert score >= 0.5

    def test_all_null(self):
        p = _profile(vibe=None, languages=[], pets_ok=None, smoking_ok=None, gender_pref=None)
        l = _listing(vibe=None, languages=[], pets=None, smoking=None, gender_pref=None)
        score, _ = layer2_score(p, l)
        assert score == 0.5


# === Full match ===

class TestComputeMatch:
    def test_perfect_match(self):
        result = compute_match(_profile(), _listing())
        assert result is not None
        assert result["score"] >= 0.8

    def test_below_threshold(self):
        result = compute_match(
            _profile(budget_max=500, vibe="quiet", pets_ok=False, smoking_ok=False),
            _listing(
                rent_gross=2000, city="Lugano", lat=46.0, lng=8.95,
                vibe="social", pets=True, smoking=True, gender_pref=None,
                languages=[],
            ),
        )
        assert result is None

    def test_score_breakdown_keys(self):
        result = compute_match(_profile(), _listing())
        assert result is not None
        bd = result["score_breakdown"]
        assert all(k in bd for k in ["l1", "l2", "price", "location", "rooms", "date"])

    def test_rationale_contains_info(self):
        result = compute_match(_profile(), _listing())
        assert result is not None
        assert "Budget" in result["rationale"]
        assert "Location" in result["rationale"]

    def test_listing_snapshot(self):
        result = compute_match(_profile(), _listing(public_title="Great flat", city="Zürich", rent_gross=1200))
        assert result is not None
        assert result["listing_snapshot"]["title"] == "Great flat"
        assert result["listing_snapshot"]["city"] == "Zürich"


# === Integration: run_matching ===

def _clean_tables():
    conn = psycopg2.connect(TEST_DB_URL)
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM messages")
            cur.execute("DELETE FROM matches")
            cur.execute("DELETE FROM listing_attributes")
            cur.execute("DELETE FROM listings")
            cur.execute("DELETE FROM user_profiles")
            cur.execute("DELETE FROM users")
        conn.commit()
    finally:
        conn.close()


def _insert_user_and_profile():
    conn = psycopg2.connect(TEST_DB_URL)
    try:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO users (id, email, password_hash, name)
                   VALUES ('00000000-0000-0000-0000-000000000001', 'test@test.com', 'hash', 'Test')"""
            )
            cur.execute(
                """INSERT INTO user_profiles (id, user_id, budget_max, rooms_min, cities,
                   radius_km, move_in_from, move_in_flexible, languages, vibe, pets_ok, smoking_ok, updated_at)
                   VALUES ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000001',
                   1500, 2.0, '{Zürich}', 10, '2026-08-01', true, '{de,en}', 'quiet', false, false, NOW())"""
            )
        conn.commit()
    finally:
        conn.close()


def _insert_listing_row(pk: int, city: str = "Zürich", rent_gross: float = 1200):
    conn = psycopg2.connect(TEST_DB_URL)
    try:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO listings (id, slug, url, status, offer_type, object_category,
                   city, rent_gross, number_of_rooms, lat, lng, public_title, fetched_at)
                   VALUES (%s, %s, %s, 'active', 'RENT', 'APARTMENT', %s, %s, 2.5,
                   47.3769, 8.5417, 'Test listing', NOW())""",
                (pk, f"listing-{pk}", f"/en/flat/{pk}", city, rent_gross),
            )
        conn.commit()
    finally:
        conn.close()


def _count_matches() -> int:
    conn = psycopg2.connect(TEST_DB_URL)
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM matches")
            return cur.fetchone()[0]
    finally:
        conn.close()


@pytest.fixture(autouse=True)
def clean_db():
    _clean_tables()
    yield
    _clean_tables()


class TestRunMatching:
    def test_creates_matches(self):
        _insert_user_and_profile()
        _insert_listing_row(1)
        _insert_listing_row(2)

        count = run_matching(database_url=TEST_DB_URL)
        assert count == 2
        assert _count_matches() == 2

    def test_skips_existing_matches(self):
        _insert_user_and_profile()
        _insert_listing_row(1)

        run_matching(database_url=TEST_DB_URL)
        count = run_matching(database_url=TEST_DB_URL)
        assert count == 0
        assert _count_matches() == 1

    def test_no_profiles(self):
        _insert_listing_row(1)
        count = run_matching(database_url=TEST_DB_URL)
        assert count == 0

    def test_no_listings(self):
        _insert_user_and_profile()
        count = run_matching(database_url=TEST_DB_URL)
        assert count == 0
