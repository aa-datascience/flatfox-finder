import json
import logging
import math
import uuid
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any

import psycopg2
from psycopg2.extras import execute_values

from flatfox_worker.config import settings

logger = logging.getLogger(__name__)

L1_WEIGHT = 0.6
L2_WEIGHT = 0.4

PRICE_W = 0.35
LOCATION_W = 0.30
ROOMS_W = 0.15
DATE_W = 0.20

EARTH_RADIUS_KM = 6371.0


@dataclass
class Profile:
    user_id: str
    budget_max: int | None = None
    rooms_min: float | None = None
    cities: list[str] = field(default_factory=list)
    radius_km: int = 10
    move_in_from: datetime | None = None
    move_in_flexible: bool = True
    languages: list[str] = field(default_factory=list)
    vibe: str | None = None
    max_flatmates: int | None = None
    pets_ok: bool | None = None
    smoking_ok: bool | None = None
    gender_pref: str | None = None


@dataclass
class ListingWithAttrs:
    id: int
    slug: str
    url: str
    city: str | None = None
    rent_gross: float | None = None
    number_of_rooms: float | None = None
    moving_date: datetime | None = None
    lat: float | None = None
    lng: float | None = None
    public_title: str | None = None
    # from listing_attributes
    flatmate_count: int | None = None
    languages: list[str] = field(default_factory=list)
    vibe: str | None = None
    pets: bool | None = None
    smoking: bool | None = None
    gender_pref: str | None = None
    move_in_flexible: bool | None = None


def _haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    lat1, lon1, lat2, lon2 = map(math.radians, [lat1, lon1, lat2, lon2])
    dlat = lat2 - lat1
    dlon = lon2 - lon1
    a = math.sin(dlat / 2) ** 2 + math.cos(lat1) * math.cos(lat2) * math.sin(dlon / 2) ** 2
    return 2 * EARTH_RADIUS_KM * math.asin(math.sqrt(a))


CITY_COORDS: dict[str, tuple[float, float]] = {
    "zürich": (47.3769, 8.5417),
    "zurich": (47.3769, 8.5417),
    "lausanne": (46.5197, 6.6323),
    "genève": (46.2044, 6.1432),
    "geneva": (46.2044, 6.1432),
    "geneve": (46.2044, 6.1432),
    "basel": (47.5596, 7.5886),
    "bern": (46.9480, 7.4474),
    "winterthur": (47.5001, 8.7240),
    "luzern": (47.0502, 8.3093),
    "lucerne": (47.0502, 8.3093),
    "st. gallen": (47.4245, 9.3767),
    "st.gallen": (47.4245, 9.3767),
    "lugano": (46.0037, 8.9511),
    "fribourg": (46.8065, 7.1620),
    "neuchâtel": (46.9900, 6.9293),
    "neuchatel": (46.9900, 6.9293),
}


def _get_city_coords(city: str) -> tuple[float, float] | None:
    return CITY_COORDS.get(city.lower().strip())


def price_score(rent_gross: float | None, budget_max: int | None) -> tuple[float, str]:
    if rent_gross is None or budget_max is None:
        return 0.5, "Budget: unknown"
    if rent_gross <= budget_max:
        return 1.0, f"Budget ✓ (CHF {rent_gross:.0f} ≤ {budget_max})"
    ratio = rent_gross / budget_max
    if ratio > 1.3:
        return 0.0, f"Budget ✗ (CHF {rent_gross:.0f} > 130% of {budget_max})"
    score = 1.0 - (ratio - 1.0) / 0.3
    return score, f"Budget ~ (CHF {rent_gross:.0f}, {ratio:.0%} of {budget_max})"


def location_score(
    listing_lat: float | None,
    listing_lng: float | None,
    listing_city: str | None,
    profile_cities: list[str],
    radius_km: int,
) -> tuple[float, str]:
    if not profile_cities:
        return 0.5, "Location: no preference"

    best_score = 0.0
    best_reason = "Location ✗ (no city match)"

    for pc in profile_cities:
        coords = _get_city_coords(pc)
        if coords is None:
            if listing_city and pc.lower().strip() == listing_city.lower().strip():
                return 1.0, f"Location ✓ ({listing_city})"
            continue

        if listing_lat is not None and listing_lng is not None:
            dist = _haversine(coords[0], coords[1], listing_lat, listing_lng)
            if dist <= radius_km:
                return 1.0, f"Location ✓ ({dist:.1f}km from {pc})"
            elif dist <= 2 * radius_km:
                s = 1.0 - (dist - radius_km) / radius_km
                if s > best_score:
                    best_score = s
                    best_reason = f"Location ~ ({dist:.1f}km from {pc})"
            # else: hard cut at 2x, score stays 0
        elif listing_city and pc.lower().strip() == listing_city.lower().strip():
            return 1.0, f"Location ✓ ({listing_city})"

    return best_score, best_reason


def rooms_score(number_of_rooms: float | None, rooms_min: float | None) -> tuple[float, str]:
    if number_of_rooms is None or rooms_min is None:
        return 0.5, "Rooms: unknown"
    if number_of_rooms >= rooms_min:
        return 1.0, f"Rooms ✓ ({number_of_rooms} ≥ {rooms_min})"
    if rooms_min - number_of_rooms <= 0.5:
        return 0.5, f"Rooms ~ ({number_of_rooms}, need {rooms_min})"
    return 0.0, f"Rooms ✗ ({number_of_rooms} < {rooms_min})"


def date_score(
    moving_date: datetime | None,
    move_in_from: datetime | None,
    move_in_flexible: bool,
) -> tuple[float, str]:
    if moving_date is None or move_in_from is None:
        return 0.5 if move_in_flexible else 0.3, "Date: unknown"
    diff_days = abs((moving_date - move_in_from).days)
    if diff_days <= 14 or (move_in_flexible and diff_days <= 30):
        return 1.0, f"Date ✓ ({diff_days}d diff)"
    if diff_days <= 30:
        return 0.5, f"Date ~ ({diff_days}d diff)"
    return 0.0, f"Date ✗ ({diff_days}d diff)"


def _text_attr_score(profile_val: Any, listing_val: Any) -> int:
    if profile_val is None or listing_val is None:
        return 0
    if isinstance(profile_val, bool) and isinstance(listing_val, bool):
        return 1 if profile_val == listing_val else -1
    if isinstance(profile_val, list) and isinstance(listing_val, list):
        overlap = set(profile_val) & set(listing_val)
        return 1 if overlap else 0
    if profile_val == listing_val:
        return 1
    if profile_val == "mixed" or listing_val == "mixed":
        return 0
    return -1


def layer2_score(profile: Profile, listing: ListingWithAttrs) -> tuple[float, list[str]]:
    attrs = [
        ("vibe", profile.vibe, listing.vibe),
        ("languages", profile.languages or None, listing.languages or None),
        ("pets", profile.pets_ok, listing.pets),
        ("smoking", profile.smoking_ok, listing.smoking),
        ("gender_pref", profile.gender_pref, listing.gender_pref),
    ]

    total = 0
    max_possible = 0
    reasons: list[str] = []

    for name, pval, lval in attrs:
        s = _text_attr_score(pval, lval)
        if pval is not None and lval is not None:
            max_possible += 1
            total += s
            if s > 0:
                reasons.append(f"{name} ✓")
            elif s < 0:
                reasons.append(f"{name} ✗")

    if max_possible == 0:
        return 0.5, ["No text attributes to compare"]

    score = (total + max_possible) / (2 * max_possible)
    return score, reasons


def compute_match(profile: Profile, listing: ListingWithAttrs) -> dict[str, Any] | None:
    ps, pr = price_score(listing.rent_gross, profile.budget_max)
    ls, lr = location_score(listing.lat, listing.lng, listing.city, profile.cities, profile.radius_km)
    rs, rr = rooms_score(listing.number_of_rooms, profile.rooms_min)
    ds, dr = date_score(listing.moving_date, profile.move_in_from, profile.move_in_flexible)

    l1 = PRICE_W * ps + LOCATION_W * ls + ROOMS_W * rs + DATE_W * ds

    l2, l2_reasons = layer2_score(profile, listing)

    final = L1_WEIGHT * l1 + L2_WEIGHT * l2

    breakdown = {
        "l1": round(l1, 4),
        "l2": round(l2, 4),
        "price": round(ps, 4),
        "location": round(ls, 4),
        "rooms": round(rs, 4),
        "date": round(ds, 4),
    }

    rationale_parts = [pr, lr, rr, dr] + l2_reasons
    rationale = ", ".join(rationale_parts)

    if final < settings.match_score_threshold:
        return None

    return {
        "score": round(final, 4),
        "score_breakdown": breakdown,
        "rationale": rationale,
        "listing_snapshot": {
            "title": listing.public_title or "",
            "city": listing.city or "",
            "price": listing.rent_gross,
        },
    }


def _load_profiles(conn) -> list[Profile]:
    with conn.cursor() as cur:
        cur.execute("""
            SELECT u.id, up.budget_max, up.rooms_min, up.cities, up.radius_km,
                   up.move_in_from, up.move_in_flexible, up.languages, up.vibe,
                   up.max_flatmates, up.pets_ok, up.smoking_ok, up.gender_pref
            FROM user_profiles up
            JOIN users u ON u.id = up.user_id
        """)
        profiles = []
        for row in cur.fetchall():
            profiles.append(Profile(
                user_id=str(row[0]),
                budget_max=row[1],
                rooms_min=row[2],
                cities=row[3] or [],
                radius_km=row[4] or 10,
                move_in_from=row[5],
                move_in_flexible=row[6] if row[6] is not None else True,
                languages=row[7] or [],
                vibe=row[8],
                max_flatmates=row[9],
                pets_ok=row[10],
                smoking_ok=row[11],
                gender_pref=row[12],
            ))
        return profiles


def _load_listings(conn) -> list[ListingWithAttrs]:
    with conn.cursor() as cur:
        cur.execute("""
            SELECT l.id, l.slug, l.url, l.city, l.rent_gross, l.number_of_rooms,
                   l.moving_date, l.lat, l.lng, l.public_title,
                   la.flatmate_count, la.languages, la.vibe, la.pets, la.smoking,
                   la.gender_pref, la.move_in_flexible
            FROM listings l
            LEFT JOIN listing_attributes la ON la.listing_id = l.id
            WHERE l.status = 'active' AND l.removed_at IS NULL
        """)
        listings = []
        for row in cur.fetchall():
            listings.append(ListingWithAttrs(
                id=row[0], slug=row[1], url=row[2], city=row[3],
                rent_gross=row[4], number_of_rooms=row[5],
                moving_date=row[6], lat=row[7], lng=row[8], public_title=row[9],
                flatmate_count=row[10], languages=row[11] or [],
                vibe=row[12], pets=row[13], smoking=row[14],
                gender_pref=row[15], move_in_flexible=row[16],
            ))
        return listings


def run_matching(database_url: str | None = None) -> int:
    db_url = database_url or settings.database_url
    conn = psycopg2.connect(db_url)
    now = datetime.now(timezone.utc)

    try:
        profiles = _load_profiles(conn)
        if not profiles:
            logger.info("No profiles to match.")
            return 0

        listings = _load_listings(conn)
        if not listings:
            logger.info("No active listings to match.")
            return 0

        logger.info("Matching %d profiles × %d listings.", len(profiles), len(listings))

        # Load existing matches to avoid duplicates
        with conn.cursor() as cur:
            cur.execute("SELECT user_id, listing_id FROM matches")
            existing = {(str(row[0]), row[1]) for row in cur.fetchall()}

        new_matches: list[tuple] = []
        for profile in profiles:
            for listing in listings:
                if (profile.user_id, listing.id) in existing:
                    continue

                result = compute_match(profile, listing)
                if result is None:
                    continue

                new_matches.append((
                    str(uuid.uuid4()),
                    profile.user_id,
                    listing.id,
                    result["score"],
                    json.dumps(result["score_breakdown"]),
                    result["rationale"],
                    "new",
                    json.dumps(result["listing_snapshot"]),
                    now,
                ))

        if new_matches:
            with conn.cursor() as cur:
                execute_values(
                    cur,
                    """
                    INSERT INTO matches (id, user_id, listing_id, score, score_breakdown,
                        rationale, status, listing_snapshot, created_at)
                    VALUES %s
                    ON CONFLICT (user_id, listing_id) DO NOTHING
                    """,
                    new_matches,
                )
            conn.commit()

        logger.info("Created %d new matches.", len(new_matches))
        return len(new_matches)

    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
