from abc import ABC, abstractmethod
from collections.abc import Iterator
import logging
import time
from typing import Any

import httpx
from pydantic import BaseModel

from flatfox_worker.config import settings

logger = logging.getLogger(__name__)

VALID_OFFER_TYPES = {"RENT"}
VALID_CATEGORIES = {"APARTMENT", "SHARED", "HOUSE"}


class NormalizedListing(BaseModel):
    pk: int
    slug: str
    url: str
    status: str
    offer_type: str
    object_category: str
    object_type: str | None = None
    rent_net: float | None = None
    rent_charges: float | None = None
    rent_gross: float | None = None
    surface_living: float | None = None
    number_of_rooms: float | None = None
    floor: int | None = None
    is_furnished: bool | None = None
    is_temporary: bool | None = None
    moving_date: str | None = None
    moving_date_type: str | None = None
    zipcode: str | None = None
    city: str | None = None
    lat: float | None = None
    lng: float | None = None
    description: str | None = None
    short_title: str | None = None
    public_title: str | None = None
    published: str | None = None
    images: list[dict[str, Any]] = []
    attributes: list[dict[str, Any]] = []


class BaseListingClient(ABC):
    @abstractmethod
    def fetch_listings(self) -> Iterator[NormalizedListing]: ...


def _normalize(raw: dict[str, Any]) -> NormalizedListing | None:
    offer_type = raw.get("offer_type", "")
    object_category = raw.get("object_category", "")
    if offer_type not in VALID_OFFER_TYPES or object_category not in VALID_CATEGORIES:
        return None

    return NormalizedListing(
        pk=raw["pk"],
        slug=raw.get("slug", ""),
        url=raw.get("url", ""),
        status="active",  # normalise — all listings that pass filter are active
        offer_type=offer_type,
        object_category=object_category,
        object_type=raw.get("object_type"),
        rent_net=raw.get("rent_net"),
        rent_charges=raw.get("rent_charges"),
        rent_gross=raw.get("rent_gross"),
        surface_living=raw.get("livingspace"),
        number_of_rooms=raw.get("number_of_rooms"),
        floor=raw.get("floor"),
        is_furnished=raw.get("is_furnished"),
        is_temporary=raw.get("is_temporary"),
        moving_date=raw.get("moving_date"),
        moving_date_type=raw.get("moving_date_type"),
        zipcode=str(raw["zipcode"]) if raw.get("zipcode") is not None else None,
        city=raw.get("city"),
        lat=raw.get("latitude"),
        lng=raw.get("longitude"),
        description=raw.get("description"),
        short_title=raw.get("short_title"),
        public_title=raw.get("public_title"),
        published=raw.get("created"),
        images=raw.get("images") or [],
        attributes=raw.get("attributes") or [],
    )


class FlatfoxClient(BaseListingClient):
    def __init__(
        self,
        base_url: str = settings.flatfox_base_url,
        expand: str = settings.flatfox_expand,
        page_size: int = settings.flatfox_page_size,
        page_delay: float = settings.flatfox_page_delay,
        max_retries: int = settings.flatfox_max_retries,
    ) -> None:
        self.base_url = base_url.rstrip("/")
        self.expand = expand
        self.page_size = page_size
        self.page_delay = page_delay
        self.max_retries = max_retries
        self.client = httpx.Client(timeout=30.0)

    def _fetch_page(self, offset: int) -> dict[str, Any]:
        url = f"{self.base_url}/api/v1/public-listing/"
        params = {
            "limit": self.page_size,
            "offset": offset,
            "expand": self.expand,
        }

        last_exc: Exception | None = None
        for attempt in range(1, self.max_retries + 1):
            try:
                resp = self.client.get(url, params=params)
                resp.raise_for_status()
                return resp.json()
            except (httpx.HTTPStatusError, httpx.TransportError) as exc:
                last_exc = exc
                wait = 2 ** attempt
                logger.warning(
                    "Flatfox API request failed (attempt %d/%d, offset=%d): %s. Retrying in %ds.",
                    attempt, self.max_retries, offset, exc, wait,
                )
                time.sleep(wait)

        raise RuntimeError(
            f"Flatfox API failed after {self.max_retries} retries (offset={offset})"
        ) from last_exc

    def fetch_listings(self, max_pages: int | None = None) -> Iterator[NormalizedListing]:
        offset = 0
        total_fetched = 0
        total_kept = 0
        pages_fetched = 0

        while True:
            if max_pages is not None and pages_fetched >= max_pages:
                logger.info("Reached max_pages=%d limit — stopping early.", max_pages)
                break

            data = self._fetch_page(offset)
            results: list[dict[str, Any]] = data.get("results", [])

            if not results:
                break

            pages_fetched += 1

            for raw in results:
                total_fetched += 1
                listing = _normalize(raw)
                if listing is not None:
                    total_kept += 1
                    yield listing

            count = data.get("count", 0)
            offset += self.page_size

            logger.info(
                "Fetched page offset=%d: %d results, %d total kept so far (of %d remote).",
                offset - self.page_size, len(results), total_kept, count,
            )

            if offset >= count:
                break

            time.sleep(self.page_delay)

        logger.info(
            "Ingestion complete: fetched=%d, kept=%d (filtered to RENT + APARTMENT/SHARED/HOUSE).",
            total_fetched, total_kept,
        )

    def close(self) -> None:
        self.client.close()
