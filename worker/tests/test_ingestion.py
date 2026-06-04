from datetime import datetime, timezone
from unittest.mock import MagicMock, patch

import psycopg2
import pytest

from flatfox_worker.flatfox_client import NormalizedListing
from flatfox_worker.ingestion import run_ingestion

TEST_DB_URL = "postgresql://postgres:postgres@localhost:5432/studenthousing"


def _make_listing(**overrides) -> NormalizedListing:
    defaults = {
        "pk": 1,
        "slug": "test",
        "url": "/en/flat/test",
        "status": "active",
        "offer_type": "RENT",
        "object_category": "APARTMENT",
    }
    defaults.update(overrides)
    return NormalizedListing(**defaults)


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


def _count_listings(where: str = "1=1") -> int:
    conn = psycopg2.connect(TEST_DB_URL)
    try:
        with conn.cursor() as cur:
            cur.execute(f"SELECT COUNT(*) FROM listings WHERE {where}")
            return cur.fetchone()[0]
    finally:
        conn.close()


def _get_listing(pk: int) -> dict | None:
    conn = psycopg2.connect(TEST_DB_URL)
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT id, slug, city, rent_gross, status, removed_at FROM listings WHERE id = %s",
                (pk,),
            )
            row = cur.fetchone()
            if row is None:
                return None
            return {
                "id": row[0],
                "slug": row[1],
                "city": row[2],
                "rent_gross": row[3],
                "status": row[4],
                "removed_at": row[5],
            }
    finally:
        conn.close()


@pytest.fixture(autouse=True)
def clean_db():
    _clean_tables()
    yield
    _clean_tables()


class TestIngestion:
    def test_inserts_new_listings(self):
        client = MagicMock()
        client.fetch_listings.return_value = iter([
            _make_listing(pk=1, city="Zürich", rent_gross=1200),
            _make_listing(pk=2, city="Basel", rent_gross=900),
        ])

        stats = run_ingestion(client, database_url=TEST_DB_URL)

        assert stats["fetched"] == 2
        assert stats["new"] == 2
        assert stats["updated"] == 0
        assert stats["removed"] == 0
        assert _count_listings() == 2

    def test_upserts_existing_listings(self):
        client1 = MagicMock()
        client1.fetch_listings.return_value = iter([
            _make_listing(pk=1, city="Zürich", rent_gross=1200),
        ])
        run_ingestion(client1, database_url=TEST_DB_URL)

        client2 = MagicMock()
        client2.fetch_listings.return_value = iter([
            _make_listing(pk=1, city="Zürich", rent_gross=1300),
        ])
        stats = run_ingestion(client2, database_url=TEST_DB_URL)

        assert stats["new"] == 0
        assert stats["updated"] == 1
        listing = _get_listing(1)
        assert listing["rent_gross"] == 1300

    def test_flags_removed_listings(self):
        client1 = MagicMock()
        client1.fetch_listings.return_value = iter([
            _make_listing(pk=1),
            _make_listing(pk=2),
        ])
        run_ingestion(client1, database_url=TEST_DB_URL)

        # Second run only has pk=1
        client2 = MagicMock()
        client2.fetch_listings.return_value = iter([
            _make_listing(pk=1),
        ])
        stats = run_ingestion(client2, database_url=TEST_DB_URL)

        assert stats["removed"] == 1
        removed = _get_listing(2)
        assert removed["status"] == "removed"
        assert removed["removed_at"] is not None

    def test_reinstates_removed_listing(self):
        client1 = MagicMock()
        client1.fetch_listings.return_value = iter([_make_listing(pk=1)])
        run_ingestion(client1, database_url=TEST_DB_URL)

        # Remove it
        client2 = MagicMock()
        client2.fetch_listings.return_value = iter([_make_listing(pk=2)])
        run_ingestion(client2, database_url=TEST_DB_URL)
        assert _get_listing(1)["status"] == "removed"

        # Re-appears
        client3 = MagicMock()
        client3.fetch_listings.return_value = iter([
            _make_listing(pk=1),
            _make_listing(pk=2),
        ])
        run_ingestion(client3, database_url=TEST_DB_URL)

        listing = _get_listing(1)
        assert listing["removed_at"] is None

    def test_empty_fetch_skips(self):
        client = MagicMock()
        client.fetch_listings.return_value = iter([])

        stats = run_ingestion(client, database_url=TEST_DB_URL)

        assert stats["fetched"] == 0
        assert _count_listings() == 0

    def test_large_batch(self):
        client = MagicMock()
        client.fetch_listings.return_value = iter([
            _make_listing(pk=i) for i in range(600)
        ])

        stats = run_ingestion(client, database_url=TEST_DB_URL)

        assert stats["fetched"] == 600
        assert stats["new"] == 600
        assert _count_listings() == 600
