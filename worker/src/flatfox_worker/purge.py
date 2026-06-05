"""Listing purge — hard-delete listings removed > 90 days with no matches."""

import logging
from datetime import datetime, timedelta, timezone

import psycopg2

from flatfox_worker.config import settings

logger = logging.getLogger(__name__)

PURGE_AFTER_DAYS = 90


def run_purge(database_url: str | None = None) -> int:
    """Delete listings where removed_at > 90 days ago and no matches reference them."""
    db_url = database_url or settings.database_url
    conn = psycopg2.connect(db_url)
    cutoff = datetime.now(timezone.utc) - timedelta(days=PURGE_AFTER_DAYS)

    try:
        with conn.cursor() as cur:
            cur.execute(
                """
                DELETE FROM listings
                WHERE removed_at IS NOT NULL
                  AND removed_at < %s
                  AND id NOT IN (
                      SELECT DISTINCT listing_id FROM matches WHERE listing_id IS NOT NULL
                  )
                """,
                (cutoff,),
            )
            count = cur.rowcount
        conn.commit()
        logger.info("Purged %d stale listings (removed > %d days, no matches).", count, PURGE_AFTER_DAYS)
        return count
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
