"""Central configuration, loaded from the repo-root .env (shared with /app)."""

from __future__ import annotations

import os
from dataclasses import dataclass, field
from pathlib import Path

from dotenv import load_dotenv

# Load the single root-level .env (../../.env relative to this file:
# worker/src/flatfox_worker/config.py -> repo root).
_REPO_ROOT = Path(__file__).resolve().parents[3]
load_dotenv(_REPO_ROOT / ".env")


def _csv(name: str, default: str) -> list[str]:
    raw = os.getenv(name, default)
    return [item.strip() for item in raw.split(",") if item.strip()]


@dataclass(frozen=True)
class Settings:
    # Infra
    database_url: str = os.getenv("DATABASE_URL", "postgresql://flatfox:flatfox@localhost:5432/flatfox")
    redis_url: str = os.getenv("REDIS_URL", "redis://localhost:6379")
    anthropic_api_key: str = os.getenv("ANTHROPIC_API_KEY", "")

    # Worker behaviour
    ingestion_interval_minutes: int = int(os.getenv("INGESTION_INTERVAL_MINUTES", "30"))
    match_score_threshold: float = float(os.getenv("MATCH_SCORE_THRESHOLD", "0.5"))

    # Flatfox API (verified live 2026-06-03 — see PROJECT-PLAN §3)
    flatfox_base_url: str = os.getenv("FLATFOX_BASE_URL", "https://flatfox.ch")
    flatfox_page_limit: int = int(os.getenv("FLATFOX_PAGE_LIMIT", "100"))
    flatfox_page_delay_seconds: float = float(os.getenv("FLATFOX_PAGE_DELAY_SECONDS", "0.5"))
    flatfox_expand: list[str] = field(
        default_factory=lambda: _csv("FLATFOX_EXPAND", "images,documents,attributes")
    )
    flatfox_offer_types: list[str] = field(
        default_factory=lambda: _csv("FLATFOX_OFFER_TYPES", "RENT")
    )
    flatfox_categories: list[str] = field(
        default_factory=lambda: _csv("FLATFOX_CATEGORIES", "APARTMENT,SHARED,HOUSE")
    )


settings = Settings()
