# Flatfox Finder

Automated student-housing search for Switzerland. Build a profile (form or
free-text), get continuously matched against **live Flatfox listings** via the
official public API, and get a personalised contact message drafted for every
strong match — first to the right places, fully legally (no scraping).

See [`PROJECT-PLAN_4.md`](./PROJECT-PLAN_4.md) for the full spec.

## Monorepo layout

```
/app        → Next.js 14 (TypeScript): frontend, API routes, NextAuth, Prisma
/worker     → Python: ingestion, AI extraction (Haiku), matching, drafting (Sonnet)
/shared     → DB extensions/init, cross-cutting SQL
docker-compose.yml  → local Postgres + Redis
.env.example        → single shared config for app + worker
```

Architecture: a Python worker does scheduled batch AI work (listing extraction,
matching) and writes Postgres; the Next.js app does on-demand AI (profile parsing,
message drafting) and reads/writes the same Postgres. Postgres is the single source
of truth. (PROJECT-PLAN §5.)

## Prerequisites

- **Node.js 18+** and npm (for `/app`) — *not yet installed on this machine.*
- **Python 3.11+** (for `/worker`).
- **Docker** (for local Postgres + Redis).

## Quick start

```bash
# 1. Config
cp .env.example .env          # then fill in ANTHROPIC_API_KEY, NEXTAUTH_SECRET

# 2. Infrastructure (Postgres + Redis)
docker compose up -d

# 3. Worker
cd worker
python -m venv .venv && .venv\Scripts\Activate.ps1   # PowerShell
pip install -r requirements.txt && pip install -e .
python -m flatfox_worker.main smoke                  # hits the live Flatfox API

# 4. App (after installing Node.js)
cd ../app
npm install
npm run prisma:generate
npm run dev                                           # http://localhost:3000
```

## Status

Scaffold complete. The Flatfox API client (`/worker`) is **functional and verified
against the live API** (limit/offset pagination, `expand` image resolution, housing
filter). Next: **Task #2 — full database schema** (PROJECT-PLAN §6).

| Component | State |
|---|---|
| Monorepo + docker-compose + shared `.env` | ✅ |
| Next.js app shell (landing, layout, Prisma client, Tailwind) | ✅ scaffold |
| Python worker + **working Flatfox client** + smoke test | ✅ |
| Database schema / migrations | ⬜ next (Task #2) |
| Auth, onboarding, matching, messaging | ⬜ |
