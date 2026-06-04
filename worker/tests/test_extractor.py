import json
from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import psycopg2
import pytest

from flatfox_worker.extractor import (
    _build_user_message,
    _parse_extraction,
    run_extraction,
)

TEST_DB_URL = "postgresql://postgres:postgres@localhost:5432/studenthousing"


class TestParseExtraction:
    def test_valid_json(self):
        raw = json.dumps({
            "flatmate_count": 3,
            "languages": ["de", "en"],
            "vibe": "social",
            "pets_ok": True,
            "smoking_ok": False,
            "gender_pref": "any",
            "move_in_flexible": True,
        })
        result = _parse_extraction(raw)
        assert result is not None
        assert result["flatmate_count"] == 3
        assert result["languages"] == ["de", "en"]
        assert result["vibe"] == "social"
        assert result["pets_ok"] is True
        assert result["smoking_ok"] is False

    def test_all_nulls(self):
        raw = json.dumps({
            "flatmate_count": None,
            "languages": None,
            "vibe": None,
            "pets_ok": None,
            "smoking_ok": None,
            "gender_pref": None,
            "move_in_flexible": None,
        })
        result = _parse_extraction(raw)
        assert result is not None
        assert all(v is None for v in result.values())

    def test_invalid_json(self):
        assert _parse_extraction("not json at all") is None

    def test_invalid_vibe_becomes_null(self):
        raw = json.dumps({"vibe": "unknown_value"})
        result = _parse_extraction(raw)
        assert result["vibe"] is None

    def test_invalid_gender_becomes_null(self):
        raw = json.dumps({"gender_pref": "nonbinary_only"})
        result = _parse_extraction(raw)
        assert result["gender_pref"] is None

    def test_non_int_flatmate_count(self):
        raw = json.dumps({"flatmate_count": "three"})
        result = _parse_extraction(raw)
        assert result["flatmate_count"] is None

    def test_non_bool_pets(self):
        raw = json.dumps({"pets_ok": "yes"})
        result = _parse_extraction(raw)
        assert result["pets_ok"] is None


class TestBuildUserMessage:
    def test_strips_pii(self):
        msg = _build_user_message("Nice flat", "Contact john@test.com for info")
        assert "john@test.com" not in msg
        assert "[EMAIL]" in msg

    def test_handles_none(self):
        msg = _build_user_message(None, None)
        assert "Title:" in msg
        assert "Description:" in msg


def _clean_tables():
    conn = psycopg2.connect(TEST_DB_URL)
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM listing_attributes")
            cur.execute("DELETE FROM matches")
            cur.execute("DELETE FROM listings")
        conn.commit()
    finally:
        conn.close()


def _insert_listing(pk: int, title: str = "Test", description: str = "A listing"):
    conn = psycopg2.connect(TEST_DB_URL)
    try:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO listings (id, slug, url, status, offer_type, object_category,
                   public_title, description, fetched_at)
                   VALUES (%s, %s, %s, 'active', 'RENT', 'APARTMENT', %s, %s, NOW())
                   ON CONFLICT (id) DO NOTHING""",
                (pk, f"listing-{pk}", f"/en/flat/{pk}", title, description),
            )
        conn.commit()
    finally:
        conn.close()


def _count_attributes() -> int:
    conn = psycopg2.connect(TEST_DB_URL)
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM listing_attributes")
            return cur.fetchone()[0]
    finally:
        conn.close()


@pytest.fixture(autouse=True)
def clean_db():
    _clean_tables()
    yield
    _clean_tables()


class TestRunExtraction:
    def test_extracts_for_unextracted_listings(self):
        _insert_listing(1, "WG Zimmer", "Wir suchen eine ruhige Mitbewohnerin. 3er WG.")
        _insert_listing(2, "Studio", "Quiet studio near ETH.")

        mock_response = MagicMock()
        mock_response.content = [MagicMock(text=json.dumps({
            "flatmate_count": 3,
            "languages": ["de"],
            "vibe": "quiet",
            "pets_ok": None,
            "smoking_ok": None,
            "gender_pref": "female_only",
            "move_in_flexible": None,
        }))]

        mock_client = MagicMock()
        mock_client.messages.create.return_value = mock_response

        with patch("flatfox_worker.extractor.anthropic.Anthropic", return_value=mock_client):
            count = run_extraction(database_url=TEST_DB_URL)

        assert count == 2
        assert _count_attributes() == 2

    def test_skips_already_extracted(self):
        _insert_listing(1)

        conn = psycopg2.connect(TEST_DB_URL)
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO listing_attributes (listing_id, extraction_model, extracted_at)
                   VALUES (%s, 'test', NOW())""",
                (1,),
            )
        conn.commit()
        conn.close()

        mock_client = MagicMock()
        with patch("flatfox_worker.extractor.anthropic.Anthropic", return_value=mock_client):
            count = run_extraction(database_url=TEST_DB_URL)

        assert count == 0
        mock_client.messages.create.assert_not_called()

    def test_handles_ai_failure_gracefully(self):
        _insert_listing(1)

        mock_client = MagicMock()
        mock_client.messages.create.side_effect = Exception("API down")

        with patch("flatfox_worker.extractor.anthropic.Anthropic", return_value=mock_client):
            count = run_extraction(database_url=TEST_DB_URL)

        assert count == 1
        assert _count_attributes() == 1
