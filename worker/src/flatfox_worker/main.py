"""Worker entry point.

Currently a smoke test that exercises the verified Flatfox client. Ingestion,
extraction, matching, and message drafting (PROJECT-PLAN Tasks #4–#7) plug in here.

Usage:
    python -m flatfox_worker.main smoke   # fetch a few housing listings and summarise
"""

from __future__ import annotations

import logging
import sys
from collections import Counter

from .config import settings
from .flatfox_client import FlatfoxClient

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
log = logging.getLogger("flatfox_worker")


def smoke(limit: int = 20) -> None:
    """Fetch up to `limit` housing listings and print a quick summary."""
    client = FlatfoxClient()
    cities: Counter[str] = Counter()
    categories: Counter[str] = Counter()
    shown = 0

    for listing in client.iter_housing_listings():
        categories[listing.get("object_category") or "?"] += 1
        cities[listing.get("city") or "?"] += 1
        if shown < limit:
            images = client.parse_images(listing)
            cover = client.absolute_url(images[0].url_thumb_m) if images else None
            log.info(
                "#%s  %s  CHF %s  %s rooms  %s  [%s imgs]  %s",
                listing.get("pk"),
                listing.get("object_category"),
                listing.get("rent_gross"),
                listing.get("number_of_rooms"),
                listing.get("city"),
                len(images),
                cover or "(no image)",
            )
        shown += 1
        if shown >= limit:
            break

    log.info("Config: categories=%s offer_types=%s", settings.flatfox_categories, settings.flatfox_offer_types)
    log.info("Sampled %s housing listings — categories=%s", shown, dict(categories))


def main(argv: list[str]) -> int:
    command = argv[1] if len(argv) > 1 else "smoke"
    if command == "smoke":
        smoke()
        return 0
    log.error("Unknown command %r. Try: smoke", command)
    return 1


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
