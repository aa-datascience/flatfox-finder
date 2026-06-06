# BUILD-SPEC.md — Technical Reference for Claude Code

> This file contains everything needed to build the app. Read the relevant section before each task.
> Business context (costs, pricing, roadmap, platform research) is in PROJECT-PLAN.md — not needed for coding.

---

## §1. Flatfox API Reference

**Base URL:** `https://flatfox.ch/api/v1/`
**Auth:** none required (public endpoint).

| Endpoint | Method | Description |
|---|---|---|
| `/api/v1/public-listing/` | GET | List all published listings (paginated via `limit`/`offset`). |
| `/api/v1/public-listing/:pk/` | GET | Fetch a single listing by ID. |

**Pagination:** `?limit=100&offset=0` (NOT `?page=N`). Response: `{ count, next, previous, results[] }`.

**Required query param:** always pass `&expand=images,documents,attributes` — without it, images/documents are bare integer IDs.

**Server-side filters:** `pk`, `organization`, `organization__slug`. No city/price/rooms filters — fetch everything, filter locally.

**Total volume:** ~35,134 listings. ~40% is parking/commercial. **Filter to:** `offer_type = RENT` AND `object_category ∈ {APARTMENT, SHARED, HOUSE}` → ~15–20k relevant listings.

**Rate limits:** none observed. Be polite — add a small delay between pages.

**Image handling:** each expanded image object:
```json
{ "pk": 29927114, "caption": "", 
  "url": "/thumb/ff/2025/10/<hash>.jpg?signature=<sig>",
  "url_thumb_m": "/thumb/ff/.../<hash>.jpg?alias=thumb_m&signature=<sig>",
  "url_listing_search": "/thumb/ff/.../<hash>.jpg?alias=listing_search&signature=<sig>",
  "ordering": 1, "width": 1500, "height": 1000 }
```
Prepend `https://flatfox.ch` to all relative paths. Use `url_thumb_m` for cards, `url` for full-size.

**Contact signals:** listings carry `submit_url` and `can_direct_apply`. Whether programmatic submission is ToS-permitted is **unconfirmed** — do NOT auto-submit. Ship review-then-send only (user copies message, sends on Flatfox manually).

### Listing data model

**Structured fields:** `pk`, `slug`, `url`, `short_url`, `status`, `created`, `offer_type`, `object_category`, `object_type`, `ref_property`, `ref_house`, `ref_object`, `price_display`, `price_display_type`, `price_unit`, `rent_net`, `rent_charges`, `rent_gross`, `livingspace`, `number_of_rooms`, `floor`, `is_furnished`, `is_temporary`, `is_selling_furniture`, `street`, `zipcode`, `city`, `public_address`, `latitude`, `longitude`, `year_built`, `moving_date_type`, `moving_date`.

**Free-text fields (for AI extraction):** `description`, `short_title`, `public_title`, `rent_title`, `description_title`.

**Media/relations:** `cover_image`, `images[]`, `documents[]`, `video_url`, `tour_url`, `website_url`, `agency` (object: name, name_2, street, zipcode, city, country, logo), `attributes[]`.

**Object categories for student housing:** `APPT` (apartment, studio, single room, furnished), `HOUSE`, `SHARED` (WG/flatshare — prime student fit).

---

## §2. Architecture & Pipeline

### Components

1. **Ingestion worker** (Python, APScheduler cron) — polls Flatfox API every 30 minutes (`INGESTION_INTERVAL_MINUTES`). Always passes `&expand=images,documents,attributes`. Filters to `RENT` + `APARTMENT/SHARED/HOUSE`. Upserts to `listings`, flags removed.

   **Error recovery:** crashes are safe — next run re-fetches from offset 0 (upserts are idempotent).

   **Extensibility:** implements `BaseListingClient` interface:
   ```python
   class BaseListingClient(ABC):
       @abstractmethod
       def fetch_listings(self) -> Iterator[NormalizedListing]: ...
   ```
   New platforms = new client implementing this interface.

2. **Profile builder** — form fields + optional free-text AI parsing → unified `user_profiles`.
3. **Matching engine** — two-layer scoring (see below).
4. **Message generator** — AI-drafted contact message per match.
5. **User app** (Next.js) — matches, profile, messages.

### Worker pipeline sequencing (`main.py` = long-running APScheduler process)

1. **Every N minutes:** run ingestion → upsert listings.
2. **Immediately after:** run extraction on listings missing `listing_attributes`. Sequential Haiku calls (~0.5s each); for >100 new listings, use Batch API (submit all, poll, write when complete). **Matching waits until extraction finishes.**
3. **After extraction:** run matching for all active profiles × newly ingested/extracted listings. Insert matches above threshold. Queue digest notifications.

Steps run in strict sequence, never overlap.

### Communication pattern

- **Batch AI** (extraction) → Python worker, reads/writes Postgres directly.
- **On-demand matching** — scoring logic runs in both: Python worker (batch, for new listings) AND Next.js (on-demand, when profile is saved via `PUT /api/profile`). The TypeScript matcher in `app/lib/matcher.ts` mirrors the Python logic in `worker/src/flatfox_worker/matcher.py`. Keep them in sync.
- **On-demand AI** (profile parsing, message drafting) → Next.js API routes via `@anthropic-ai/sdk` (TypeScript).
- **Shared state:** Postgres is the single source of truth. Python and Next.js do NOT call each other (except they share matching logic independently).

### Matching engine (two-layer)

**Shared attribute schema** (used identically by profile parser, listing extractor, and matching engine):
```json
{
  "vibe":            "quiet" | "social" | "mixed" | null,
  "languages":       ["de","fr","en","it","es","pt","other"],
  "flatmate_count":  int | null,
  "pets_ok":         bool | null,
  "smoking_ok":      bool | null,
  "gender_pref":     "any" | "female_only" | "male_only" | null,
  "move_in_flexible": bool | null
}
```

**Layer 1 structured score (0–1):**
- `price_score`: 1.0 if `rent_gross ≤ budget`; linear decay to 0 at 130%; **hard cut** above 130%.
- `location_score`: 1.0 if within `radius_km`; linear decay to 0 at 2×; **hard cut** above 2×.
- `rooms_score`: 1.0 if `number_of_rooms ≥ rooms_min`; 0.5 if off by 0.5; 0 otherwise.
- `date_score`: 1.0 if `moving_date` within window; 0.5 if within 30 days; 0 if >30 days.
- L1 = 0.35 × price + 0.30 × location + 0.15 × rooms + 0.20 × date.

**Layer 2 text score (0–1):**
- Per shared attribute: +1 match, −1 conflict, 0 if either null.
- L2 = (sum + max_possible) / (2 × max_possible).

**Final:** `score` = 0.6 × L1 + 0.4 × L2. **Threshold: ≥ 0.5.**
Store `score`, `score_breakdown` (JSON), and text `rationale` ("Budget ✓ (CHF 1150 ≤ 1200), quiet vibe ✓").

### Messaging — review-then-send (v1)

User clicks "Generate draft" → AI drafts message → user edits → clicks "Copy & Open on Flatfox" → clipboard + `window.open(https://flatfox.ch + listing.url)` → user pastes on Flatfox. Match status → "contacted."

### Data flow

```mermaid
flowchart LR
    F[Flatfox API] -->|official API| ING[Ingestion worker]
    ING --> DB[(listings DB)]
    U[User: form or free text] --> PB[Profile builder + AI parser]
    PB --> UP[(user_profiles)]
    DB --> ME[Matching engine]
    UP --> ME
    ME -->|scored matches| MQ[(matches)]
    MQ --> MG[AI message generator]
    MG --> MODE{User's mode}
    MODE -->|review| APP[User reviews/edits] --> OUT[Send via Flatfox]
    MQ --> APP2[User app: matches + status]
```

---

## §3. Database Schema

- **users** — `id`, `email`, `password_hash`, `name` (display name for messages), `locale` (de/fr/en — set at signup), `created_at`, `consent_flags` (JSON: `{ accepted_terms: bool, accepted_privacy: bool, consent_auto_send: bool }`), `plan`.
- **user_profiles** — `id`, `user_id` → users, `input_mode` (form/text/both), `raw_text`, `study_program` (e.g. "MSc Computer Science, ETH"), structured prefs: `budget_max`, `rooms_min`, `cities[]`, `radius_km`, `move_in_from`, `move_in_flexible` (bool), `furnished_pref`, text-derived: `languages[]`, `vibe`, `max_flatmates`, `pets_ok`, `smoking_ok`, `gender_pref`. `updated_at`.
- **listings** — `id` (Flatfox pk), `slug`, `url`, `status`, `offer_type`, `object_type`, `rent_net`, `rent_charges`, `rent_gross`, `surface_living`, `number_of_rooms`, `floor`, `is_furnished`, `is_temporary`, `moving_date`, `moving_date_type`, `zipcode`, `city`, `lat`, `lng`, `description`, `published`, `reserved`, `fetched_at`, `removed_at` (null while active).
- **listing_attributes** — `listing_id` → listings, AI-extracted: `flatmate_count`, `languages[]`, `vibe`, `pets`, `smoking`, `gender_pref`, `move_in_flexible`, `extraction_model`, `extracted_at`.
- **matches** — `id`, `user_id`, `listing_id` (nullable after purge), `score`, `score_breakdown` (JSON), `rationale`, `status` (new/seen/contacted/dismissed), `listing_snapshot` (JSON: title, city, price — survives listing deletion), `created_at`.
- **messages** — `id`, `match_id` → matches, `user_id`, `body`, `language`, `mode` (auto/review), `status` (draft/approved/sent/failed), `sent_at`.

**Indexes:** `listings(city, rent_gross, number_of_rooms)`, `listings(status, published)`, `matches(user_id, status)`, `matches(score)`, unique `matches(user_id, listing_id)`.

### Listing lifecycle

Soft-delete: listings that disappear from Flatfox → `status = 'removed'`, `removed_at` set. Matches/messages remain visible ("This listing is no longer available" badge). Hard-purge only listings with `removed_at > 90 days` AND no associated matches.

---

## §4. API Route Contract

| Method | Route | Auth | Request | Response | Used by |
|---|---|---|---|---|---|
| POST | `/api/auth/signup` | no | `{ email, password, name, locale }` | `{ user_id }` or `{ error }` | Signup |
| POST/GET | `/api/auth/[...nextauth]` | — | NextAuth handles | NextAuth handles | Login/logout |
| GET | `/api/profile` | yes | — | `{ profile }` or `null` | Settings, onboarding check |
| PUT | `/api/profile` | yes | `{ ...profile fields }` | `{ profile }` | Onboarding, settings |
| POST | `/api/profile/parse` | yes | `{ raw_text }` | `{ parsed_prefs }` (PII-stripped) | Onboarding free-text |
| GET | `/api/matches` | yes | `?status=new,seen&sort=score&page=1&limit=20` | `{ matches[], total, page }` | Dashboard |
| GET | `/api/matches/:id` | yes | — | `{ match, listing, attributes, message_draft? }` | Match detail |
| PATCH | `/api/matches/:id` | yes | `{ status }` | `{ match }` | Dismiss, mark seen/contacted |
| POST | `/api/matches/:id/draft` | yes | — | `{ message_body }` (PII-stripped, placeholders substituted) | Match detail |
| PUT | `/api/matches/:id/message` | yes | `{ body }` | `{ message }` | Edit draft |
| PUT | `/api/settings/password` | yes | `{ old_password, new_password }` | `{ success }` | Settings |
| DELETE | `/api/account` | yes | `{ confirm: true }` | `{ success }` (hard-delete all user data) | Settings |

"Auth: yes" = valid NextAuth session + `session.user.id === resource.user_id`. Return 401 if no session, 403 if wrong user.

---

## §5. AI Prompts

### Prompt 1 — Profile free-text parser (Haiku 4.5, Next.js API route)

> ⚠️ **Before calling:** run PII sanitizer — strip emails, phone numbers, names from `{user_raw_text}`.

```
System: You extract structured housing preferences from a student's free-text description.
Return ONLY valid JSON matching this schema, no other text:
{
  "budget_max": int|null,
  "rooms_min": float|null,
  "cities": string[]|null,
  "radius_km": int|null,
  "move_in_from": "YYYY-MM-DD"|null,
  "move_in_flexible": bool|null,
  "furnished_pref": bool|null,
  "languages": string[]|null,
  "vibe": "quiet"|"social"|"mixed"|null,
  "max_flatmates": int|null,
  "pets_ok": bool|null,
  "smoking_ok": bool|null,
  "gender_pref": "any"|"female_only"|"male_only"|null
}
If information is not mentioned, use null. Do not invent values.

User: {user_raw_text}
```

### Prompt 2 — Listing attribute extractor (Haiku 4.5, Python worker, prompt-cached)

> ⚠️ **Before calling:** strip emails/phone numbers from `{description}`.

```
System: You extract structured attributes from a Swiss housing listing.
The listing may be in German, French, Italian, or English.
Return ONLY valid JSON matching this schema, no other text:
{
  "flatmate_count": int|null,
  "languages": string[]|null,
  "vibe": "quiet"|"social"|"mixed"|null,
  "pets_ok": bool|null,
  "smoking_ok": bool|null,
  "gender_pref": "any"|"female_only"|"male_only"|null,
  "move_in_flexible": bool|null
}
If information is not stated or implied, use null. Do not guess.

User:
Title: {public_title}
Description: {description}
```

### Prompt 3 — Message generator (Sonnet 4.6, Next.js API route)

> ⚠️ **Anonymization:** send `{STUDENT_NAME}`, `{STUDENT_PROGRAM}`, `{STUDENT_LANGUAGE}` as placeholders. Substitute real values from `users.name` / `user_profiles.study_program` / `users.locale` AFTER the API call returns.

```
System: You write a short, friendly contact message from a student to a landlord/flatmate
about a housing listing. The message should:
- Be 3–5 sentences.
- Be warm and personal, not formal or generic.
- Mention 1–2 specific things about the listing that match the student's profile.
- Briefly introduce the student using the placeholders provided ({STUDENT_NAME}, {STUDENT_PROGRAM}).
- End with a polite request to visit or chat.
- Be written in the SAME LANGUAGE as the listing description.
- Do NOT include a subject line.

User:
Listing title: {public_title}
Listing description: {description}
Listing city: {city}, rent: CHF {rent_gross}/mo, rooms: {number_of_rooms}
Student profile: {STUDENT_NAME}, studying {STUDENT_PROGRAM}, speaks {STUDENT_LANGUAGE}, budget CHF {budget_max}/mo, moving from {move_in_from}
Match rationale: {rationale}
```

---

## §6. Security & PII Anonymization

**Principle: no user PII reaches the LLM.**

| Prompt | PII risk | Mitigation |
|---|---|---|
| 1 — Profile parser | User may include name, email, phone | Strip emails, phones, names before sending |
| 2 — Listing extractor | Landlord phone/email in description | Strip emails and phones |
| 3 — Message generator | Needs student identity for personalisation | Use placeholders `{STUDENT_NAME}`, `{STUDENT_PROGRAM}`, `{STUDENT_LANGUAGE}`. Substitute after API returns. |

**PII sanitizer:** shared function for all prompt pipelines. Regex patterns for emails, Swiss/intl phone numbers. If user's name is in profile, do literal string replacement. Runs before every API call.

**Other security:**
- Rate limit login: 5 failures → 15 min lockout. CSRF via NextAuth tokens.
- Passwords: bcrypt, minimum 8 chars.
- Input validation: sanitise all inputs. Prisma parameterised queries.
- API route ownership: every route checks `session.user.id === resource.user_id`.
- Secrets: `.env`, never committed. Production: Vercel/Railway env vars.
- Logging: never log PII. Log anonymised events only (user_id, action, timestamp).
- CI: `npm audit` / `pip audit` on every push.

---

## §7. Screens & UX

### Screen list

| Screen | Route | Purpose |
|---|---|---|
| Landing | `/` | Marketing, CTA → signup |
| Sign up | `/signup` | Email, password, name, preferred language, consent checkbox |
| Login | `/login` | Email + password |
| Onboarding | `/onboarding` | Profile form + optional free-text (see form fields below) |
| Dashboard | `/dashboard` | Matches sorted by score, filter by status, badge for new |
| Match detail | `/match/:id` | Listing card + score + rationale + "Generate draft" button + message editor |
| Settings | `/settings` | Edit profile, change password, notification prefs, delete account |

### Profile form fields (onboarding)

| Field | Type | Required | Notes |
|---|---|---|---|
| Name | text | **yes** | For messages (`{STUDENT_NAME}`). Stored in `users.name`. |
| Study program | text | **yes** | e.g. "MSc CS, ETH". In `user_profiles.study_program`. |
| Preferred language | dropdown | **yes** | DE/FR/EN/IT. Sets `users.locale`. |
| Budget (max CHF/mo) | number | **yes** | Gross rent. |
| City/cities | multi-select | **yes** | Zürich, Lausanne, Genève, Basel, Bern, Winterthur, Luzern, St. Gallen, Lugano, Fribourg, Neuchâtel + "Other." |
| Radius (km) | slider/number | no | Default: 10 km. |
| Rooms (min) | number (0.5 steps) | no | Swiss: 1.5, 2.5, 3.5… |
| Move in from | date picker | **yes** | |
| Flexible on date? | toggle | no | Default: yes. |
| Furnished? | toggle | no | Default: no preference. |
| Max flatmates | number | no | 0 = solo. |
| Languages | multi-select | no | DE, FR, EN, IT, other. |
| Vibe | single select | no | Quiet / Social / Mixed / No preference. |
| Pets OK? | toggle | no | |
| Smoking OK? | toggle | no | |
| Gender preference | single select | no | Any / Female only / Male only. |
| Free text | textarea | no | "Tell us anything else…" |

**Merge logic:** form fields are the baseline. AI parser fills only fields left empty/default. Form wins for any explicitly filled field. Show merged preview before saving.

### Review-then-send UX (core interaction)

1. User opens match → sees listing details + score + rationale.
2. Below: **"Generate message draft"** button.
3. Click → loading spinner ("Drafting…", 2–3s) → `POST /api/matches/:id/draft` → editable text area appears with `{STUDENT_NAME}` / `{STUDENT_PROGRAM}` / `{STUDENT_LANGUAGE}` already substituted.
4. User edits freely.
5. Clicks **"Copy & Open on Flatfox"** → clipboard API + `window.open('https://flatfox.ch' + listing.url)`.
6. Match status → "contacted."

### Error & empty states

| State | User sees |
|---|---|
| No matches yet | "We're searching — matches appear within a few hours." |
| No matches found | "No listings match right now. We'll email you. Try widening budget or radius." |
| AI draft failed | "Couldn't generate — try again." + retry button. Fallback: manual template. |
| Flatfox API down | Stale matches shown with "Last updated: X minutes ago" timestamp. |

---

## §8. Build Tasks

Work through in order. Each = a working, testable increment. Commit after each.

**Infrastructure:**
1. **Scaffold** — Monorepo: `/app` (Next.js 14+, TypeScript), `/worker` (Python), `docker-compose.yml` (Postgres + Redis), `/shared` (migrations, fixtures, seed), `.gitignore`.
2. **DB migrations** — Prisma schema in `/app` + SQL migration in `/shared`. All tables from §3. Verify with `docker-compose up`.

**Python worker (`/worker`):**
3. **Flatfox client** — `/worker/flatfox_client.py` implementing `BaseListingClient`. Paginate via `limit`/`offset`, always pass `&expand=images,documents,attributes`. Filter to RENT + APARTMENT/SHARED/HOUSE. Typed listing objects. Retry logic + configurable delay.
4. **Ingestion job** — Calls client → upserts to `listings` → flags removed. Log stats (fetched/kept/new/updated/removed).
5. **Listing extractor** — `/worker/prompts/extract_listing.txt` + `/worker/extractor.py`. Haiku 4.5 per new listing → `listing_attributes`. Strip PII from description first. Prompt caching. Batch API for >100.
6. **Matching engine** — `/worker/matcher.py`. Layer 1 + Layer 2 → score + rationale. Insert matches ≥ 0.5. Unit tests with ≥10 edge cases.
7. **Message drafter** — `/app/lib/prompts/draft_message.ts` + `/app/api/matches/[id]/draft/route.ts`. Sonnet 4.6. PII placeholders → substitute after. Strip PII from listing description.

**Next.js app (`/app`):**
8. **Auth** — NextAuth.js Credentials: signup (email, password, name, locale), login, logout, session middleware. Bcrypt.
9. **Onboarding** — Form with all fields from §7 + free-text. Merge logic: form wins, AI fills empties. Preview before save.
10. **Dashboard** — Match list sorted by score. Filter by status. Badge for new.
11. **Match detail** — Listing card (photos via `https://flatfox.ch` + `/thumb/...`, price, rooms, description) + score + rationale. "Generate draft" button → loading → editable message. "Copy & Open on Flatfox" button → clipboard + window.open. Update status.
12. **Settings** — Edit profile, change password, notification prefs, delete account (hard-delete all tables).
13. **Email digest** — After matching: find users with new matches above threshold → send summary email (Resend/nodemailer). "N new matches" + top 3.

**Cross-cutting:**
14. **Compliance** — Consent checkbox at signup, privacy policy page, account deletion endpoint, listing purge cron (removed_at > 90 days + no matches).
15. **PII sanitizer + security** — Shared PII strip utility for all prompts. Login rate limiting (5 fails → 15 min lock). Route ownership checks. `npm audit` / `pip audit` in CI.

---

## §9. Testing

| Layer | What | Tool | Minimum |
|---|---|---|---|
| Python worker | Client (mock API), extractor (mock LLM + real text), matcher (fixture profiles/listings) | pytest + pytest-mock | Every module tested. Matcher ≥ 10 edge cases. |
| Next.js API routes | Each route from §4: happy path + auth failure + invalid input | vitest/jest + supertest | Every route has ≥2 tests. |
| Frontend pages | Smoke: pages render | vitest + React Testing Library | One per page. |
| Integration | Signup → profile → match → draft message | Manual for MVP | Before each deploy. |

**Fixtures:** `/shared/fixtures/` — sample Flatfox responses (2–3 listings), sample profiles, expected scores.
**Seed data:** `/shared/seed/` — script inserts ~20 real listings + 2–3 test profiles. Run: `cd shared && python seed.py`.
**CI:** GitHub Actions: `cd worker && pytest` + `cd app && npm test`. Block merge on failure.

---

## §10. Environment Variables

```env
# Shared
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/studenthousing
REDIS_URL=redis://localhost:6379

# Next.js (/app)
NEXTAUTH_SECRET=<random-string>
NEXTAUTH_URL=http://localhost:3000
ANTHROPIC_API_KEY=sk-ant-...

# Python worker (/worker)
ANTHROPIC_API_KEY=sk-ant-...
INGESTION_INTERVAL_MINUTES=30
MATCH_SCORE_THRESHOLD=0.5
FLATFOX_BASE_URL=https://flatfox.ch
FLATFOX_EXPAND=images,documents,attributes
```
