# Student Housing Automation App

## What this is
SaaS web app that matches students with Flatfox housing listings using AI.
Technical spec in BUILD-SPEC.md — read the relevant section before starting any task.
Full business context in PROJECT-PLAN.md (only if you need background).

## API verified live (2026-06-03)
- Endpoint: GET https://flatfox.ch/api/v1/public-listing/?limit=100&offset=0&expand=images,documents,attributes
- No auth required. Pagination via limit/offset (NOT page).
- ~35k total listings; filter to offer_type=RENT + object_category in (APARTMENT, SHARED, HOUSE).
- Images: bare int IDs by default; use &expand=images to get objects with signed /thumb/ URLs.
- Prepend https://flatfox.ch to all relative paths (/thumb/ff/...).
- No rate limiting observed.

## Tech Stack
- Frontend: Next.js 14+ (TypeScript), NextAuth.js (email+password, bcrypt)
- Backend/worker: Python 3.11+ (ingestion, extraction, matching)
- Database: PostgreSQL (shared by both)
- Cache/queue: Redis
- LLM: Anthropic Claude API (Haiku 4.5 for extraction, Sonnet 4.6 for messages)
- Local dev: docker-compose (Postgres + Redis)

## Project Structure
```
/app          → Next.js (frontend + API routes + auth)
/worker       → Python (ingestion, extraction, matching)
/shared       → DB migrations, fixtures, seed data
docker-compose.yml
BUILD-SPEC.md → technical reference (read per task)
CLAUDE.md     → this file
.env
```

## Commands
- `docker-compose up -d` — start local Postgres + Redis
- `cd app && npm install && npm run dev` — start Next.js dev server
- `cd worker && pip install -r requirements.txt && python main.py` — run worker
- `cd app && npm test` — run frontend tests
- `cd worker && pytest` — run worker tests
- `cd shared && python seed.py` — seed local DB with sample listings + test profiles

## Coding Rules
- TypeScript strict mode in /app. No `any` types.
- Python type hints everywhere in /worker. Use pydantic for data models.
- All AI prompts live in dedicated files: /worker/prompts/ and /app/lib/prompts/
- Environment variables via .env — never hardcode secrets.
- Error handling: every AI call wrapped in try/catch with a user-facing fallback.
- Database: use Prisma in Next.js, psycopg2/asyncpg in Python. Same Postgres.
- API routes: follow the exact contract in BUILD-SPEC.md §4. Do not invent new routes.
- When changing the Prisma schema, update the Python pydantic models to match.
- Commit messages: conventional commits (feat:, fix:, chore:).

## Architecture Rules
- Batch AI (listing extraction) → Python worker only.
- Matching → dual: Python worker (batch, for new listings) AND Next.js (on-demand, when profile saved). TypeScript matcher in `app/lib/matcher.ts` mirrors Python `worker/src/flatfox_worker/matcher.py` — keep in sync.
- On-demand AI (profile parsing, message drafting) → Next.js API routes via @anthropic-ai/sdk.
- Python worker and Next.js do NOT call each other. They share Postgres (and independent matching logic).
- All Flatfox API calls go through /worker/flatfox_client.py, which implements BaseListingClient.
- New platforms = new client implementing BaseListingClient. Don't modify ingestion logic.
- Images: prepend https://flatfox.ch to relative /thumb/ URLs from the API.
- Ingestion: always pass &expand=images,documents,attributes.
- Filter ingestion: only RENT + APARTMENT/SHARED/HOUSE (skip parking/commercial).
- PII anonymization: NEVER send real user names, emails, or phone numbers to the Claude API. Strip PII before all API calls. For message generation, use placeholders ({STUDENT_NAME} etc.) and substitute after the response. See BUILD-SPEC.md §6.

## Build Progress

All 15 tasks are **done and committed**. App is **live on Railway**.

| # | Task | Status | Key files |
|---|------|--------|-----------|
| 1 | Scaffold | ✅ | monorepo structure, docker-compose, package.json, pyproject.toml |
| 2 | DB migrations | ✅ | `app/prisma/schema.prisma` (6 tables), `shared/migrations/` |
| 3 | Flatfox client | ✅ | `worker/src/flatfox_worker/flatfox_client.py` — pagination, filtering, retry |
| 4 | Ingestion job | ✅ | `worker/src/flatfox_worker/ingestion.py` — upsert, flag removed |
| 5 | Listing extractor | ✅ | `worker/src/flatfox_worker/extractor.py`, `worker/prompts/extract_listing.txt`, `pii.py` |
| 6 | Matching engine | ✅ | `worker/src/flatfox_worker/matcher.py` (batch), `app/lib/matcher.ts` (on-demand) — two-layer scoring |
| 7 | Message drafter | ✅ | `app/app/api/matches/[id]/draft/route.ts`, `app/lib/prompts/draft_message.ts`, `app/lib/pii.ts` |
| 8 | Auth | ✅ | `app/lib/auth-options.ts`, `app/app/api/auth/signup/route.ts`, `app/app/api/auth/[...nextauth]/route.ts` |
| 9 | Onboarding | ✅ | `app/app/onboarding/page.tsx`, `app/app/api/profile/route.ts`, `app/app/api/profile/parse/route.ts`, `app/lib/prompts/parse_profile.ts`, `app/middleware.ts` |
| 10 | Dashboard | ✅ | `app/app/dashboard/page.tsx`, `app/app/api/matches/route.ts`, `app/app/api/matches/[id]/route.ts` |
| 11 | Match detail | ✅ | `app/app/match/[id]/page.tsx`, `app/app/api/matches/[id]/route.ts` (GET), `app/app/api/matches/[id]/message/route.ts` |
| 12 | Settings | ✅ | `app/app/settings/page.tsx`, `app/app/api/settings/password/route.ts`, `app/app/api/account/route.ts` |
| 13 | Email digest | ✅ | `worker/src/flatfox_worker/email_digest.py`, `worker/tests/test_email_digest.py` |
| 14 | Compliance | ✅ | `app/app/privacy/page.tsx`, `worker/src/flatfox_worker/purge.py`, `worker/tests/test_purge.py` |
| 15 | PII + security | ✅ | `app/lib/rate-limit.ts`, `app/lib/auth-options.ts` (rate limiting), `.github/workflows/ci.yml` |

**Test suite:** `cd worker && pytest` → 86 tests all passing.
**Type check:** `cd app && npx tsc --noEmit` → 0 errors.

## Critical file structure note
API routes are in `app/app/api/` (inside the Next.js `app/` directory), NOT `app/api/`.
Pages are in `app/app/` (e.g. `app/app/dashboard/page.tsx`).
The Next.js project root is `/app`, and the App Router directory is `/app/app/`.

## Deployment (Railway)
- **URL**: https://flatfox-finder-production.up.railway.app
- **GitHub**: https://github.com/antoine-design8737/flatfox-finder
- Railway auto-deploys on push to master.
- 4 Railway services: Next.js app, Python worker, Postgres, Redis.
- Worker root dir: `worker/`, Next.js root dir: `app/`.
- Worker runs as a cron job: `*/30 * * * *` (every 30 min).

## Environment variables (Railway)
Both services need these set in Railway Variables tab:

**Next.js app service:**
- `DATABASE_URL` — from Postgres service
- `NEXTAUTH_SECRET` — random base64 string
- `NEXTAUTH_URL` — https://flatfox-finder-production.up.railway.app
- `ANTHROPIC_API_KEY` — vsk-... key

**Worker service:**
- `DATABASE_URL` — same Postgres URL
- `REDIS_URL` — from Redis service
- `ANTHROPIC_API_KEY` — same key

## AI Models (verified working with this API key)
Available models for this account (from /api/debug/models):
- `claude-sonnet-4-5-20250929` — used for message drafting
- `claude-haiku-4-5-20251001` — used for listing extraction and profile parsing
- Also available: claude-opus-4-5-20251101, claude-opus-4-6, claude-sonnet-4-6, claude-opus-4-7, claude-opus-4-8

## Worker behaviour
- Ingestion: fetches max 50 pages (5000 listings) per run — configurable via `FLATFOX_MAX_PAGES`
- Extraction: processes max 500 listings per run — configurable via `MAX_EXTRACTIONS_PER_RUN` in extractor.py
- ~20k listings in DB total; extraction backlog processed gradually over multiple runs
- Flatfox API returns zipcode as int — normalised to str in flatfox_client.py
- Flatfox listing status is normalised to "active" in _normalize() — matcher queries for status='active'


## Don'ts
- Don't scrape Flatfox HTML. Only use the official API.
- Don't store passwords in plain text. Use bcrypt.
- Don't call the Anthropic API without error handling and a fallback.
- Don't put AI prompts as inline strings — use prompt files.
- Don't skip TypeScript types or Python type hints.
- Don't use ?page=N for Flatfox pagination — use ?limit=N&offset=M.
- Don't forget &expand=images,documents,attributes on listing fetches.
- Don't send user PII (name, email, phone) to the Claude API. Use the PII sanitizer.
- Don't log PII (emails, passwords, profile text). Log anonymised events only.
- Don't invent API routes — follow BUILD-SPEC.md §4 exactly.
