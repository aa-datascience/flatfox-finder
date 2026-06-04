# Student Housing Automation App — Master Project Plan

## Project Context
- **Goal:** Build a commercial SaaS app for student housing search automation
- **Key constraint:** Fully legal (no scraping), use official APIs only
- **Current scope:** **Flatfox only.** Single-platform MVP — chosen because Flatfox publishes an official, documented public-listing API, which satisfies the "official API, no scraping" rule. All other platforms are deferred (see §2 backlog).
- **Tech:** Built with Claude Code, cost-effective, scalable
- **Development approach:** Multi-file deliverables (LaTeX presentation, markdown docs, Claude Code tasks)

---

> **Status:** Planning phase — full draft, API **empirically verified live** (2026-06-03), ready to build
> **Last updated:** 2026-06-04
>
> **API verification note (2026-06-03):** Hit the live API and corrected four assumptions — see ⚡ markers in §3. TL;DR: pagination is `limit`/`offset` (not `page`); total `count` ≈ **35,134** but ~40% is parking/commercial so ingestion must filter by category; images are bare integer IDs that need `&expand=images` to resolve to signed `/thumb/...` URLs; no rate limiting observed.

---

## 1. Executive Summary

A SaaS web app that automates the student housing search in Switzerland. Students build a profile — via a structured form and/or a free-text description parsed by AI — and the app continuously matches them against live Flatfox listings using a two-layer engine (structured filters + AI analysis of listing text for things like flatmate count, languages, atmosphere, and move-in flexibility). For each strong match it drafts a personalised contact message that the user can either send automatically or review-then-send. **Target market:** students and young professionals in competitive Swiss housing markets (Zurich, Lausanne, Geneva, Basel, Bern) where good listings disappear within hours. **Value proposition:** be first to contact the right listings, with less effort, fully legally (official Flatfox API, no scraping).

---

## 2. Platform Registry

> **Current scope decision: Flatfox only.** Everything else is parked in the deferred backlog below. Rationale: Flatfox is the one Swiss rental platform with an **official, documented public-listing API**, so it lets us honour the "official API, no scraping" constraint from day one instead of waiting on partnership negotiations.

### 2a. Active platform — Flatfox

| Field | Detail |
|---|---|
| **Name** | Flatfox |
| **Market** | Switzerland-wide (DE/FR/IT/EN); rentals, sublets, **flatshares (WG)** — strong fit for the student use-case |
| **URL** | flatfox.ch |
| **API** | **Yes — official, documented, public, no auth. ✅ verified live 2026-06-03.** `GET /api/v1/public-listing/` returns all published listings (paginated via `limit`/`offset`). `GET /api/v1/public-listing/:pk/` for single listing. Server-side filters: `pk`, `organization`, `organization__slug`. Add `&expand=images,documents,attributes` to resolve nested objects. API reference at `flatfox.ch/en/docs/api/`. |
| **Listing data fields** (from official docs) | pk, slug, url, status, offer_type, object_category/type, rent_net/charges/gross, price_display, titles (short/public/rent/description), description, livingspace, number_of_rooms, floor, is_furnished/temporary, city, zipcode, lat/lng, moving_date/type, images, documents, agency, attributes |
| **Business model** | Free to search and to advertise; monetises via "Flatfox Priority" subscription (early contact access) and B2B agency tools — so they're *not* purely ad/data-protective, which is friendly to integration |
| **ToS stance** | Use of the documented API is sanctioned; we stay strictly on the official endpoints (no scraping of the HTML site). |
| **Ecosystem signals** | Community Laravel package `codebar-ag/laravel-flatfox` consumes public listings; third-party automation shops integrate Flatfox — confirms the API is real and usable |
| **Remaining open items** | (1) Rate limits — test empirically. (2) Whether automated contact requests are permitted (gates auto-send). |

> **Next step for §3:** get an API key / read the auth section, map the exact search + listing + contact endpoints, and capture the rate limits and ToS clauses verbatim. That fully replaces the old multi-platform legal analysis for now.

### 2b. Deferred backlog (researched, NOT in current scope)

Kept for later phases (§13). Do not build against these yet. Key blocker for most: no public *read* API — access would require partnership or would breach the no-scraping rule.

| Platform | Type | URL | Why deferred |
|---|---|---|---|
| Homegate | General portal (SMG) | homegate.ch | High volume, but no public read API; anti-scraping ToS |
| ImmoScout24 CH | General portal (SMG) | immoscout24.ch | No public read API on CH entity; content-partner only |
| Comparis | Aggregator | comparis.ch | Anti-scraping; competitor in aggregation |
| Newhome | General portal | newhome.ch | No public read API |
| RealAdvisor | General portal | realadvisor.ch | No public read API |
| WGZimmer | Student flatshares | wgzimmer.ch | No public API; strong future student fit |
| WOKO | Student co-op (ZH/Winti) | woko.ch | No API; mission-aligned — good future *partnership* target |
| students.ch | Student portal | students.ch/wohnen | No API |
| HousingAnywhere | Intl. student moves | housinganywhere.com | Possible partner/affiliate API — revisit in Phase 2 |
| University housing offices | UZH/ETH, EPFL/UNIL, UNIGE | (per institution) | Low volume, high trust; partnership-based |
| Blueground / Flatio | Furnished mid-term | theblueground.com / flatio.com | Adjacent; possible partner feeds |
| Facebook housing groups | Informal | — | **Out of scope** — Meta ToS prohibits automation |

---

## 3. API & Legal Analysis

### 3a. Flatfox API — confirmed from official docs

**Base URL:** `https://flatfox.ch/api/v1/`

| Endpoint | Method | Description |
|---|---|---|
| `/api/v1/public-listing/` | GET | **List all** currently published listings (paginated: `count`, `next`, `previous`, `results[]`). |
| `/api/v1/public-listing/:pk/` | GET | Fetch a **single** listing by ID. |

**Auth:** none. The docs explicitly state: *"Since this is a public endpoint, no authentication with an API key is required."*

**Server-side filter arguments:** `pk`, `organization` (int), `organization__slug` (string). No server-side filtering by city/price/rooms — so the ingestion strategy is: **fetch all listings via pagination, store locally, filter and match in our DB.**

**⚡ Pagination — corrected (verified live):** uses **`?limit=N&offset=M`** (default `limit=100`), **not** `?page=N`. The `next`/`previous` URLs are built with limit/offset.

**⚡ Total volume & category mix (verified live 2026-06-03):** `count` ≈ **35,134** published listings — but the dataset is **mostly not student housing**. Sampled ~600 listings across the range:

| object_category | share | notes |
|---|---|---|
| APARTMENT | ~53% | the core target (incl. studios, single rooms) |
| PARK | ~21% | parking/garage — **exclude** |
| INDUSTRY | ~17% | commercial/office — **exclude** |
| SHARED | ~6% | WG / flatshare — **prime student fit** |
| HOUSE / SECONDARY / GASTRO | ~3% | mostly exclude |

`offer_type` is ~97.7% `RENT`, ~2.3% `SALE`. **Ingestion implication:** filter to `offer_type = RENT` and `object_category ∈ {APARTMENT, SHARED, HOUSE}` — the student-relevant pool is a *fraction* of 35k (roughly 15–20k apartments + ~2k flatshares), which also lowers the LLM extraction volume in §9.

**⚡ Rate limits (verified):** **none observed** — 6 rapid sequential requests all returned HTTP 200 with ~1.3–3.2s latency each. Polling every 30 min is very safe. Re-test at higher concurrency before scaling a full re-ingest (see §3d).

**Pagination example (corrected):**
```json
{
  "count": 35134,
  "next": "https://flatfox.ch/api/v1/public-listing/?limit=100&offset=100",
  "previous": null,
  "results": [ { "pk": 33819, ... } ]
}
```

**Contact / messaging via API:** not documented in the PublicListing endpoint. **⚡ But the data reveals contact signals (verified live):** every listing carries a **`submit_url`** (e.g. `/en/listing/{pk}/submit/`), and the single-listing endpoint exposes a **`can_direct_apply`** boolean — so an application/contact mechanism demonstrably exists. Whether *programmatic* submission is ToS-permitted is still the open legal question (do **not** probe by actually submitting against live listings). Auto-send remains a **ToS question**. Until confirmed, ship review-then-send only (user copies the AI-drafted message and sends manually on Flatfox).

### 3b. Confirmed listing data model (from official API docs)

**Structured fields:** `pk`, `slug`, `url`, `short_url`, `status`, `created`, `offer_type`, `object_category`, `object_type`, `ref_property`, `ref_house`, `ref_object`, `price_display`, `price_display_type`, `price_unit`, `rent_net`, `rent_charges`, `rent_gross`, `livingspace`, `number_of_rooms`, `floor`, `is_furnished`, `is_temporary`, `is_selling_furniture`, `street`, `zipcode`, `city`, `public_address`, `latitude`, `longitude`, `year_built`, `moving_date_type`, `moving_date`.

**Free-text fields (for AI extraction):** `description`, `short_title`, `public_title`, `rent_title`, `description_title`.

**Media/relations:** `cover_image`, `images[]`, `documents[]`, `video_url`, `tour_url`, `website_url`, `agency` (object: name, name_2, street, zipcode, city, country, logo), `attributes[]`.

**⚡ Image handling — corrected (verified live):** by default `cover_image` and `images[]` are **bare integer IDs**, *not* objects. To get usable image objects you **must** request `&expand=images,documents,attributes`. Each expanded image is:
```json
{ "pk": 29927114, "caption": "", "url": "/thumb/ff/2025/10/<hash>.jpg?signature=<sig>",
  "url_thumb_m": "/thumb/ff/.../<hash>.jpg?alias=thumb_m&signature=<sig>",
  "url_listing_search": "/thumb/ff/.../<hash>.jpg?alias=listing_search&signature=<sig>",
  "ordering": 1, "width": 1500, "height": 1000 }
```
URLs are **relative and signed** (`/thumb/ff/...?signature=...`) — prepend `https://flatfox.ch`. **Note:** the path prefix is **`/thumb/`**, not `/media/` as earlier assumed in §5f. (Agency logos use `/thumb/org/...`.)

**Object category codes (relevant to student housing):** `APPT` = apartment (types: Wohnung, Maisonette, Studio, Einzelzimmer/single room, möbliert), `HOUSE`, `SECONDARY` (Hobbyraum, Kellerabteil).

### 3c. Legal / compliance notes (CH)

- Using the **official API on public listings** is the compliant path; **no HTML scraping** of flatfox.ch.
- Read + capture the Flatfox **API ToS** verbatim before building (esp. clauses on automated contacting, redistribution of listing data, caching/retention).
- Swiss **nDSG** + **GDPR** apply to *user* profile data we store (see §11). Listing data is third-party content — define a retention/refresh policy and respect "reserved"/removed listings promptly.

### 3d. Action items before coding

1. ~~Locate search endpoint~~ → ✅ **RESOLVED:** `GET /api/v1/public-listing/` returns all listings, paginated (`limit`/`offset`), no auth.
2. ~~Test rate limits~~ → ✅ **No limiting observed** at low volume (6 rapid requests, all 200). Re-test at higher concurrency before a full parallel re-ingest.
3. **Confirm whether programmatic contact requests are permitted** — `submit_url` / `can_direct_apply` exist in the data, but ToS permission for *automated* submission is unconfirmed. Gates auto-send. **Still open.**
4. ~~Determine total listing count~~ → ✅ `count` ≈ **35,134**, but only ~15–20k are rentable apartments + ~2k flatshares after filtering (see §3a). Size ingestion/extraction against the *filtered* pool.

---

## 4. Integration Strategy

**Current:** single integration — **Flatfox** via its official API. No other integrations until v1 ships.

**Sequencing:**
1. ~~Confirm Flatfox API access~~ → ✅ **Done:** `GET /api/v1/public-listing/`, no auth, paginated.
2. Build ingestion + matching + review-then-send messaging.
3. Add auto-send only once Flatfox ToS confirms programmatic contact is allowed.

**Outreach:** if there is no official search endpoint, contact Flatfox to request partner/search access before considering any alternative — do **not** fall back to scraping (violates the core constraint).

**Fallback strategies (legal only):** (a) ID-based polling of known listing ranges if that's sanctioned; (b) user-initiated fetches; (c) partnership/data agreement. Multi-platform expansion is Phase 2+ (see §2 backlog).

---

## 5. System Architecture

### 5a. Components

1. **Ingestion worker** (Python, cron) — polls `GET /api/v1/public-listing/?limit=100&offset=…&expand=images,documents,attributes` (paginated, no auth) **every 30 minutes** (configurable via `INGESTION_INTERVAL_MINUTES` env var). **Filters to `offer_type=RENT` and `object_category ∈ {APARTMENT, SHARED, HOUSE}`** (skips parking/commercial — ~40% of the feed). Upserts kept listings into `listings` table, flags new/changed/reserved. Triggers extraction + matching for new listings.

   **Error recovery:** if ingestion crashes mid-run, the next run re-fetches from offset 0 (upserts are idempotent, so duplicates are safe). Log the last successful offset for debugging but don't checkpoint — a full re-scan is fast enough at ~200 pages and avoids stale-offset bugs.

   **Extensibility (Phase 2+):** the Flatfox client implements a `BaseListingClient` interface:
   ```python
   class BaseListingClient(ABC):
       @abstractmethod
       def fetch_listings(self) -> Iterator[NormalizedListing]: ...
   ```
   Adding a new platform (e.g. WGZimmer, HousingAnywhere) means writing a new client that implements this interface and registering it in the ingestion job. The ingestion loop, DB schema, extraction, and matching engine stay untouched — they work on `NormalizedListing` regardless of source. **Build this interface from task 3 onward**, even though only Flatfox implements it for now.
2. **Profile builder** — turns a user's input into a structured `user_profile`. Two input paths, same output schema:
   - **Form** → fields directly.
   - **Free text** → an **AI parser** extracts the same fields from a paragraph the user writes ("I'm an ETH master's student, budget ~1200, prefer a quiet WG, flexible from September…").
3. **Matching engine** — scores each listing against each active user profile (see 5b).
4. **Message generator** — drafts a personalised contact message per match (AI), then sends via the user's chosen mode (see 5c).
5. **User app** (Next.js) — review matches, edit profile, approve/queue messages, see status.

**Worker pipeline sequencing (`main.py` = long-running process with APScheduler):**
1. **Every N minutes** (configurable): run ingestion → upsert listings.
2. **Immediately after ingestion:** run extraction on all listings where `listing_attributes` is missing. Sequential Haiku calls (≈0.5s each); for >100 new listings, use the Batch API (submit all, poll for results, write to DB when complete). **Matching waits until extraction finishes** — don't match against un-extracted listings.
3. **After extraction completes:** run matching for all active user profiles × newly ingested/extracted listings. Insert matches above threshold. Queue digest notifications.

If step 2 takes long (e.g. 500 new listings on first run ≈ 4 min), step 3 simply starts later. Steps never overlap — they run in sequence within a single pipeline invocation.

**Communication pattern:**
- **Batch AI work** (listing extraction, matching) → Python worker, runs on schedule, reads/writes Postgres directly.
- **On-demand AI work** (profile free-text parsing, message drafting) → Next.js API routes calling Anthropic API via `@anthropic-ai/sdk` (TypeScript). No need to call the Python worker synchronously.
- **Shared state:** Postgres is the single source of truth; both processes read/write it.

### 5b. Matching engine (two-layer)

**Layer 1 — Structured match (hard + soft filters on API fields):**
- Hard filters: price ≤ budget, location/radius (via lat/long), rooms, furnished/temporary, availability window vs. `moving_date`.
- Soft scoring: closeness to ideal price/size, move-in date proximity (using `moving_date_type` for "flexible" vs "fixed").

**Layer 2 — Text match (AI over `description` + titles):**
- Extract per-listing attributes not in structured fields: **number of flatmates, languages spoken, atmosphere/"vibe" (quiet-studious ↔ social), pets, smoking, gender preference, move-in flexibility phrased in prose.**
- Compare against the user's text-derived preferences → semantic similarity / attribute overlap score.

**Shared attribute schema** (used identically by profile parser, listing extractor, and matching engine):
```json
{
  "vibe":            "quiet" | "social" | "mixed" | null,
  "languages":       ["de","fr","en","it","es","pt","other"],
  "flatmate_count":  int | null,       // 0 = studio/alone, 1+ = WG
  "pets_ok":         bool | null,
  "smoking_ok":      bool | null,
  "gender_pref":     "any" | "female_only" | "male_only" | null,
  "move_in_flexible": bool | null
}
```

**Matching formula (starting values — tune with real data):**

*Layer 1 structured score (0–1):*
- `price_score`: 1.0 if `rent_gross ≤ budget`; linear decay to 0 at 130% of budget; **hard cut** above 130%.
- `location_score`: 1.0 if within `radius_km`; linear decay to 0 at 2× radius; **hard cut** above 2×.
- `rooms_score`: 1.0 if `number_of_rooms ≥ rooms_min`; 0.5 if off by 0.5 rooms; 0 otherwise.
- `date_score`: 1.0 if `moving_date` within user's availability window; 0.5 if within 30 days; 0 if >30 days.
- L1 = 0.35 × price + 0.30 × location + 0.15 × rooms + 0.20 × date.

*Layer 2 text score (0–1):*
- For each shared attribute (vibe, languages, pets, smoking, gender_pref, flatmate_count): +1 if match, −1 if conflict, 0 if either side is null.
- Normalize: L2 = (sum + max_possible) / (2 × max_possible).

*Final:*
- `score` = **0.6 × L1 + 0.4 × L2**.
- **Threshold to surface a match: ≥ 0.5.** (Below = not shown.)
- Store `score`, `score_breakdown` (JSON with all sub-scores), and a text `rationale` ("Budget ✓ (CHF 1150 ≤ 1200), 10 min from ETH ✓, quiet vibe ✓").

### 5c. Messaging — dual mode (user chooses)

Per match, the user picks:
- **Review-then-send (v1 default)** — app shows the AI-drafted message; user can edit it; clicks **"Copy & Open on Flatfox"** → message is copied to clipboard and listing URL opens in a new tab, where the user pastes and sends. Simple, no ToS risk.
- **Auto-send (gated, Phase 2)** — app sends the message programmatically on the user's behalf. Only enabled if Flatfox ToS permits it (see §3). Behind a separate user consent toggle.

### 5d. Data flow

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
    MODE -->|auto-send| OUT[Send via Flatfox]
    MODE -->|review| APP[User reviews/edits] --> OUT
    MQ --> APP2[User app: matches + status]
```

### 5e. AI prompt specifications

**Prompt 1 — Profile free-text parser** (Haiku 4.5, called from Next.js API route)
> ⚠️ **Before calling:** run PII sanitizer on `{user_raw_text}` — strip emails, phone numbers, names. The AI only needs housing preferences.
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
  "languages": string[]|null,        // ISO: de, fr, en, it, es, pt, other
  "vibe": "quiet"|"social"|"mixed"|null,
  "max_flatmates": int|null,
  "pets_ok": bool|null,
  "smoking_ok": bool|null,
  "gender_pref": "any"|"female_only"|"male_only"|null
}
If information is not mentioned, use null. Do not invent values.

User: {user_raw_text}
```

**Prompt 2 — Listing attribute extractor** (Haiku 4.5, called from Python worker, prompt-cached)
> ⚠️ **Before calling:** strip any emails/phone numbers from `{description}`. Landlords sometimes embed contact info in listing text.
```
System: You extract structured attributes from a Swiss housing listing.
The listing may be in German, French, Italian, or English.
Return ONLY valid JSON matching this schema, no other text:
{
  "flatmate_count": int|null,         // 0 if solo apartment, 1+ for WG
  "languages": string[]|null,         // languages mentioned/required: de, fr, en, it, es, pt, other
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

**Prompt 3 — Message generator** (Sonnet 4.6, called from Next.js API route)
> ⚠️ **Anonymization:** send `{STUDENT_NAME}`, `{STUDENT_PROGRAM}`, `{STUDENT_LANGUAGE}` as placeholders, NOT real values. Substitute real values into the draft **after** the API call returns, in our code. Also strip emails/phones from listing description before sending.
```
System: You write a short, friendly contact message from a student to a landlord/flatmate
about a housing listing. The message should:
- Be 3–5 sentences.
- Be warm and personal, not formal or generic.
- Mention 1–2 specific things about the listing that match the student's profile
  (e.g. "I noticed you're looking for a quiet flatmate — that's exactly my style").
- Briefly introduce the student using the placeholders provided (e.g. {STUDENT_NAME}, {STUDENT_PROGRAM}).
- End with a polite request to visit or chat.
- Be written in the SAME LANGUAGE as the listing description (German/French/Italian/English).
- Do NOT include a subject line.

User:
Listing title: {public_title}
Listing description: {description}
Listing city: {city}, rent: CHF {rent_gross}/mo, rooms: {number_of_rooms}
Student profile: {STUDENT_NAME}, studying {STUDENT_PROGRAM}, speaks {STUDENT_LANGUAGE}, budget CHF {budget_max}/mo, moving from {move_in_from}
Match rationale: {rationale}
```

### 5f. Environment variables

```env
# Shared
DATABASE_URL=postgresql://...
REDIS_URL=redis://...

# Next.js (/app)
NEXTAUTH_SECRET=...
NEXTAUTH_URL=http://localhost:3000
ANTHROPIC_API_KEY=...              # for on-demand AI (profile parsing, message drafting)

# Python worker (/worker)
ANTHROPIC_API_KEY=...              # for batch AI (listing extraction)
INGESTION_INTERVAL_MINUTES=30
MATCH_SCORE_THRESHOLD=0.5
FLATFOX_BASE_URL=https://flatfox.ch   # for constructing full image/listing URLs
FLATFOX_EXPAND=images,documents,attributes   # required to resolve image IDs → objects
```

> **Image URLs (corrected):** request listings with `&expand=images,documents,attributes`, then each image object has relative **signed** paths like `/thumb/ff/...jpg?signature=...`. Prepend `FLATFOX_BASE_URL`: `https://flatfox.ch/thumb/ff/...`. Use `url_thumb_m` for cards, `url` for full-size. (Prefix is `/thumb/`, not `/media/`.)

---

## 6. Database Schema

Core tables (Postgres):

- **users** — `id`, `email`, `password_hash`, `name` (display name for messages), `locale` (de/fr/en — set at signup), `created_at`, `consent_flags` (JSON: `{ accepted_terms: bool, accepted_privacy: bool, consent_auto_send: bool }`), `plan`.
- **user_profiles** — `id`, `user_id` → users, `input_mode` (form/text/both), `raw_text` (their free-text, if any), **`study_program`** (e.g. "MSc Computer Science, ETH"), structured prefs: `budget_max`, `rooms_min`, `cities[]`, `radius_km`, `move_in_from`, `move_in_flexible` (bool), `furnished_pref`, plus text-derived prefs: `languages[]`, `vibe` (e.g. quiet↔social), `max_flatmates`, `pets_ok`, `smoking_ok`, `gender_pref`. `updated_at`.
- **listings** — mirrors Flatfox fields: `id` (Flatfox pk), `slug`, `url`, `status`, `offer_type`, `object_type`, `rent_net`, `rent_charges`, `rent_gross`, `surface_living`, `number_of_rooms`, `floor`, `is_furnished`, `is_temporary`, `moving_date`, `moving_date_type`, `zipcode`, `city`, `lat`, `lng`, `description`, `published`, `reserved`, `fetched_at`, **`removed_at`** (null while active; set when listing disappears from Flatfox feed).
- **listing_attributes** — `listing_id` → listings, AI-extracted: `flatmate_count`, `languages[]`, `vibe`, `pets`, `smoking`, `gender_pref`, `move_in_flexible`, `extraction_model`, `extracted_at`. (One extraction per listing, reused across all users.)
- **matches** — `id`, `user_id`, `listing_id` (nullable — null after listing purge), `score`, `score_breakdown` (JSON: layer1/layer2), `rationale` (short text), `status` (new/seen/contacted/dismissed), **`listing_snapshot`** (JSON: title, city, price — populated on match creation, survives listing deletion), `created_at`.
- **messages** — `id`, `match_id` → matches, `user_id`, `body`, `language`, `mode` (auto/review), `status` (draft/approved/sent/failed), `sent_at`.

**Key indexes:** `listings(city, rent_gross, number_of_rooms)`, `listings(status, published)`, `matches(user_id, status)`, `matches(score)`, unique `matches(user_id, listing_id)`.
**Relations:** user 1→1 profile; user 1→N matches; listing 1→1 attributes, 1→N matches; match 1→N messages.

### 6b. Listing lifecycle & deletion

Listings disappear from Flatfox (rented, withdrawn). Our DB references them from `matches` and `messages`.

**Decision: soft-delete listings, never hard-delete.**
- Ingestion marks listings no longer in Flatfox feed as `status = 'removed'`, with `removed_at` timestamp.
- Matches/messages referencing removed listings remain visible to the user (they might need their message history). The match card shows a "This listing is no longer available" badge.
- **Purge job (task 14):** hard-delete listings with `status = 'removed'` AND `removed_at > 90 days ago` AND no associated matches. Matches referencing purged listings get `listing_id = NULL` + a snapshot of key fields (title, city, price) stored in `matches.listing_snapshot` (JSON column — add to schema).

### 6c. Next.js API route contract

These are the endpoints the frontend calls. Claude Code must implement these exactly — no improvising different shapes per task.

| Method | Route | Auth | Request | Response | Used by |
|---|---|---|---|---|---|
| POST | `/api/auth/signup` | no | `{ email, password }` | `{ user_id }` or `{ error }` | Signup page |
| POST/GET | `/api/auth/[...nextauth]` | — | NextAuth handles | NextAuth handles | Login/logout |
| GET | `/api/profile` | yes | — | `{ profile }` or `null` | Settings, onboarding check |
| PUT | `/api/profile` | yes | `{ ...profile fields }` | `{ profile }` | Onboarding, settings |
| POST | `/api/profile/parse` | yes | `{ raw_text }` | `{ parsed_prefs }` (AI-extracted, PII-stripped) | Onboarding free-text |
| GET | `/api/matches` | yes | `?status=new,seen&sort=score&page=1&limit=20` | `{ matches[], total, page }` | Dashboard |
| GET | `/api/matches/:id` | yes | — | `{ match, listing, attributes, message_draft? }` | Match detail |
| PATCH | `/api/matches/:id` | yes | `{ status }` | `{ match }` | Dismiss, mark seen/contacted |
| POST | `/api/matches/:id/draft` | yes | — | `{ message_body }` (AI-generated, PII-stripped, placeholders substituted) | Match detail |
| PUT | `/api/matches/:id/message` | yes | `{ body }` | `{ message }` | Edit draft before copy |
| PUT | `/api/settings/password` | yes | `{ old_password, new_password }` | `{ success }` | Settings |
| DELETE | `/api/account` | yes | `{ confirm: true }` | `{ success }` (hard-delete all user data) | Settings |

> "Auth: yes" means the route requires a valid NextAuth session and checks `session.user.id === resource.user_id` (ownership). Return 401 if no session, 403 if wrong user.

### 6d. Testing strategy

| Layer | What to test | Tool | Minimum bar |
|---|---|---|---|
| **Python worker** | Flatfox client (mock API responses), extractor (mock LLM response + real listing text), matcher (unit tests with fixture profiles + listings) | `pytest` + `pytest-mock` | Every module has tests. Matcher has ≥10 test cases covering edge cases (null attributes, hard cuts, score boundaries). |
| **Next.js API routes** | Each route from §6c: valid request → correct response, auth check, ownership check, invalid input → 400 | `vitest` or `jest` + `supertest` | Every API route has at least a happy-path and an auth-failure test. |
| **Frontend pages** | Smoke test: pages render without crashing | `vitest` + React Testing Library | One test per page. |
| **Integration** | End-to-end: signup → create profile → run matching → see matches → draft message | Manual for MVP; add Playwright later | Run manually before each deploy. |

**Test fixtures:** create `/shared/fixtures/` with sample Flatfox API responses (2–3 listings), sample user profiles, and expected match scores. Both Python and Next.js tests reference these.

**Dev seed data:** create `/shared/seed/` with a script that inserts ~20 real listings (fetched once from the Flatfox API and saved as JSON) + 2–3 test user profiles into the local DB. This lets a developer test the full flow (matching, dashboard, message drafting) without waiting for a real ingestion run. Run with `cd shared && python seed.py`.

**CI:** GitHub Actions runs `cd worker && pytest` + `cd app && npm test` on every push. Block merge if tests fail.

---

## 7. Tech Stack

**Platform:** responsive **web app** (no native mobile for MVP; add PWA "install to home screen" later).

| Layer | Choice | Why |
|---|---|---|
| Frontend | **Next.js 14+ (React, TypeScript)** | SSR for landing/SEO, API routes for backend logic, largest ecosystem, strong Claude Code support. |
| Backend / AI worker | **Python** (standalone worker process) | Ingestion, Haiku extraction, matching engine — Python's AI/LLM libs are best-in-class. Writes to same Postgres DB that Next.js reads. |
| Database | **PostgreSQL** | Relational fit, JSON columns for `score_breakdown`/attributes, earthdistance extension for radius search. |
| Cache/queue | **Redis** | Schedule ingestion cron, queue extraction + matching jobs in the Python worker. |
| LLM | **Anthropic Claude API** | **Haiku 4.5** for listing extraction + matching (cheap, fast); **Sonnet 4.6** for message drafting (quality). |
| Auth | **NextAuth.js** with **Credentials provider** | Email + password (bcrypt-hashed). No OAuth for MVP. |
| Hosting | **Vercel** (Next.js, free tier) + **Railway** (Python worker + Postgres + Redis, EU region) | Simple, cheap, EU data residency. |
| CI/CD | **GitHub Actions** | Lint/test/deploy on push. Free tier. |

**Project structure — monorepo:**
```
/app          → Next.js (frontend + API routes + auth)
/worker       → Python (ingestion, extraction, matching, message drafting)
/shared       → DB migrations, shared config
docker-compose.yml  → local dev (Postgres + Redis)
```

**Cost levers:** Haiku for extraction, **prompt caching** (−90% cached input) for repeated system prompts, **Batch API** (−50%) for non-urgent bulk extraction.

---

## 8. Infrastructure & Hosting

- **Frontend:** Vercel (free tier for Next.js; automatic deploys from GitHub; EU edge).
- **Python worker + DB + Redis:** Railway (EU region; ~$5–20/mo for small worker + managed Postgres + Redis).
- **MVP specs:** Vercel handles frontend scaling automatically; Railway worker: 0.5–1 vCPU, 512 MB RAM (ingestion + extraction are bursty, not continuous).
- **Scaling:** frontend scales on Vercel automatically; worker scales by adding instances on Railway; Postgres read replica only when needed.
- **Monitoring:** Sentry (free tier) for error tracking; Vercel analytics for frontend; Railway logs for worker. Alert on ingestion failures and Flatfox API errors.
- **Backups:** Railway managed Postgres includes daily backups; 7-day retention. Secrets in Vercel/Railway env vars, never in repo.
- **Domain:** custom domain on Vercel (free); SSL automatic via Vercel.

---

## 9. Cost Study

> Estimates in USD/month. Verify hosting prices at purchase; LLM rates are current (Haiku 4.5 $1/$5, Sonnet 4.6 $3/$15 per MTok).

**Key efficiency:** listing text is extracted **once per listing** (Haiku), then reused for all users → LLM cost scales with #listings, not #listings×#users.

**Fixed infrastructure (MVP):**
| Item | Est. |
|---|---|
| App VPS | $15–25 |
| Postgres (managed small) | $15–25 |
| Redis (small) | $0–10 |
| Email/notifications (transactional, e.g. SES/Postmark) | $0–15 |
| Domain + SSL (SSL free via Let's Encrypt) | ~$2 |
| Monitoring (free tiers) | $0 |
| **Subtotal** | **~$50–80** |

**Variable LLM (assumptions):**
- Listing extraction: ~2,000 new listings/mo × (~1.5K in + 0.5K out, Haiku) ≈ **~$8/mo total** (shared across all users; −50% more with Batch API).
- Message generation: ~20 messages/user/mo × (~2K in + 0.4K out, Sonnet) ≈ **~$0.24/user/mo**.
- Profile parsing: negligible (a few Haiku calls per user).

**Per-user unit cost (LLM + amortised fixed):**
| Users | Approx. cost/user/mo |
|---|---|
| 100 | ~$1.00 |
| 500 | ~$0.45 |
| 1,000 | ~$0.37 |

Takeaway: the app is **very cheap to run**; LLM is a minor line item. Margins are healthy even at low subscription prices.

---

## 10. Pricing Model

Students are price-sensitive, and demand is seasonal (semester starts). Suggested model:

**Tiers:**
- **Free:** build profile, see matches, **manual** contact (copy message yourself). Limited matches/day. Acquisition + funnel.
- **Pro — ~CHF 14.90/mo (or CHF 29 for a 3-month "search season" pass):** unlimited matches, AI message drafting, **review-then-send / auto-send**, priority/new-listing alerts, multi-language messages.

Rationale: price below typical Swiss listing/relocation fees; the "search season" pass fits how students actually use it (intense search for 1–3 months, then stop). Consider a partner/B2B angle later (universities, relocation services).

**Revenue projections (illustrative, assume ~8–12% free→paid conversion, blended ~CHF 14/mo effective):**
| Paying users | Monthly revenue (CHF) | Approx. run cost (USD) | Gross margin |
|---|---|---|---|
| 100 | ~1,400 | ~$150 | very high |
| 500 | ~7,000 | ~$300 | very high |
| 1,000 | ~14,000 | ~$500 | very high |

Margins are dominated by acquisition cost, not infra/LLM. Focus spend on growth (campus channels, SEO), not servers.

---

## 11. Legal & Compliance

- **Applicable law:** Swiss **nDSG** (revised FADP) for Swiss users + **GDPR** for any EU users. Both apply to the *user* personal data we store (profile, email, preferences, message history).
- **Flatfox ToS:** use only the **official API**; no scraping. Capture and comply with clauses on automated contacting, data redistribution, caching, and listing-data retention (see §3). Until confirmed, treat auto-send as gated.
- **Lawful basis / consent:** explicit consent at signup for processing profile data and for sending messages on the user's behalf. Separate, clear consent for **auto-send** mode.
- **Data minimisation:** store only what matching needs. Don't collect sensitive categories.
- **Retention:** delete/anonymise user profiles after inactivity (e.g. 12 months) or on request; refresh/expire listing copies promptly and drop reserved/removed listings. Define a written retention schedule.
- **User rights:** access, rectification, deletion, export. Provide self-serve account deletion.
- **Security:** hashed passwords, encrypted secrets, TLS everywhere, least-privilege DB access, EU/CH data residency.
- **Transparency:** privacy policy + clear UI showing when/what messages are sent on the user's behalf.
- *Not legal advice — have a Swiss data-protection lawyer review before launch.*

### 11b. Security & AI anonymization

**Principle: no user PII reaches the LLM.** The Anthropic API does not train on API inputs, but defence-in-depth means we strip PII *before* sending — so even a data breach at the API layer leaks no personal data.

**PII stripping per prompt:**

| Prompt | What gets sent | PII risk | Mitigation |
|---|---|---|---|
| **1 — Profile parser** | User's free-text paragraph | May contain name, email, phone, university ID | **Strip before sending:** regex-remove emails, phone numbers, and names (or replace with `[REDACTED]`). The AI only needs preferences (budget, vibe, city), not identity. |
| **2 — Listing extractor** | Listing description + titles | Landlord phone numbers, emails sometimes embedded | **Strip** emails and phone numbers from description before sending. These are public but unnecessary for extraction. |
| **3 — Message generator** | Listing + profile + rationale | Needs the student's name and intro to write a personalised message | **Use placeholders:** send `{STUDENT_NAME}`, `{STUDENT_PROGRAM}`, `{STUDENT_LANGUAGE}` instead of real values. **Substitute after generation** in our code before showing the draft to the user. The AI writes "Dear landlord, my name is {STUDENT_NAME}, I study {STUDENT_PROGRAM}…" → we replace. |

**Implementation: PII sanitizer utility**
- Shared function used by all three prompt pipelines.
- Regex patterns for: email addresses (`*@*.*`), Swiss/international phone numbers (`+41...`, `07x...`), and optionally names (if the user's name is stored in their profile, do a literal string replacement).
- Runs *before* the API call; the raw text with PII stays in our DB (encrypted at rest), never leaves our infra.

**Other security measures:**

| Area | Measure |
|---|---|
| **Auth** | Rate limit login attempts (e.g. 5 failures → 15 min lockout). CSRF protection via NextAuth's built-in tokens. |
| **Passwords** | bcrypt (already in plan). Minimum 8 characters, no max length cap. |
| **Input validation** | Sanitise all user inputs (profile form, free text) before DB writes. Prisma parameterised queries prevent SQL injection. |
| **API routes** | All `/api/` routes require valid session (except signup/login). Validate ownership (user can only see their own matches/messages). |
| **Secrets** | `.env` file, never committed. In production: Vercel/Railway env vars, rotatable. |
| **DB encryption** | Railway managed Postgres: encrypted at rest by default. Use SSL connections. |
| **Logging** | Never log PII (emails, passwords, profile text). Log anonymised events only (user_id, action, timestamp). |
| **Dependency security** | `npm audit` / `pip audit` in CI. Dependabot alerts on GitHub. |

---

## 12. MVP Scope

### 12a. Features (must / should / could)

**In v1 (must):**
- Single platform: **Flatfox** (official API).
- User profile via **both** a structured form **and** free-text AI parsing.
- **Two-layer matching** (structured filters + AI text matching on `description`).
- AI-generated contact message per match.
- **Review-then-send messaging** (copy + open on Flatfox). Auto-send deferred to Phase 2.
- Match dashboard + match detail + "why this matched" rationale.
- Email + password auth.
- Email notifications on new high-score matches (daily digest).

**Should:**
- Saved searches / recurring match runs.
- Multi-language message drafting (DE/FR/EN) — important since listings are in all three.
- Profile edit page.

**Could:**
- Preference learning from user accept/reject feedback.
- PWA "install to home screen."
- Real-time alerts for Pro tier (push or instant email).

**Deferred (not v1):**
- Auto-send (pending Flatfox ToS confirmation).
- Any second platform.
- Native mobile app.
- Billing/subscription (can soft-launch with invite-only beta, add Stripe later).

### 12b. Screens

| Screen | Route | Purpose |
|---|---|---|
| **Landing** | `/` | Marketing page, value prop, CTA → signup. |
| **Sign up** | `/signup` | Email + password form, consent checkbox (privacy policy + data processing). |
| **Login** | `/login` | Email + password. |
| **Onboarding** | `/onboarding` | Step 1: choose form or free-text mode (or both). Step 2: fill in profile. Step 3: confirmation + "we'll start matching." |
| **Dashboard** | `/dashboard` | List of matches sorted by score; filters (city, status: new/seen/contacted/dismissed); badge count for new matches. |
| **Match detail** | `/match/:id` | Listing info (photos, price, rooms, location, description) + match score + rationale ("matched because: budget ✓, quiet vibe ✓, near ETH ✓"). AI-drafted message below. |
| **Message review** | (within match detail) | Editable text area with the AI draft. **"Copy & Open on Flatfox"** button → copies message to clipboard, opens `flatfox.ch/en/flat/{slug}` in new tab. Status updates to "contacted." |
| **Profile / settings** | `/settings` | Edit profile (form + free text), change password, notification preferences, delete account. |

### 12c. "Review-then-send" UX (core interaction)

1. User opens a match → sees listing details + score rationale.
2. Below the listing card: a **"Generate message draft"** button. No draft exists until the user clicks it.
3. On click → loading spinner ("Drafting your message…", 2–3 seconds) → `POST /api/matches/:id/draft` → AI-generated message appears in an editable text area, with `{STUDENT_NAME}` / `{STUDENT_PROGRAM}` / `{STUDENT_LANGUAGE}` already substituted with real values from `users.name` / `user_profiles.study_program` / `users.locale`.
4. User can **edit** the draft freely.
4. Clicks **"Copy & Open on Flatfox"** → JavaScript copies the message text to clipboard + opens the listing's Flatfox page (`short_url` or `url` from API) in a new tab.
5. User pastes and sends on Flatfox's own contact form. (URL = `https://flatfox.ch` + listing's `url` field, e.g. `https://flatfox.ch/en/flat/uetlibergstr-8045-zurich/`).
6. Match status updates to "contacted" in our dashboard.

> This avoids any ToS risk — our app never touches Flatfox's messaging system. The user sends manually.

### 12d. Profile form fields (onboarding)

| Field | Type | Required | Notes |
|---|---|---|---|
| Name | text input | **yes** | Display name (used in AI-drafted messages via `{STUDENT_NAME}` placeholder). Stored in `users.name`. |
| Study program | text input | **yes** | e.g. "MSc Computer Science, ETH Zurich". Stored in `user_profiles.study_program`. Used in messages via `{STUDENT_PROGRAM}`. |
| Preferred language | dropdown | **yes** | DE / FR / EN / IT. Sets `users.locale`. Used for UI language and as `{STUDENT_LANGUAGE}` in messages. |
| Budget (max CHF/mo) | number input | **yes** | Gross rent. |
| City/cities | multi-select dropdown | **yes** | Options: Zürich, Lausanne, Genève, Basel, Bern, Winterthur, Luzern, St. Gallen, Lugano, Fribourg, Neuchâtel + "Other (specify)." |
| Radius (km) | slider or number | no | Default: 10 km. |
| Rooms (min) | number (0.5 steps) | no | Swiss convention: 1.5, 2.5, 3.5… |
| Move in from | date picker | **yes** | Earliest date. |
| Flexible on date? | toggle | no | Default: yes. |
| Furnished? | toggle | no | Default: no preference. |
| Max flatmates | number | no | 0 = solo. |
| Languages | multi-select | no | DE, FR, EN, IT, other. |
| Vibe | single select | no | Quiet / Social / Mixed / No preference. |
| Pets OK? | toggle | no | |
| Smoking OK? | toggle | no | |
| Gender preference | single select | no | Any / Female only / Male only. |
| Free text (optional) | textarea | no | "Tell us anything else…" → parsed by AI to fill/override above. |

**Free-text + form merge logic:** form fields are the baseline. If the user also provides free text, the AI parser extracts the same fields. Merge rule: **form wins for any field the user explicitly filled; AI fills only fields left empty/default.** Implementation: after AI parsing, for each field, `if form_value is not null/default → keep form_value, else → use ai_value`. The user sees a preview of the merged profile before confirming. This avoids the "budget 1500 in form vs. 1200 in text" ambiguity — the form's explicit value takes priority.

### 12e. Error & empty states

| State | What the user sees |
|---|---|
| No matches yet (new user) | "We're searching for you — matches usually appear within a few hours after listings are refreshed." |
| No matches (after search) | "No listings match your profile right now. We'll email you when new ones appear. Try widening your budget or radius." |
| AI draft failed | "Couldn't generate a message — try again." + retry button. Fallback: show a simple template the user fills manually. |
| Ingestion error (admin) | Logged in Sentry; user-facing: nothing (graceful — stale data is shown, just not refreshed). |
| Flatfox API down | Worker retries with exponential backoff; user sees stale matches with a subtle "Last updated: X minutes ago" timestamp. |

### 12f. Notifications

- **Daily digest email:** new matches above the score threshold, sent each morning. Free tier.
- **Phase 2 (Pro):** real-time email per new high-score match.
- **Trigger:** the matching engine runs after each ingestion cycle; any new match above threshold queues a notification.

**Deferred (not v1):**
- Any second platform (see §2 backlog).
- Auto-send if Flatfox ToS disallows programmatic contact → ship review-then-send only.

---

## 13. Development Roadmap

**Phase 0 — Validation:** ✅ **Done & verified live (2026-06-03).** Flatfox API confirmed: `GET /api/v1/public-listing/`, no auth, `limit`/`offset` pagination, ~35k listings (filter to ~15–20k housing), images via `expand`, no rate limiting observed. Only remaining unknown: ToS stance on programmatic contact (gates auto-send, Phase 2).

**Phase 1 — MVP (Flatfox only, ~6–10 weeks):**
- M1: Ingestion + `listings` populated from Flatfox API.
- M2: Profile builder (form + AI free-text parsing).
- M3: Two-layer matching engine + rationale.
- M4: AI message generation + **review-then-send**.
- M5: User app (matches, status), auth, billing, privacy/consent flows.
- M6: Beta with real students in one city (e.g. Zurich or Lausanne).

**Phase 2 — Refine & (maybe) expand (post-MVP):**
- Auto-send (if ToS allows), preference learning from feedback, alerts, multi-language polish.
- Evaluate a second platform from the §2 backlog (partnership-first: Flatfox depth → WOKO/HousingAnywhere).

**Phase 3 — Scale:** more cities/cantons, performance, B2B/university partnerships, growth marketing.

---

## 14. Claude Code Tasks

Tasks scoped for Claude Code. API access is confirmed — ready to build. Architecture: Next.js app (`/app`) + Python worker (`/worker`), shared Postgres.

**Infrastructure (do first):**
1. **Project scaffold** — Monorepo: `/app` (Next.js 14+, TypeScript), `/worker` (Python), `docker-compose.yml` (Postgres + Redis for local dev), shared `.env` structure. README with setup instructions.
2. **DB migrations** — Postgres schema from §6: `users`, `user_profiles`, `listings`, `listing_attributes`, `matches`, `messages`. Use Prisma (Next.js side) or raw SQL migrations.

**Python worker (`/worker`):**
3. **Flatfox API client** — Python module. Paginates through `GET /api/v1/public-listing/` using **`limit`/`offset`** (not `page`), always passing **`&expand=images,documents,attributes`** so image/document IDs resolve to objects. Returns typed listing objects (image URLs = `FLATFOX_BASE_URL` + relative signed `/thumb/...` path). Handles retries; add a small configurable delay between pages (no rate limit seen, but be polite).
4. **Ingestion job** — Scheduled (cron/APScheduler). Calls client → **filters to `RENT` + housing categories (APARTMENT/SHARED/HOUSE)** → upserts kept listings into `listings` table → flags removed/reserved ones → logs run stats (fetched/kept/new/updated/removed count).
5. **Listing attribute extractor** — Haiku 4.5 call per new listing: input = `description` + titles → output = structured JSON (`flatmate_count`, `languages[]`, `vibe`, `pets`, `smoking`, `gender_pref`, `move_in_flexible`). Prompt caching on the system prompt. Batch API for bulk. Write to `listing_attributes`.
6. **Matching engine** — Runs after ingestion. For each active user profile × new/changed listings: Layer 1 structured score + Layer 2 attribute overlap score → blended `score` + text `rationale`. Insert `matches` rows above threshold.
7. **Message drafter** — Sonnet 4.6 call per match the user requests a message for: input = listing + profile + match rationale → output = personalised contact message in the listing's language. Write to `messages` as draft.

**Next.js app (`/app`):**
8. **Auth** — NextAuth.js with Credentials provider: email + password (bcrypt). Sign up, login, logout, session middleware. `users` table.
9. **Onboarding flow** — `/onboarding`: choose form / free-text / both → profile input → AI parser calls worker endpoint (or in-app API route calling Haiku) → saves to `user_profiles`. Validate and preview extracted prefs.
10. **Dashboard** — `/dashboard`: list matches from DB, sorted by score, filterable by city/status (new/seen/contacted/dismissed). Badge count for new. Polling or refresh for updates.
11. **Match detail + message review** — `/match/:id`: listing card (photos, price, rooms, map, description) + score + rationale. Below: editable AI-drafted message. **"Copy & Open on Flatfox"** button (clipboard API + `window.open(listing.url)`). Update match status to "contacted."
12. **Settings** — `/settings`: edit profile, change password, notification prefs, delete account (self-serve).
13. **Daily digest email** — Triggered after matching run. Collect new matches above threshold per user → send summary email (e.g. via Resend / Postmark / SES). Keep template simple.

**Cross-cutting:**
14. **Compliance** — Consent checkbox at signup, privacy policy page, account deletion endpoint (hard-delete user data), listing data retention job (purge listings not seen in Flatfox for >7 days).
15. **PII sanitizer + security hardening** — Shared utility (used by both Next.js and Python) that strips emails, phone numbers, and user names from text before any Claude API call. For message generation, inject placeholders and substitute real values after. Also: rate limit login (5 failures → 15 min lockout), validate route ownership (users only see own data), `npm audit` / `pip audit` in CI. See §11b.

---

## 15. Open Questions & Decisions

1. ~~**[BLOCKER] Does Flatfox expose an official search endpoint?**~~ → ✅ **RESOLVED.** `GET /api/v1/public-listing/` returns all published listings, paginated, no auth required. Ingestion strategy: fetch all pages, store locally, match in our DB.
2. **Does Flatfox ToS permit programmatic contact requests?** Gates the auto-send mode. **Still open** — `submit_url` / `can_direct_apply` exist in the API data, but ToS permission for *automated* use is unconfirmed. If not → review-then-send only for v1 (user copies AI-drafted message, sends manually on Flatfox).
3. ~~**Rate limits**~~ → ✅ **No limiting observed** at low volume (6 rapid requests). Re-test at higher concurrency before a full parallel re-ingest.
4. Matching score **weights** between Layer 1 (structured) and Layer 2 (text) — tune with real data.
5. **Decided:** scope limited to Flatfox; both form and free-text profile input; review-then-send for v1 (auto-send Phase 2); responsive web app (Next.js + Python worker); email + password auth; Vercel + Railway deployment; monorepo.

---

## 16. Development Setup & Claude Code Workflow

### 16a. Prerequisites — install these before starting

| Tool | Why | Install |
|---|---|---|
| **Node.js 20+** | Runs Next.js and Claude Code | `brew install node` or [nodejs.org](https://nodejs.org) |
| **Python 3.11+** | Runs the worker (ingestion, extraction, matching) | `brew install python@3.11` or [python.org](https://python.org) |
| **Docker Desktop** | Local Postgres + Redis for development | [docker.com/products/docker-desktop](https://docker.com/products/docker-desktop) |
| **Git** | Version control | `brew install git` or [git-scm.com](https://git-scm.com) |
| **Claude Code** | AI-assisted development | `npm install -g @anthropic-ai/claude-code` |
| **GitHub account** | Repo hosting, CI/CD, Vercel/Railway integration | [github.com](https://github.com) |
| **Anthropic API key** | For the app's AI features (profile parsing, extraction, message drafting) | [console.anthropic.com](https://console.anthropic.com) — create an account, add credits (~$10 is plenty for development), generate an API key |

### 16b. One-time setup — do these steps in order

```bash
# 1. Create the GitHub repo
#    Go to github.com → New Repository → name: "student-housing" → Private → Create
#    Then clone it locally:
git clone https://github.com/YOUR_USERNAME/student-housing.git
cd student-housing

# 2. Copy the project plan into the repo root
cp ~/path/to/PROJECT-PLAN.md ./PROJECT-PLAN.md

# 3. Create the CLAUDE.md file (see §16c below — copy it into the repo root)

# 4. Create a .env file (DO NOT commit this — add .env to .gitignore)
cat > .env << 'EOF'
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/studenthousing
REDIS_URL=redis://localhost:6379
NEXTAUTH_SECRET=generate-a-random-string-here
NEXTAUTH_URL=http://localhost:3000
ANTHROPIC_API_KEY=sk-ant-your-key-here
INGESTION_INTERVAL_MINUTES=30
MATCH_SCORE_THRESHOLD=0.5
FLATFOX_BASE_URL=https://flatfox.ch
FLATFOX_EXPAND=images,documents,attributes
EOF

# 5. Initial commit
echo ".env" >> .gitignore
echo "node_modules/" >> .gitignore
echo "__pycache__/" >> .gitignore
echo ".next/" >> .gitignore
git add .
git commit -m "Initial project plan + CLAUDE.md"
git push origin main

# 6. Start Claude Code
claude
```

### 16c. CLAUDE.md — copy this file into the repo root

Claude Code reads this automatically at every session start. Keep it under 200 lines.

```markdown
# Student Housing Automation App

## What this is
SaaS web app that matches students with Flatfox housing listings using AI.
Full spec in PROJECT-PLAN.md — read it before starting any task.

## API verified live (2026-06-03)
- Endpoint: GET https://flatfox.ch/api/v1/public-listing/?limit=100&offset=0&expand=images,documents,attributes
- No auth required. Pagination via limit/offset (NOT page).
- ~35k total listings; filter to offer_type=RENT + object_category in (APARTMENT, SHARED, HOUSE).
- Images: bare int IDs by default; use &expand=images to get objects with signed /thumb/ URLs.
- Prepend https://flatfox.ch to all relative image paths (/thumb/ff/...).
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
/shared       → DB migrations
docker-compose.yml
PROJECT-PLAN.md
CLAUDE.md
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
- API routes: follow the exact contract in PROJECT-PLAN.md §6c. Do not invent new routes or change response shapes.
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
- **PII anonymization: NEVER send real user names, emails, or phone numbers to the Claude API.** Strip PII before all API calls. For message generation, use placeholders ({STUDENT_NAME} etc.) and substitute after the response. See PROJECT-PLAN.md §11b.

## Current Tasks
See PROJECT-PLAN.md §14 for the full task list.
Phase 0 (API verification) is done. Start from task 1 (scaffold).
Work through tasks in order (1→14). Each task = a working, testable increment.

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
```

### 16d. How to work with Claude Code — session by session

**Starting each session:**
```
cd student-housing
claude
```
Claude Code automatically reads your `CLAUDE.md`. Then tell it which task to work on:

```
> Read BUILD-SPEC.md §8. Start task 1: scaffold the monorepo.
```

**Tips for getting good results:**

- **One task per session.** Don't ask for "build the whole app." Go task by task from §14.
- **Verify before moving on.** After each task, test it works: run the server, check the DB, try the endpoint. Then commit.
- **If Claude Code goes off track,** use `/clear` to reset context, then restart the task.
- **Use `/compact`** if the session gets long and slow — it summarises the context.
- **Commit after each working task.** `git add . && git commit -m "feat: task N — description"`.

**Suggested prompts for each task:**

| Task | Status | Prompt to give Claude Code |
|---|---|---|
| Phase 0 | ✅ Done | API verified live — results already in PROJECT-PLAN.md (⚡ markers in §3). |
| 1. Scaffold | **Next** | `Read BUILD-SPEC.md. Create the monorepo: /app (Next.js 14, TypeScript), /worker (Python), docker-compose.yml (Postgres + Redis), .gitignore, and /shared for migrations.` |
| 2. DB | | `Read BUILD-SPEC.md §3. Create the Prisma schema in /app and a matching SQL migration in /shared. Tables: users, user_profiles, listings, listing_attributes, matches, messages. Run docker-compose up and verify tables exist.` |
| 3. Flatfox client | | `Read BUILD-SPEC.md §1 and §2. Create /worker/flatfox_client.py — paginate through GET /api/v1/public-listing/ using limit/offset, always passing &expand=images,documents,attributes. Filter to RENT + APARTMENT/SHARED/HOUSE. Return typed listing objects. Write a test that fetches page 1 from the real API.` |
| 4. Ingestion | | `Read BUILD-SPEC.md §2 (pipeline) and §8 task 4. Create the ingestion job in /worker that calls flatfox_client, upserts listings into Postgres, flags removed ones. Run it once and verify listings appear in the DB.` |
| 5. Extractor | | `Read BUILD-SPEC.md §5 Prompt 2. Create /worker/prompts/extract_listing.txt and /worker/extractor.py. For each new listing without attributes, call Haiku 4.5 with the prompt, parse the JSON, write to listing_attributes. Test on 5 real listings from the DB.` |
| 6. Matching | | `Read BUILD-SPEC.md §2 (matching engine). Create /worker/matcher.py. Layer 1 structured score + Layer 2 attribute overlap → blended score + rationale. Insert matches above 0.5. Write unit tests with mock data.` |
| 7. Message drafter | | `Read BUILD-SPEC.md §5 Prompt 3. Create /app/lib/prompts/draft_message.ts and /app/api/matches/[id]/draft/route.ts. Call Sonnet 4.6. Return the draft. Test with a real match from the DB.` |
| 8. Auth | | `Create email+password auth in /app using NextAuth.js Credentials provider. Signup (/signup) collects email, password, name, and preferred language (locale). Login (/login), logout, session middleware. Bcrypt. Store in users table via Prisma.` |
| 9. Onboarding | | `Read PROJECT-PLAN.md §12d (form fields + merge logic). Create /app/onboarding/page.tsx — collect study_program + all housing pref fields + optional free-text. Merge rule: form wins for explicitly filled fields, AI fills only empty ones. Show merged preview before saving to user_profiles.` |
| 10. Dashboard | | `Read BUILD-SPEC.md §7 (screens). Create /app/dashboard/page.tsx — matches sorted by score. Show title, city, price, rooms, score, rationale. Filter by status. Badge for new.` |
| 11. Match detail | | `Read BUILD-SPEC.md §7 (screens + review-then-send UX). Create /app/match/[id]/page.tsx — listing card (photos from /thumb/ URLs prepended with https://flatfox.ch, price, rooms, description) + score + rationale. "Generate message draft" button → loading spinner → POST /api/matches/:id/draft → editable message with placeholders substituted. "Copy & Open on Flatfox" button (clipboard + window.open(https://flatfox.ch + listing.url)). Update status.` |
| 12. Settings | | `Create /app/settings/page.tsx — edit profile, change password, notification prefs, delete account (hard-delete from all tables).` |
| 13. Email digest | | `Create /worker/digest.py — after matching, find users with new matches above threshold, send summary email. Use Resend or nodemailer. Template: "N new matches" + top 3.` |
| 14. Compliance | | `Consent checkbox on signup. Privacy policy page. Account deletion endpoint. Worker cron to purge listings not seen in Flatfox for >7 days.` |
| 15. PII + security | | `Read BUILD-SPEC.md §6. Create a shared PII sanitizer (regex strip emails, phones, names) used before every Claude API call. For message drafting, use {STUDENT_NAME}/{STUDENT_PROGRAM}/{STUDENT_LANGUAGE} placeholders and substitute after. Add login rate limiting (5 fails → 15 min lock). Add npm audit + pip audit to CI. Verify all API routes check session ownership.` |

### 16e. After all tasks — deploying

```bash
# 1. Vercel (Next.js frontend) — free tier
#    vercel.com → Import Git Repository → select student-housing
#    Set root directory to "app"
#    Add env vars: NEXTAUTH_SECRET, NEXTAUTH_URL, DATABASE_URL, ANTHROPIC_API_KEY
#    Deploy

# 2. Railway (Python worker + Postgres + Redis)
#    railway.app → New Project → Deploy from GitHub → select student-housing
#    Add Postgres service + Redis service
#    Add service from /worker directory
#    Set env vars: DATABASE_URL (from Railway Postgres), REDIS_URL, ANTHROPIC_API_KEY,
#                  INGESTION_INTERVAL_MINUTES, MATCH_SCORE_THRESHOLD, FLATFOX_BASE_URL, FLATFOX_EXPAND
#    Deploy

# 3. Connect Vercel to Railway's Postgres
#    Copy DATABASE_URL from Railway → paste into Vercel env vars → Redeploy
```
