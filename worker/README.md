# /worker — Python worker

Ingestion, AI listing extraction (Haiku), matching engine, and message drafting
(Sonnet). Reads/writes the same Postgres database that `/app` uses.

## Setup

```bash
cd worker
python -m venv .venv
# Windows PowerShell:
.venv\Scripts\Activate.ps1
# macOS/Linux:
# source .venv/bin/activate
pip install -r requirements.txt
pip install -e .            # installs the flatfox_worker package (src layout)
```

Config is read from the repo-root `.env` (shared with `/app`) — see `.env.example`.

## Smoke test (verifies the live Flatfox client)

```bash
python -m flatfox_worker.main smoke
```

Fetches a handful of **housing** listings (RENT + APARTMENT/SHARED/HOUSE, filtered
client-side) and prints pk / category / rent / city / image URL. No DB or API key
required — good first check that networking + filtering work.

## Layout

```
worker/
├── pyproject.toml
├── requirements.txt
└── src/flatfox_worker/
    ├── config.py          # env-driven settings (loads root .env)
    ├── flatfox_client.py  # ✅ working: limit/offset + expand + housing filter
    └── main.py            # entry point; `smoke` command today
```

## Next tasks (PROJECT-PLAN §14)

- **#4 Ingestion job** — upsert listings into Postgres, flag removed/reserved.
- **#5 Listing attribute extractor** — Haiku 4.5 + prompt caching + Batch API.
- **#6 Matching engine** — two-layer score + rationale.
- **#7 Message drafter** — Sonnet 4.6 per requested match.
- Scheduling via APScheduler every `INGESTION_INTERVAL_MINUTES`.
