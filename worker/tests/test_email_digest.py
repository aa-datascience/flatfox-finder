"""Tests for email digest module."""

from unittest.mock import MagicMock, patch

from flatfox_worker.email_digest import _build_email_body, _load_digest_data


def _make_user(total_new: int = 3, top_count: int = 3) -> dict:
    top = [
        {
            "score": 90 - i * 10,
            "rationale": f"Budget ✓, location ✓" if i == 0 else "Budget ✓",
            "title": f"Listing {i + 1}",
            "city": "Zürich",
            "rent_gross": 1200.0 + i * 100,
        }
        for i in range(top_count)
    ]
    return {
        "user_id": "user-1",
        "email": "test@example.com",
        "name": "Alice",
        "locale": "en",
        "total_new": total_new,
        "top_matches": top,
    }


class TestBuildEmailBody:
    def test_single_match(self) -> None:
        user = _make_user(total_new=1, top_count=1)
        subject, plain, html = _build_email_body(user)

        assert "1 new match!" in subject
        assert "match" in subject
        assert "matches" not in subject
        assert "Hi Alice" in plain
        assert "Listing 1" in plain
        assert "Zürich" in plain

    def test_multiple_matches(self) -> None:
        user = _make_user(total_new=5, top_count=3)
        subject, plain, html = _build_email_body(user)

        assert "5 new matches!" in subject
        assert "Listing 1" in plain
        assert "Listing 2" in plain
        assert "Listing 3" in plain
        assert "and 2 more" in plain

    def test_html_contains_table(self) -> None:
        user = _make_user(total_new=2, top_count=2)
        _, _, html = _build_email_body(user)

        assert "<table" in html
        assert "Listing 1" in html
        assert "dashboard" in html

    def test_no_name_fallback(self) -> None:
        user = _make_user()
        user["name"] = None
        _, plain, _ = _build_email_body(user)

        assert "Hi there" in plain

    def test_price_unknown(self) -> None:
        user = _make_user(total_new=1, top_count=1)
        user["top_matches"][0]["rent_gross"] = None
        _, plain, _ = _build_email_body(user)

        assert "Price unknown" in plain

    def test_no_extra_matches_line_when_under_top_n(self) -> None:
        user = _make_user(total_new=2, top_count=2)
        _, plain, _ = _build_email_body(user)

        assert "more" not in plain


class TestLoadDigestData:
    def test_loads_users_with_new_matches(self) -> None:
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_conn.cursor.return_value.__enter__ = MagicMock(return_value=mock_cursor)
        mock_conn.cursor.return_value.__exit__ = MagicMock(return_value=False)

        mock_cursor.fetchall.side_effect = [
            [("user-1", "alice@test.com", "Alice", "en")],
            [(0.85, "Budget ✓", "Nice flat", "Zürich", 1200.0)],
        ]

        users = _load_digest_data(mock_conn)

        assert len(users) == 1
        assert users[0]["email"] == "alice@test.com"
        assert users[0]["total_new"] == 1
        assert users[0]["top_matches"][0]["title"] == "Nice flat"

    def test_empty_when_no_new_matches(self) -> None:
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_conn.cursor.return_value.__enter__ = MagicMock(return_value=mock_cursor)
        mock_conn.cursor.return_value.__exit__ = MagicMock(return_value=False)

        mock_cursor.fetchall.return_value = []

        users = _load_digest_data(mock_conn)
        assert len(users) == 0
