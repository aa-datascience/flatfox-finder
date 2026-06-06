import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import anthropic
import psycopg2
from psycopg2.extras import execute_values

from flatfox_worker.config import settings
from flatfox_worker.matcher import _haversine
from flatfox_worker.pii import strip_pii

logger = logging.getLogger(__name__)

PROMPT_PATH = Path(__file__).resolve().parent.parent.parent / "prompts" / "extract_listing.txt"
SYSTEM_PROMPT = PROMPT_PATH.read_text(encoding="utf-8").split("System: ", 1)[1]

EXTRACTION_MODEL = "claude-haiku-4-5-20251001"
MAX_EXTRACTIONS_PER_RUN = 500  # cap per run to control costs

VALID_VIBES = {"quiet", "social", "mixed"}
VALID_GENDER = {"any", "female_only", "male_only"}


def _parse_extraction(raw_text: str) -> dict[str, Any] | None:
    try:
        data = json.loads(raw_text.strip())
    except json.JSONDecodeError:
        return None

    if not isinstance(data, dict):
        return None

    vibe = data.get("vibe")
    if vibe not in VALID_VIBES:
        vibe = None

    gender = data.get("gender_pref")
    if gender not in VALID_GENDER:
        gender = None

    languages = data.get("languages")
    if not isinstance(languages, list):
        languages = None

    return {
        "flatmate_count": data.get("flatmate_count") if isinstance(data.get("flatmate_count"), int) else None,
        "languages": languages,
        "vibe": vibe,
        "pets_ok": data.get("pets_ok") if isinstance(data.get("pets_ok"), bool) else None,
        "smoking_ok": data.get("smoking_ok") if isinstance(data.get("smoking_ok"), bool) else None,
        "gender_pref": gender,
        "move_in_flexible": data.get("move_in_flexible") if isinstance(data.get("move_in_flexible"), bool) else None,
    }


def _build_user_message(title: str | None, description: str | None) -> str:
    title = strip_pii(title or "")
    description = strip_pii(description or "")
    return f"Title: {title}\nDescription: {description}"


def _load_profile_constraints(conn) -> list[dict[str, Any]]:
    """Load hard-filter criteria from all active profiles."""
    with conn.cursor() as cur:
        cur.execute("""
            SELECT up.budget_max, up.cities, up.radius_km
            FROM user_profiles up
            JOIN users u ON u.id = up.user_id
        """)
        return [
            {"budget_max": row[0], "cities": row[1] or [], "radius_km": row[2] or 10}
            for row in cur.fetchall()
        ]


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


def _could_match_any_profile(
    listing: dict[str, Any],
    profiles: list[dict[str, Any]],
) -> bool:
    """Return True if listing could pass hard filters for at least one profile."""
    if not profiles:
        return False

    rent = listing.get("rent_gross")
    lat = listing.get("lat")
    lng = listing.get("lng")
    city = listing.get("city")

    for p in profiles:
        # Budget check: skip if listing is over this profile's budget
        if p["budget_max"] is not None and rent is not None and rent > p["budget_max"]:
            continue

        # Location check: skip if listing is outside 2x radius of all preferred cities
        if p["cities"]:
            location_ok = False
            for pc in p["cities"]:
                coords = CITY_COORDS.get(pc.lower().strip())
                if coords is None:
                    if city and pc.lower().strip() == city.lower().strip():
                        location_ok = True
                        break
                    continue
                if lat is not None and lng is not None:
                    dist = _haversine(coords[0], coords[1], lat, lng)
                    if dist <= 2 * p["radius_km"]:
                        location_ok = True
                        break
                elif city and pc.lower().strip() == city.lower().strip():
                    location_ok = True
                    break
            if not location_ok:
                continue

        return True

    return False


def _fetch_unextracted(conn, profiles: list[dict[str, Any]] | None = None) -> list[dict[str, Any]]:
    with conn.cursor() as cur:
        cur.execute("""
            SELECT l.id, l.public_title, l.description, l.rent_gross, l.lat, l.lng, l.city
            FROM listings l
            LEFT JOIN listing_attributes la ON la.listing_id = l.id
            WHERE la.listing_id IS NULL AND l.status != 'removed'
        """)
        all_listings = [
            {
                "id": row[0], "title": row[1], "description": row[2],
                "rent_gross": row[3], "lat": row[4], "lng": row[5], "city": row[6],
            }
            for row in cur.fetchall()
        ]

    if profiles is None or len(profiles) == 0:
        return all_listings

    before = len(all_listings)
    filtered = [l for l in all_listings if _could_match_any_profile(l, profiles)]
    skipped = before - len(filtered)
    if skipped > 0:
        logger.info("Skipped %d/%d listings that can't match any profile.", skipped, before)
    return filtered


def _save_attributes(conn, rows: list[tuple]) -> None:
    execute_values(
        conn.cursor(),
        """
        INSERT INTO listing_attributes (
            listing_id, flatmate_count, languages, vibe, pets, smoking,
            gender_pref, move_in_flexible, extraction_model, extracted_at
        ) VALUES %s
        ON CONFLICT (listing_id) DO UPDATE SET
            flatmate_count = EXCLUDED.flatmate_count,
            languages = EXCLUDED.languages,
            vibe = EXCLUDED.vibe,
            pets = EXCLUDED.pets,
            smoking = EXCLUDED.smoking,
            gender_pref = EXCLUDED.gender_pref,
            move_in_flexible = EXCLUDED.move_in_flexible,
            extraction_model = EXCLUDED.extraction_model,
            extracted_at = EXCLUDED.extracted_at
        """,
        rows,
    )
    conn.commit()


def _extract_sequential(
    client: anthropic.Anthropic, listings: list[dict[str, Any]]
) -> list[tuple]:
    now = datetime.now(timezone.utc)
    rows: list[tuple] = []

    for listing in listings:
        user_msg = _build_user_message(listing["title"], listing["description"])
        try:
            response = client.messages.create(
                model=EXTRACTION_MODEL,
                max_tokens=300,
                system=[{
                    "type": "text",
                    "text": SYSTEM_PROMPT,
                    "cache_control": {"type": "ephemeral"},
                }],
                messages=[{"role": "user", "content": user_msg}],
            )
            raw_text = response.content[0].text
            parsed = _parse_extraction(raw_text)
        except Exception as exc:
            logger.warning("Extraction failed for listing %d: %s", listing["id"], exc)
            parsed = None

        if parsed is None:
            parsed = {
                "flatmate_count": None, "languages": None, "vibe": None,
                "pets_ok": None, "smoking_ok": None, "gender_pref": None,
                "move_in_flexible": None,
            }

        rows.append((
            listing["id"],
            parsed["flatmate_count"],
            parsed["languages"] or [],
            parsed["vibe"],
            parsed["pets_ok"],
            parsed["smoking_ok"],
            parsed["gender_pref"],
            parsed["move_in_flexible"],
            EXTRACTION_MODEL,
            now,
        ))

    return rows


def _extract_batch(
    client: anthropic.Anthropic, listings: list[dict[str, Any]]
) -> list[tuple]:
    now = datetime.now(timezone.utc)

    requests = []
    for listing in listings:
        user_msg = _build_user_message(listing["title"], listing["description"])
        requests.append({
            "custom_id": str(listing["id"]),
            "params": {
                "model": EXTRACTION_MODEL,
                "max_tokens": 300,
                "system": [{"type": "text", "text": SYSTEM_PROMPT}],
                "messages": [{"role": "user", "content": user_msg}],
            },
        })

    logger.info("Submitting batch of %d extraction requests.", len(requests))
    batch = client.messages.batches.create(requests=requests)

    while batch.processing_status == "in_progress":
        time.sleep(10)
        batch = client.messages.batches.retrieve(batch.id)
        logger.info("Batch %s: status=%s", batch.id, batch.processing_status)

    id_to_listing = {str(l["id"]): l for l in listings}
    rows: list[tuple] = []

    for result in client.messages.batches.results(batch.id):
        listing_id = int(result.custom_id)
        parsed = None

        if result.result.type == "succeeded":
            try:
                raw_text = result.result.message.content[0].text
                parsed = _parse_extraction(raw_text)
            except Exception as exc:
                logger.warning("Batch parse failed for listing %d: %s", listing_id, exc)

        if parsed is None:
            parsed = {
                "flatmate_count": None, "languages": None, "vibe": None,
                "pets_ok": None, "smoking_ok": None, "gender_pref": None,
                "move_in_flexible": None,
            }

        rows.append((
            listing_id,
            parsed["flatmate_count"],
            parsed["languages"] or [],
            parsed["vibe"],
            parsed["pets_ok"],
            parsed["smoking_ok"],
            parsed["gender_pref"],
            parsed["move_in_flexible"],
            EXTRACTION_MODEL,
            now,
        ))

    return rows


def run_extraction(database_url: str | None = None) -> int:
    db_url = database_url or settings.database_url
    conn = psycopg2.connect(db_url)

    try:
        profiles = _load_profile_constraints(conn)
        listings = _fetch_unextracted(conn, profiles)
        if not listings:
            logger.info("No listings need extraction.")
            return 0

        logger.info("%d listings need extraction.", len(listings))
        listings = listings[:MAX_EXTRACTIONS_PER_RUN]
        logger.info("Capped to %d listings for this run.", len(listings))

        ai_client = anthropic.Anthropic(api_key=settings.anthropic_api_key)

        rows = _extract_sequential(ai_client, listings)

        _save_attributes(conn, rows)
        logger.info("Extracted attributes for %d listings.", len(rows))
        return len(rows)

    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
