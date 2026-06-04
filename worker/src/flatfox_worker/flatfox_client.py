from abc import ABC, abstractmethod
from collections.abc import Iterator
from typing import Any

from pydantic import BaseModel


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


class FlatfoxClient(BaseListingClient):
    def fetch_listings(self) -> Iterator[NormalizedListing]:
        raise NotImplementedError("Task 3: implement Flatfox API client")
