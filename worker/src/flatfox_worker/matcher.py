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

# Base layer weights (renormalized over present sub-scores).
PRICE_W = 0.35
LOCATION_W = 0.30
ROOMS_W = 0.15
DATE_W = 0.20

L1_BASE_WEIGHT = 0.60
L2_BASE_WEIGHT = 0.40

# Curve parameters (v2 — see MATCHING-ALGORITHM-V2.md).
BUDGET_CEILING_MULT = 1.30
RADIUS_CEILING_MULT = 2.0
ROOMS_TOLERANCE = 1.0
ROOMS_HARD_DEFICIT = 2.0
DATE_GRACE_EARLY = 30
DATE_EARLY_CEILING = 120
DATE_EARLY_FLOOR_DROP = 0.6  # early case decays to 1 - 0.6 = 0.4 floor
DATE_GRACE_LATE = 7
DATE_LATE_CEILING = 45
DATE_MAX_LATE = 120
DATE_FLEX_BONUS_GRACE = 14
DATE_FLEX_BONUS_CEILING = 30
DATE_FLEX_BONUS_MAX_LATE = 30
VIBE_MIXED_SCORE = 0.65

EARTH_RADIUS_KM = 6371.0

L2_ATTRIBUTE_COUNT = 5
L1_SUBSCORE_COUNT = 4


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
    rent_net: float | None = None
    rent_charges: float | None = None
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


def _clamp(v: float, lo: float = 0.0, hi: float = 1.0) -> float:
    if v < lo:
        return lo
    if v > hi:
        return hi
    return v


def _smooth_decay(value: float, target: float, ceiling: float) -> float:
    """1.0 at target, 0.0 at ceiling, 1 - x² in between."""
    if ceiling <= target:
        return 1.0 if value <= target else 0.0
    x = _clamp((value - target) / (ceiling - target))
    return 1.0 - x * x


def _combine(scores: list[tuple[float, float]]) -> float | None:
    """Weighted mean over (score, weight) pairs, ignoring None scores.

    The caller filters out None entries before calling this; pass only
    present sub-scores. Returns None if the input is empty.
    """
    if not scores:
        return None
    total_weight = sum(w for _, w in scores)
    if total_weight <= 0:
        return None
    return sum(s * w for s, w in scores) / total_weight


# === Layer 1 sub-scores ===

def price_score(rent_gross: float | None, budget_max: int | None) -> tuple[float | None, str]:
    if rent_gross is None or budget_max is None:
        return None, "Budget: unknown"
    if rent_gross <= budget_max:
        return 1.0, f"Budget ✓ (CHF {rent_gross:.0f} ≤ {budget_max})"
    ceiling = budget_max * BUDGET_CEILING_MULT
    score = _smooth_decay(rent_gross, budget_max, ceiling)
    return score, f"Budget ~ (CHF {rent_gross:.0f}, {rent_gross / budget_max:.0%} of {budget_max})"


def location_score(
    listing_lat: float | None,
    listing_lng: float | None,
    listing_city: str | None,
    profile_cities: list[str],
    radius_km: int,
) -> tuple[float | None, str]:
    if not profile_cities:
        return None, "Location: no preference"

    best_score: float | None = None
    best_reason = "Location ✗ (no city match)"
    ceiling = radius_km * RADIUS_CEILING_MULT

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
            s = _smooth_decay(dist, radius_km, ceiling)
            if best_score is None or s > best_score:
                best_score = s
                best_reason = f"Location ~ ({dist:.1f}km from {pc})"
        elif listing_city and pc.lower().strip() == listing_city.lower().strip():
            return 1.0, f"Location ✓ ({listing_city})"

    if best_score is None:
        return 0.0, best_reason
    return best_score, best_reason


def rooms_score(number_of_rooms: float | None, rooms_min: float | None) -> tuple[float | None, str]:
    if number_of_rooms is None or rooms_min is None:
        return None, "Rooms: unknown"
    deficit = max(0.0, rooms_min - number_of_rooms)
    if deficit == 0:
        return 1.0, f"Rooms ✓ ({number_of_rooms} ≥ {rooms_min})"
    score = _smooth_decay(deficit, 0.0, ROOMS_TOLERANCE)
    return score, f"Rooms ~ ({number_of_rooms}, need {rooms_min})"


def date_score(
    moving_date: datetime | None,
    move_in_from: datetime | None,
    move_in_flexible: bool,
) -> tuple[float | None, str]:
    if moving_date is None or move_in_from is None:
        return None, "Date: unknown"
    diff_days = (moving_date - move_in_from).days

    if diff_days <= 0:
        earliness = -diff_days
        if earliness <= DATE_GRACE_EARLY:
            return 1.0, f"Date ✓ ({earliness}d early)"
        x = _clamp((earliness - DATE_GRACE_EARLY) / (DATE_EARLY_CEILING - DATE_GRACE_EARLY))
        score = 1.0 - DATE_EARLY_FLOOR_DROP * x * x
        return score, f"Date ~ ({earliness}d early)"

    grace_late = DATE_GRACE_LATE + (DATE_FLEX_BONUS_GRACE if move_in_flexible else 0)
    late_ceiling = DATE_LATE_CEILING + (DATE_FLEX_BONUS_CEILING if move_in_flexible else 0)
    if diff_days <= grace_late:
        return 1.0, f"Date ✓ ({diff_days}d late)"
    score = _smooth_decay(float(diff_days), float(grace_late), float(late_ceiling))
    return score, f"Date ~ ({diff_days}d late)"


# === Layer 2 attributes ===

def _category_score(profile_val: Any, listing_val: Any) -> float:
    """For vibe / gender_pref: exact match, 'mixed' compatibility bonus, else conflict."""
    if profile_val == listing_val:
        return 1.0
    if profile_val == "mixed" or listing_val == "mixed":
        return VIBE_MIXED_SCORE
    return 0.0


def _languages_score(profile_langs: list[str], listing_langs: list[str]) -> float:
    user_set = {l.lower() for l in profile_langs}
    listing_set = {l.lower() for l in listing_langs}
    if not user_set:
        # Caller treats this as absent; guard anyway.
        return 1.0
    overlap = user_set & listing_set
    return len(overlap) / len(user_set)


def layer2_score(profile: Profile, listing: ListingWithAttrs) -> tuple[float | None, list[str], int]:
    """Return (L2_score_or_None, reasons, present_count)."""
    reasons: list[str] = []
    present: list[float] = []

    # Vibe
    if profile.vibe is not None and listing.vibe is not None:
        s = _category_score(profile.vibe, listing.vibe)
        present.append(s)
        reasons.append(f"vibe {'✓' if s >= 1.0 else ('~' if s > 0 else '✗')}")

    # Gender preference
    if profile.gender_pref is not None and listing.gender_pref is not None:
        s = _category_score(profile.gender_pref, listing.gender_pref)
        present.append(s)
        reasons.append(f"gender_pref {'✓' if s >= 1.0 else ('~' if s > 0 else '✗')}")

    # Pets (bool)
    if profile.pets_ok is not None and listing.pets is not None:
        s = 1.0 if profile.pets_ok == listing.pets else 0.0
        present.append(s)
        reasons.append(f"pets {'✓' if s == 1.0 else '✗'}")

    # Smoking (bool)
    if profile.smoking_ok is not None and listing.smoking is not None:
        s = 1.0 if profile.smoking_ok == listing.smoking else 0.0
        present.append(s)
        reasons.append(f"smoking {'✓' if s == 1.0 else '✗'}")

    # Languages (overlap degree)
    if profile.languages and listing.languages:
        s = _languages_score(profile.languages, listing.languages)
        present.append(s)
        reasons.append(f"languages {'✓' if s >= 1.0 else ('~' if s > 0 else '✗')}")

    if not present:
        return None, ["No text attributes to compare"], 0

    return sum(present) / len(present), reasons, len(present)


# === Hard filters + final score ===

def _effective_gross(listing: ListingWithAttrs) -> float | None:
    if listing.rent_gross is not None and listing.rent_gross > 0:
        return listing.rent_gross
    if listing.rent_net is not None and listing.rent_net > 0:
        return listing.rent_net + (listing.rent_charges or 0)
    return None


def _passes_hard_filters(profile: Profile, listing: ListingWithAttrs, effective_gross: float) -> bool:
    # Budget ceiling
    if profile.budget_max is not None:
        if effective_gross > profile.budget_max * BUDGET_CEILING_MULT:
            return False

    # Location ceiling
    if profile.cities:
        within_ceiling = False
        ceiling = profile.radius_km * RADIUS_CEILING_MULT
        for pc in profile.cities:
            coords = _get_city_coords(pc)
            if coords is None:
                if listing.city and pc.lower().strip() == listing.city.lower().strip():
                    within_ceiling = True
                    break
                continue
            if listing.lat is not None and listing.lng is not None:
                dist = _haversine(coords[0], coords[1], listing.lat, listing.lng)
                if dist <= ceiling:
                    within_ceiling = True
                    break
            elif listing.city and pc.lower().strip() == listing.city.lower().strip():
                within_ceiling = True
                break
        if not within_ceiling:
            return False

    # Rooms deficit ≥ 2 → exclude
    if profile.rooms_min is not None and listing.number_of_rooms is not None:
        deficit = profile.rooms_min - listing.number_of_rooms
        if deficit > ROOMS_HARD_DEFICIT:
            return False

    # Too late: diff > max_late_days (only the late side excludes)
    if profile.move_in_from is not None and listing.moving_date is not None:
        diff_days = (listing.moving_date - profile.move_in_from).days
        if diff_days > 0:
            max_late = DATE_MAX_LATE + (DATE_FLEX_BONUS_MAX_LATE if profile.move_in_flexible else 0)
            if diff_days > max_late:
                return False

    return True


def compute_match(profile: Profile, listing: ListingWithAttrs) -> dict[str, Any] | None:
    effective_gross = _effective_gross(listing)
    if effective_gross is None:
        return None

    if not _passes_hard_filters(profile, listing, effective_gross):
        return None

    ps, pr = price_score(effective_gross, profile.budget_max)
    ls, lr = location_score(listing.lat, listing.lng, listing.city, profile.cities, profile.radius_km)
    rs, rr = rooms_score(listing.number_of_rooms, profile.rooms_min)
    ds, dr = date_score(listing.moving_date, profile.move_in_from, profile.move_in_flexible)

    l1_pairs: list[tuple[float, float]] = []
    if ps is not None:
        l1_pairs.append((ps, PRICE_W))
    if ls is not None:
        l1_pairs.append((ls, LOCATION_W))
    if rs is not None:
        l1_pairs.append((rs, ROOMS_W))
    if ds is not None:
        l1_pairs.append((ds, DATE_W))

    l1 = _combine(l1_pairs)
    l2, l2_reasons, l2_present = layer2_score(profile, listing)

    if l1 is None and l2 is None:
        return None

    if l2 is None or l2_present == 0:
        final = l1 if l1 is not None else 0.0
        coverage = 0.0
    elif l1 is None:
        final = l2
        coverage = l2_present / L2_ATTRIBUTE_COUNT
    else:
        coverage = l2_present / L2_ATTRIBUTE_COUNT
        w2 = L2_BASE_WEIGHT * coverage
        w1 = 1.0 - w2
        final = w1 * l1 + w2 * l2

    if final < settings.match_score_threshold:
        return None

    l1_present_count = sum(1 for s in (ps, ls, rs, ds) if s is not None)
    completeness = (l1_present_count + l2_present) / (L1_SUBSCORE_COUNT + L2_ATTRIBUTE_COUNT)

    breakdown: dict[str, Any] = {
        "l1": round(l1, 4) if l1 is not None else None,
        "l2": round(l2, 4) if l2 is not None else None,
        "price": round(ps, 4) if ps is not None else None,
        "location": round(ls, 4) if ls is not None else None,
        "rooms": round(rs, 4) if rs is not None else None,
        "date": round(ds, 4) if ds is not None else None,
        "coverage": round(coverage, 4),
        "completeness": round(completeness, 4),
    }

    rationale_parts = [pr, lr, rr, dr] + l2_reasons
    rationale = ", ".join(rationale_parts)

    return {
        "score": round(final, 4),
        "score_breakdown": breakdown,
        "rationale": rationale,
        "listing_snapshot": {
            "title": listing.public_title or "",
            "city": listing.city or "",
            "price": effective_gross,
            "rent_net": listing.rent_net,
            "rent_charges": listing.rent_charges,
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
            SELECT l.id, l.slug, l.url, l.city,
                   l.rent_net, l.rent_charges, l.rent_gross,
                   l.number_of_rooms,
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
                rent_net=row[4], rent_charges=row[5], rent_gross=row[6],
                number_of_rooms=row[7],
                moving_date=row[8], lat=row[9], lng=row[10], public_title=row[11],
                flatmate_count=row[12], languages=row[13] or [],
                vibe=row[14], pets=row[15], smoking=row[16],
                gender_pref=row[17], move_in_flexible=row[18],
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
