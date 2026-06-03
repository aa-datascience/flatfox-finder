"""Client for the Flatfox public-listing API.

Verified live 2026-06-03 (see PROJECT-PLAN §3a):
  - Base:        GET {base}/api/v1/public-listing/
  - Auth:        none
  - Pagination:  ?limit=N&offset=M   (NOT ?page=N)
  - Expansion:   &expand=images,documents,attributes  -> resolves bare integer
                 image/document IDs into objects with (signed) relative URLs.
  - Single:      GET {base}/api/v1/public-listing/{pk}/   (adds `can_direct_apply`)

The feed is ~35k listings but ~40% is parking/commercial, so callers typically
filter to RENT + housing categories (APARTMENT/SHARED/HOUSE).
"""

from __future__ import annotations

import logging
import time
from collections.abc import Iterator
from dataclasses import dataclass
from typing import Any

import requests

from .config import settings

log = logging.getLogger(__name__)

_LISTING_PATH = "/api/v1/public-listing/"


@dataclass
class FlatfoxImage:
    pk: int | None
    caption: str | None
    url: str | None          # absolute, full-size
    url_thumb_m: str | None  # absolute, card thumbnail
    width: int | None
    height: int | None


class FlatfoxClient:
    """Thin, polite, retrying client over the public-listing endpoint."""

    def __init__(
        self,
        base_url: str | None = None,
        page_limit: int | None = None,
        expand: list[str] | None = None,
        page_delay_seconds: float | None = None,
        timeout: float = 30.0,
        max_retries: int = 3,
    ) -> None:
        self.base_url = (base_url or settings.flatfox_base_url).rstrip("/")
        self.page_limit = page_limit or settings.flatfox_page_limit
        self.expand = expand if expand is not None else settings.flatfox_expand
        self.page_delay = (
            page_delay_seconds
            if page_delay_seconds is not None
            else settings.flatfox_page_delay_seconds
        )
        self.timeout = timeout
        self.max_retries = max_retries
        self.session = requests.Session()
        self.session.headers.update(
            {"Accept": "application/json", "User-Agent": "flatfox-finder/0.1 (+ingestion)"}
        )

    # ── public API ──────────────────────────────────────────────────────────

    def absolute_url(self, relative: str | None) -> str | None:
        """Prepend the base URL to a relative path (e.g. image `/thumb/...`)."""
        if not relative:
            return None
        if relative.startswith("http"):
            return relative
        return f"{self.base_url}{relative}"

    def get_listing(self, pk: int) -> dict[str, Any]:
        """Fetch a single listing by primary key (includes `can_direct_apply`)."""
        url = f"{self.base_url}{_LISTING_PATH}{pk}/"
        return self._get(url, params={"expand": ",".join(self.expand)})

    def iter_listings(self) -> Iterator[dict[str, Any]]:
        """Yield every published listing, page by page (limit/offset)."""
        offset = 0
        total: int | None = None
        while True:
            params = {
                "limit": self.page_limit,
                "offset": offset,
                "expand": ",".join(self.expand),
            }
            page = self._get(f"{self.base_url}{_LISTING_PATH}", params=params)
            if total is None:
                total = page.get("count")
                log.info("Flatfox feed reports %s total listings", total)
            results = page.get("results") or []
            yield from results
            if not page.get("next") or not results:
                break
            offset += self.page_limit
            if self.page_delay:
                time.sleep(self.page_delay)

    def iter_housing_listings(self) -> Iterator[dict[str, Any]]:
        """Same as iter_listings() but filtered to rentable housing only.

        Skips parking/commercial/etc. using the configured offer types and
        object categories.
        """
        offer_types = set(settings.flatfox_offer_types)
        categories = set(settings.flatfox_categories)
        for listing in self.iter_listings():
            if listing.get("offer_type") in offer_types and (
                listing.get("object_category") in categories
            ):
                yield listing

    @staticmethod
    def parse_images(listing: dict[str, Any]) -> list[FlatfoxImage]:
        """Extract image objects from an expanded listing. Empty if not expanded."""
        images: list[FlatfoxImage] = []
        for img in listing.get("images") or []:
            if not isinstance(img, dict):
                # Not expanded -> bare integer ID; nothing usable here.
                continue
            images.append(
                FlatfoxImage(
                    pk=img.get("pk"),
                    caption=img.get("caption"),
                    url=img.get("url"),
                    url_thumb_m=img.get("url_thumb_m"),
                    width=img.get("width"),
                    height=img.get("height"),
                )
            )
        return images

    # ── internals ───────────────────────────────────────────────────────────

    def _get(self, url: str, params: dict[str, Any]) -> dict[str, Any]:
        last_exc: Exception | None = None
        for attempt in range(1, self.max_retries + 1):
            try:
                resp = self.session.get(url, params=params, timeout=self.timeout)
                resp.raise_for_status()
                return resp.json()
            except requests.RequestException as exc:
                last_exc = exc
                backoff = 2 ** (attempt - 1)
                log.warning(
                    "Flatfox GET failed (attempt %s/%s): %s — retrying in %ss",
                    attempt,
                    self.max_retries,
                    exc,
                    backoff,
                )
                time.sleep(backoff)
        raise RuntimeError(f"Flatfox GET {url} failed after {self.max_retries} attempts") from last_exc
