from datetime import datetime, timedelta, timezone

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

    def test_over_budget_smooth_midrange(self):
        # Halfway between budget and ceiling — quadratic decay puts it at 0.75
        score, _ = price_score(1500 + (1500 * 0.3) / 2, 1500)
        assert score == pytest.approx(0.75, abs=0.01)

    def test_at_ceiling(self):
        score, _ = price_score(1500 * 1.3, 1500)
        assert score == pytest.approx(0.0, abs=1e-6)

    def test_above_ceiling_clamps_to_zero(self):
        score, _ = price_score(2000, 1500)
        assert score == 0.0

    def test_none_rent_is_absent(self):
        score, _ = price_score(None, 1500)
        assert score is None

    def test_none_budget_is_absent(self):
        score, _ = price_score(1200, None)
        assert score is None


# === Layer 1: Location ===

class TestLocationScore:
    def test_exact_city_match(self):
        score, _ = location_score(47.3769, 8.5417, "Zürich", ["Zürich"], 10)
        assert score == 1.0

    def test_within_radius(self):
        # Winterthur is ~25km from Zürich center
        score, _ = location_score(47.5001, 8.7240, "Winterthur", ["Zürich"], 30)
        assert score == 1.0

    def test_outside_radius_within_ceiling(self):
        # ~25km away, radius=15 → between ideal and ceiling (30)
        score, _ = location_score(47.5001, 8.7240, "Winterthur", ["Zürich"], 15)
        assert 0 < score < 1

    def test_no_preference_is_absent(self):
        score, _ = location_score(47.3769, 8.5417, "Zürich", [], 10)
        assert score is None

    def test_city_name_fallback(self):
        score, _ = location_score(None, None, "Zürich", ["Zürich"], 10)
        assert score == 1.0


# === Layer 1: Rooms ===

class TestRoomsScore:
    def test_meets_minimum(self):
        score, _ = rooms_score(3.0, 2.0)
        assert score == 1.0

    def test_half_room_off(self):
        # deficit 0.5, tolerance 1.0 → 1 - 0.25 = 0.75
        score, _ = rooms_score(1.5, 2.0)
        assert score == pytest.approx(0.75, abs=1e-6)

    def test_full_room_off(self):
        # deficit 1.0, tolerance 1.0 → 0.0
        score, _ = rooms_score(1.0, 2.0)
        assert score == pytest.approx(0.0, abs=1e-6)

    def test_none_rooms_is_absent(self):
        score, _ = rooms_score(None, 2.0)
        assert score is None


# === Layer 1: Date ===

class TestDateScore:
    def test_exact_match(self):
        d = datetime(2026, 8, 1, tzinfo=timezone.utc)
        score, _ = date_score(d, d, False)
        assert score == 1.0

    def test_early_within_grace(self):
        target = datetime(2026, 8, 1, tzinfo=timezone.utc)
        listing = target - timedelta(days=20)
        score, _ = date_score(listing, target, False)
        assert score == 1.0

    def test_late_within_grace_flexible(self):
        target = datetime(2026, 8, 1, tzinfo=timezone.utc)
        listing = target + timedelta(days=14)
        score, _ = date_score(listing, target, True)
        assert score == 1.0

    def test_early_vs_late_asymmetric(self):
        target = datetime(2026, 8, 1, tzinfo=timezone.utc)
        early = target - timedelta(days=60)
        late = target + timedelta(days=60)
        early_score, _ = date_score(early, target, False)
        late_score, _ = date_score(late, target, False)
        # Same offset, but late must score lower than early
        assert early_score > late_score

    def test_very_late_decays_to_zero(self):
        target = datetime(2026, 8, 1, tzinfo=timezone.utc)
        listing = target + timedelta(days=45)
        score, _ = date_score(listing, target, False)
        assert score == pytest.approx(0.0, abs=1e-6)

    def test_missing_is_absent(self):
        score, _ = date_score(None, None, True)
        assert score is None


# === Layer 2: Text attributes ===

class TestLayer2:
    def test_all_match(self):
        p = _profile(vibe="quiet", languages=["de"], pets_ok=False, smoking_ok=False, gender_pref="any")
        l = _listing(vibe="quiet", languages=["de"], pets=False, smoking=False, gender_pref="any")
        score, _reasons, present = layer2_score(p, l)
        assert score == 1.0
        assert present == 5

    def test_all_conflict(self):
        p = _profile(vibe="quiet", pets_ok=True, smoking_ok=True)
        l = _listing(vibe="social", pets=False, smoking=False, languages=[], gender_pref=None)
        score, _, _present = layer2_score(p, l)
        assert score == 0.0

    def test_mixed_vibe_gets_bonus(self):
        p = _profile(vibe="quiet", pets_ok=None, smoking_ok=None, gender_pref=None, languages=[])
        l = _listing(vibe="mixed", languages=[], pets=None, smoking=None, gender_pref=None)
        score, _, _ = layer2_score(p, l)
        assert score == pytest.approx(0.65, abs=1e-6)

    def test_all_null_is_absent(self):
        p = _profile(vibe=None, languages=[], pets_ok=None, smoking_ok=None, gender_pref=None)
        l = _listing(vibe=None, languages=[], pets=None, smoking=None, gender_pref=None)
        score, _, present = layer2_score(p, l)
        assert score is None
        assert present == 0

    def test_languages_partial_overlap(self):
        p = _profile(vibe=None, languages=["de", "en"], pets_ok=None, smoking_ok=None, gender_pref=None)
        l = _listing(vibe=None, languages=["de"], pets=None, smoking=None, gender_pref=None)
        score, _, present = layer2_score(p, l)
        # 1 of 2 user languages covered → 0.5
        assert score == pytest.approx(0.5, abs=1e-6)
        assert present == 1


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
        assert all(k in bd for k in ["l1", "l2", "price", "location", "rooms", "date", "coverage", "completeness"])

    def test_no_l2_attributes_falls_back_to_l1(self):
        # Listing has no extractable attributes — final should equal L1
        p = _profile(vibe="quiet", languages=["de"], pets_ok=False, smoking_ok=False, gender_pref="any")
        l = _listing(vibe=None, languages=[], pets=None, smoking=None, gender_pref=None)
        result = compute_match(p, l)
        assert result is not None
        assert result["score_breakdown"]["l2"] is None
        assert result["score_breakdown"]["coverage"] == 0.0
        assert result["score"] == result["score_breakdown"]["l1"]

    def test_completeness_reported(self):
        result = compute_match(_profile(), _listing())
        assert result is not None
        # 4 L1 sub-scores present + 5 L2 attributes present → 9/9
        assert result["score_breakdown"]["completeness"] == 1.0

    def test_hard_filter_far_too_late(self):
        target = datetime(2026, 8, 1, tzinfo=timezone.utc)
        result = compute_match(
            _profile(move_in_from=target, move_in_flexible=False),
            _listing(moving_date=target + timedelta(days=200)),
        )
        assert result is None

    def test_hard_filter_far_too_few_rooms(self):
        result = compute_match(_profile(rooms_min=4.0), _listing(number_of_rooms=1.0))
        assert result is None


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
