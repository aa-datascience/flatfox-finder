import json
import logging
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import anthropic
import psycopg2
from psycopg2.extras import execute_values

from flatfox_worker.config import settings
from flatfox_worker.pii import strip_pii

logger = logging.getLogger(__name__)

PROMPT_PATH = Path(__file__).resolve().parent.parent.parent / "prompts" / "extract_listing.txt"
SYSTEM_PROMPT = PROMPT_PATH.read_text(encoding="utf-8").split("System: ", 1)[1]

EXTRACTION_MODEL = "claude-haiku-4-5-20241022"

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


def _fetch_unextracted(conn) -> list[dict[str, Any]]:
    with conn.cursor() as cur:
        cur.execute("""
            SELECT l.id, l.public_title, l.description
            FROM listings l
            LEFT JOIN listing_attributes la ON la.listing_id = l.id
            WHERE la.listing_id IS NULL AND l.status != 'removed'
        """)
        return [{"id": row[0], "title": row[1], "description": row[2]} for row in cur.fetchall()]


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
        listings = _fetch_unextracted(conn)
        if not listings:
            logger.info("No listings need extraction.")
            return 0

        logger.info("%d listings need extraction.", len(listings))

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
