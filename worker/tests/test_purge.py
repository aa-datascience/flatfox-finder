"""Tests for listing purge module."""

from datetime import datetime, timedelta, timezone
from unittest.mock import MagicMock, patch

from flatfox_worker.purge import PURGE_AFTER_DAYS, run_purge


class TestRunPurge:
    def _make_conn(self, rowcount: int = 0) -> MagicMock:
        mock_conn = MagicMock()
        mock_cursor = MagicMock()
        mock_cursor.rowcount = rowcount
        mock_conn.cursor.return_value.__enter__ = MagicMock(return_value=mock_cursor)
        mock_conn.cursor.return_value.__exit__ = MagicMock(return_value=False)
        return mock_conn, mock_cursor

    @patch("flatfox_worker.purge.psycopg2")
    def test_purges_old_unmatched_listings(self, mock_pg: MagicMock) -> None:
        mock_conn, mock_cursor = self._make_conn(rowcount=5)
        mock_pg.connect.return_value = mock_conn

        result = run_purge("postgresql://test")

        assert result == 5
        mock_cursor.execute.assert_called_once()
        sql = mock_cursor.execute.call_args[0][0]
        assert "removed_at" in sql
        assert "NOT IN" in sql
        mock_conn.commit.assert_called_once()
        mock_conn.close.assert_called_once()

    @patch("flatfox_worker.purge.psycopg2")
    def test_returns_zero_when_nothing_to_purge(self, mock_pg: MagicMock) -> None:
        mock_conn, mock_cursor = self._make_conn(rowcount=0)
        mock_pg.connect.return_value = mock_conn

        result = run_purge("postgresql://test")

        assert result == 0
        mock_conn.commit.assert_called_once()

    @patch("flatfox_worker.purge.psycopg2")
    def test_cutoff_date_is_90_days_ago(self, mock_pg: MagicMock) -> None:
        mock_conn, mock_cursor = self._make_conn(rowcount=0)
        mock_pg.connect.return_value = mock_conn

        run_purge("postgresql://test")

        cutoff_arg = mock_cursor.execute.call_args[0][1][0]
        expected = datetime.now(timezone.utc) - timedelta(days=PURGE_AFTER_DAYS)
        assert abs((cutoff_arg - expected).total_seconds()) < 5

    @patch("flatfox_worker.purge.psycopg2")
    def test_rollback_on_error(self, mock_pg: MagicMock) -> None:
        mock_conn, mock_cursor = self._make_conn()
        mock_pg.connect.return_value = mock_conn
        mock_cursor.execute.side_effect = RuntimeError("db error")

        try:
            run_purge("postgresql://test")
        except RuntimeError:
            pass

        mock_conn.rollback.assert_called_once()
        mock_conn.close.assert_called_once()
