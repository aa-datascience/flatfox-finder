import json
from unittest.mock import MagicMock, patch

import httpx
import pytest

from flatfox_worker.flatfox_client import FlatfoxClient, NormalizedListing, _normalize


def _make_raw_listing(**overrides):
    base = {
        "pk": 12345,
        "slug": "test-listing",
        "url": "/en/flat/test-listing",
        "status": "active",
        "offer_type": "RENT",
        "object_category": "APARTMENT",
        "object_type": "FLAT",
        "rent_net": 1000.0,
        "rent_charges": 150.0,
        "rent_gross": 1150.0,
        "livingspace": 45.0,
        "number_of_rooms": 2.5,
        "floor": 3,
        "is_furnished": False,
        "is_temporary": False,
        "moving_date": "2026-08-01",
        "moving_date_type": "exact",
        "zipcode": "8001",
        "city": "Zürich",
        "latitude": 47.3769,
        "longitude": 8.5417,
        "description": "Nice apartment in the city center.",
        "short_title": "2.5 room flat",
        "public_title": "Bright apartment in Zürich",
        "created": "2026-05-01T10:00:00Z",
        "images": [{"pk": 1, "url": "/thumb/ff/test.jpg"}],
        "attributes": [{"name": "balcony"}],
    }
    base.update(overrides)
    return base


class TestNormalize:
    def test_valid_rent_apartment(self):
        raw = _make_raw_listing()
        result = _normalize(raw)
        assert result is not None
        assert result.pk == 12345
        assert result.city == "Zürich"
        assert result.rent_gross == 1150.0
        assert result.surface_living == 45.0
        assert result.lat == 47.3769
        assert len(result.images) == 1

    def test_valid_shared(self):
        raw = _make_raw_listing(object_category="SHARED")
        result = _normalize(raw)
        assert result is not None
        assert result.object_category == "SHARED"

    def test_valid_house(self):
        raw = _make_raw_listing(object_category="HOUSE")
        result = _normalize(raw)
        assert result is not None

    def test_filters_out_parking(self):
        raw = _make_raw_listing(object_category="PARKING")
        assert _normalize(raw) is None

    def test_filters_out_commercial(self):
        raw = _make_raw_listing(object_category="COMMERCIAL")
        assert _normalize(raw) is None

    def test_filters_out_sale(self):
        raw = _make_raw_listing(offer_type="SALE")
        assert _normalize(raw) is None

    def test_handles_none_images(self):
        raw = _make_raw_listing(images=None)
        result = _normalize(raw)
        assert result is not None
        assert result.images == []

    def test_handles_missing_optional_fields(self):
        raw = {
            "pk": 99,
            "slug": "minimal",
            "url": "/en/flat/minimal",
            "status": "active",
            "offer_type": "RENT",
            "object_category": "APARTMENT",
        }
        result = _normalize(raw)
        assert result is not None
        assert result.rent_gross is None
        assert result.city is None


class TestFlatfoxClient:
    def _make_response(self, results, count=None):
        if count is None:
            count = len(results)
        return {"count": count, "next": None, "previous": None, "results": results}

    def test_single_page(self):
        client = FlatfoxClient(page_size=100, page_delay=0)
        raw = _make_raw_listing()
        mock_resp = MagicMock()
        mock_resp.json.return_value = self._make_response([raw], count=1)
        mock_resp.raise_for_status = MagicMock()

        with patch.object(client.client, "get", return_value=mock_resp):
            listings = list(client.fetch_listings())

        assert len(listings) == 1
        assert listings[0].pk == 12345

    def test_pagination(self):
        client = FlatfoxClient(page_size=2, page_delay=0)

        page1 = self._make_response(
            [_make_raw_listing(pk=1), _make_raw_listing(pk=2)], count=3
        )
        page2 = self._make_response([_make_raw_listing(pk=3)], count=3)

        mock_resp1 = MagicMock()
        mock_resp1.json.return_value = page1
        mock_resp1.raise_for_status = MagicMock()

        mock_resp2 = MagicMock()
        mock_resp2.json.return_value = page2
        mock_resp2.raise_for_status = MagicMock()

        with patch.object(client.client, "get", side_effect=[mock_resp1, mock_resp2]):
            listings = list(client.fetch_listings())

        assert len(listings) == 3
        assert [l.pk for l in listings] == [1, 2, 3]

    def test_filters_during_pagination(self):
        client = FlatfoxClient(page_size=100, page_delay=0)
        results = [
            _make_raw_listing(pk=1, offer_type="RENT", object_category="APARTMENT"),
            _make_raw_listing(pk=2, offer_type="RENT", object_category="PARKING"),
            _make_raw_listing(pk=3, offer_type="SALE", object_category="APARTMENT"),
        ]
        mock_resp = MagicMock()
        mock_resp.json.return_value = self._make_response(results, count=3)
        mock_resp.raise_for_status = MagicMock()

        with patch.object(client.client, "get", return_value=mock_resp):
            listings = list(client.fetch_listings())

        assert len(listings) == 1
        assert listings[0].pk == 1

    def test_retry_on_failure(self):
        client = FlatfoxClient(page_size=100, page_delay=0, max_retries=2)

        fail_resp = MagicMock()
        fail_resp.raise_for_status.side_effect = httpx.HTTPStatusError(
            "500", request=MagicMock(), response=MagicMock()
        )

        ok_resp = MagicMock()
        ok_resp.json.return_value = self._make_response([_make_raw_listing()], count=1)
        ok_resp.raise_for_status = MagicMock()

        with patch.object(client.client, "get", side_effect=[fail_resp, ok_resp]):
            with patch("flatfox_worker.flatfox_client.time.sleep"):
                listings = list(client.fetch_listings())

        assert len(listings) == 1

    def test_retry_exhausted_raises(self):
        client = FlatfoxClient(page_size=100, page_delay=0, max_retries=2)

        fail_resp = MagicMock()
        fail_resp.raise_for_status.side_effect = httpx.HTTPStatusError(
            "500", request=MagicMock(), response=MagicMock()
        )

        with patch.object(client.client, "get", return_value=fail_resp):
            with patch("flatfox_worker.flatfox_client.time.sleep"):
                with pytest.raises(RuntimeError, match="failed after 2 retries"):
                    list(client.fetch_listings())

    def test_expand_param_passed(self):
        client = FlatfoxClient(page_size=100, page_delay=0)
        mock_resp = MagicMock()
        mock_resp.json.return_value = self._make_response([], count=0)
        mock_resp.raise_for_status = MagicMock()

        with patch.object(client.client, "get", return_value=mock_resp) as mock_get:
            list(client.fetch_listings())

        call_kwargs = mock_get.call_args
        params = call_kwargs.kwargs.get("params") or call_kwargs[1].get("params")
        assert params["expand"] == "images,documents,attributes"
        assert params["limit"] == 100
        assert params["offset"] == 0
