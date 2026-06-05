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
- Batch AI (listing extraction, matching) → Python worker only.
- On-demand AI (profile parsing, message drafting) → Next.js API routes via @anthropic-ai/sdk.
- Python worker and Next.js do NOT call each other. They share Postgres.
- All Flatfox API calls go through /worker/flatfox_client.py, which implements BaseListingClient.
- New platforms = new client implementing BaseListingClient. Don't modify ingestion logic.
- Images: prepend https://flatfox.ch to relative /thumb/ URLs from the API.
- Ingestion: always pass &expand=images,documents,attributes.
- Filter ingestion: only RENT + APARTMENT/SHARED/HOUSE (skip parking/commercial).
- PII anonymization: NEVER send real user names, emails, or phone numbers to the Claude API. Strip PII before all API calls. For message generation, use placeholders ({STUDENT_NAME} etc.) and substitute after the response. See BUILD-SPEC.md §6.

## Build Progress

Tasks 1–11 are **done and committed**. Resume from task 12.

| # | Task | Status | Key files |
|---|------|--------|-----------|
| 1 | Scaffold | ✅ | monorepo structure, docker-compose, package.json, pyproject.toml |
| 2 | DB migrations | ✅ | `app/prisma/schema.prisma` (6 tables), `shared/migrations/` |
| 3 | Flatfox client | ✅ | `worker/src/flatfox_worker/flatfox_client.py` — pagination, filtering, retry |
| 4 | Ingestion job | ✅ | `worker/src/flatfox_worker/ingestion.py` — upsert, flag removed |
| 5 | Listing extractor | ✅ | `worker/src/flatfox_worker/extractor.py`, `worker/prompts/extract_listing.txt`, `pii.py` |
| 6 | Matching engine | ✅ | `worker/src/flatfox_worker/matcher.py` — two-layer scoring, 35 tests |
| 7 | Message drafter | ✅ | `app/api/matches/[id]/draft/route.ts`, `app/lib/prompts/draft_message.ts`, `app/lib/pii.ts` |
| 8 | Auth | ✅ | `app/lib/auth-options.ts`, `app/api/auth/signup/route.ts`, `app/api/auth/[...nextauth]/route.ts` |
| 9 | Onboarding | ✅ | `app/app/onboarding/page.tsx`, `app/api/profile/route.ts`, `app/api/profile/parse/route.ts`, `app/lib/prompts/parse_profile.ts`, `app/middleware.ts` |
| 10 | Dashboard | ✅ | `app/app/dashboard/page.tsx`, `app/api/matches/route.ts`, `app/api/matches/[id]/route.ts` |
| 11 | Match detail | ✅ | `app/app/match/[id]/page.tsx`, `app/api/matches/[id]/route.ts` (GET), `app/api/matches/[id]/message/route.ts` |
| 12 | Settings | 🔲 | |
| 13 | Email digest | 🔲 | |
| 14 | Compliance | 🔲 | |
| 15 | PII + security | 🔲 | |

**Test suite:** `cd worker && pytest` → 74 tests all passing.
**Type check:** `cd app && npx tsc --noEmit` → 0 errors.

## Current Tasks
See BUILD-SPEC.md §8 for the full task list. Work through tasks in order (1→15).
Each task = a working, testable increment. Commit after each.

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
