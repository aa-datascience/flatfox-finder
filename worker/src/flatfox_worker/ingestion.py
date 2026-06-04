import logging
from datetime import datetime, timezone

import psycopg2
from psycopg2.extras import execute_values

from flatfox_worker.config import settings
from flatfox_worker.flatfox_client import BaseListingClient, NormalizedListing

logger = logging.getLogger(__name__)

UPSERT_SQL = """
INSERT INTO listings (
    id, slug, url, status, offer_type, object_category, object_type,
    rent_net, rent_charges, rent_gross, surface_living, number_of_rooms,
    floor, is_furnished, is_temporary, moving_date, moving_date_type,
    zipcode, city, lat, lng, description, short_title, public_title,
    published, fetched_at
) VALUES %s
ON CONFLICT (id) DO UPDATE SET
    slug = EXCLUDED.slug,
    url = EXCLUDED.url,
    status = EXCLUDED.status,
    offer_type = EXCLUDED.offer_type,
    object_category = EXCLUDED.object_category,
    object_type = EXCLUDED.object_type,
    rent_net = EXCLUDED.rent_net,
    rent_charges = EXCLUDED.rent_charges,
    rent_gross = EXCLUDED.rent_gross,
    surface_living = EXCLUDED.surface_living,
    number_of_rooms = EXCLUDED.number_of_rooms,
    floor = EXCLUDED.floor,
    is_furnished = EXCLUDED.is_furnished,
    is_temporary = EXCLUDED.is_temporary,
    moving_date = EXCLUDED.moving_date,
    moving_date_type = EXCLUDED.moving_date_type,
    zipcode = EXCLUDED.zipcode,
    city = EXCLUDED.city,
    lat = EXCLUDED.lat,
    lng = EXCLUDED.lng,
    description = EXCLUDED.description,
    short_title = EXCLUDED.short_title,
    public_title = EXCLUDED.public_title,
    published = EXCLUDED.published,
    fetched_at = EXCLUDED.fetched_at,
    removed_at = NULL
"""


def _listing_to_tuple(listing: NormalizedListing, now: datetime) -> tuple:
    return (
        listing.pk,
        listing.slug,
        listing.url,
        listing.status,
        listing.offer_type,
        listing.object_category,
        listing.object_type,
        listing.rent_net,
        listing.rent_charges,
        listing.rent_gross,
        listing.surface_living,
        listing.number_of_rooms,
        listing.floor,
        listing.is_furnished,
        listing.is_temporary,
        listing.moving_date,
        listing.moving_date_type,
        listing.zipcode,
        listing.city,
        listing.lat,
        listing.lng,
        listing.description,
        listing.short_title,
        listing.public_title,
        listing.published,
        now,
    )


def run_ingestion(client: BaseListingClient, database_url: str | None = None) -> dict[str, int]:
    db_url = database_url or settings.database_url
    now = datetime.now(timezone.utc)

    listings = list(client.fetch_listings())
    if not listings:
        logger.warning("No listings fetched — skipping ingestion.")
        return {"fetched": 0, "new": 0, "updated": 0, "removed": 0}

    fetched_ids = {l.pk for l in listings}

    conn = psycopg2.connect(db_url)
    try:
        with conn.cursor() as cur:
            # Get existing active listing IDs
            cur.execute("SELECT id FROM listings WHERE removed_at IS NULL")
            existing_ids = {row[0] for row in cur.fetchall()}

            new_ids = fetched_ids - existing_ids
            updated_ids = fetched_ids & existing_ids

            # Upsert in batches of 500
            batch_size = 500
            tuples = [_listing_to_tuple(l, now) for l in listings]
            for i in range(0, len(tuples), batch_size):
                batch = tuples[i : i + batch_size]
                execute_values(cur, UPSERT_SQL, batch)

            # Flag removed: active listings not in this fetch
            removed_ids = existing_ids - fetched_ids
            if removed_ids:
                cur.execute(
                    "UPDATE listings SET status = 'removed', removed_at = %s WHERE id = ANY(%s)",
                    (now, list(removed_ids)),
                )

            conn.commit()

        stats = {
            "fetched": len(listings),
            "new": len(new_ids),
            "updated": len(updated_ids),
            "removed": len(removed_ids),
        }
        logger.info(
            "Ingestion complete: fetched=%d, new=%d, updated=%d, removed=%d",
            stats["fetched"], stats["new"], stats["updated"], stats["removed"],
        )
        return stats

    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()
