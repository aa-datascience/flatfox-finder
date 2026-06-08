# FlatfoxFinder — Matching Algorithm Report

## Overview

Each listing is scored against a user profile in two layers. The final score is a weighted sum of Layer 1 (quantitative hard facts) and Layer 2 (qualitative lifestyle attributes). Listings must pass hard filters before scoring even begins.

**Source code:**
- TypeScript (on-demand, when profile saved): `app/lib/matcher.ts`
- Python (batch, for new listings): `worker/src/flatfox_worker/matcher.py`

Both implementations are identical in logic.

---

## 1. Hard Filters (pass/fail — before any scoring)

These eliminate listings outright. A listing that fails any one of these is **never shown** to the user.

| Filter | Rule | Rationale |
|---|---|---|
| **No rent data** | `effectiveGross` must exist and be > 0. Computed as: `rent_gross` if available, else `rent_net + rent_charges`, else excluded. Values of 0 are treated as missing. | Can't compare budget without price. |
| **Over budget** | `effectiveGross > user.budgetMax` → excluded | Hard cutoff. No tolerance. |
| **Outside location** | Listing must be within `user.radiusKm` of at least one of the user's preferred cities (haversine distance on lat/lng). Falls back to city name match if coordinates are missing. | Hard cutoff at the exact radius. |

---

## 2. Layer 1 — Quantitative Score (weight: 60% of final)

Four sub-scores, each producing a value from 0.0 to 1.0:

```
L1 = 0.35 x price + 0.30 x location + 0.15 x rooms + 0.20 x date
```

### 2a. Price Score (weight 35% of L1)

| Condition | Score | Note |
|---|---|---|
| `rent <= budget` | **1.0** | Within budget |
| `rent > budget` but `rent/budget <= 1.3` | Linear interpolation from 1.0 to 0.0 | Formula: `1.0 - (ratio - 1.0) / 0.3` |
| `rent/budget > 1.3` | **0.0** | Way over budget |
| Either value missing | **0.5** | Neutral/unknown |

> **Note:** The hard filter already blocks `rent > budget`, so in practice the soft scoring only applies when `budget` is null (user didn't set one). The 100-130% interpolation range is dead code after the hard filter was added.

### 2b. Location Score (weight 30% of L1)

Uses the haversine formula to compute great-circle distance between the listing's lat/lng and each of the user's preferred city centers. City coordinates are hardcoded for 11 Swiss cities:

Zurich, Lausanne, Geneva, Basel, Bern, Winterthur, Luzern, St. Gallen, Lugano, Fribourg, Neuchatel.

| Condition | Score |
|---|---|
| `distance <= radiusKm` | **1.0** |
| `radiusKm < distance <= 2 x radiusKm` | Linear: `1.0 - (dist - radius) / radius` |
| `distance > 2 x radiusKm` | **0.0** |
| No preferred cities set | **0.5** (neutral) |
| No lat/lng but city name matches | **1.0** |

Takes the **best score** across all preferred cities (e.g., if a user wants Zurich or Basel, it checks both and keeps the higher score).

> **Note:** The hard filter already blocks listings outside the radius, so the soft scoring between radius and 2x radius is dead code currently.

### 2c. Rooms Score (weight 15% of L1)

| Condition | Score |
|---|---|
| `listing.rooms >= user.roomsMin` | **1.0** |
| `user.roomsMin - listing.rooms <= 0.5` | **0.5** (half room tolerance) |
| `listing.rooms < user.roomsMin - 0.5` | **0.0** |
| Either value missing | **0.5** |

> **Note:** No hard filter on rooms. A studio (1 room) will still show up if the user wants 2 rooms — it just gets a lower score.

### 2d. Date Score (weight 20% of L1)

Compares `listing.movingDate` to `user.moveInFrom`:

| Condition | Score |
|---|---|
| `|diff| <= 14 days` | **1.0** |
| `|diff| <= 30 days` AND `user.flexible = true` | **1.0** |
| `|diff| <= 30 days` AND `user.flexible = false` | **0.5** |
| `|diff| > 30 days` | **0.0** |
| Either date missing, flexible | **0.5** |
| Either date missing, not flexible | **0.3** |

---

## 3. Layer 2 — Qualitative Score (weight: 40% of final)

Compares 5 lifestyle attributes extracted by AI (Claude Haiku) from the listing description against the user's profile preferences:

| Attribute | Profile field | Listing field | Comparison type |
|---|---|---|---|
| **Vibe** | `user.vibe` (quiet/social/mixed) | `listing.vibe` | Exact match: +1 if same, 0 if either is "mixed", -1 if conflict |
| **Languages** | `user.languages` (array) | `listing.languages` (array) | Set overlap: +1 if any overlap, 0 otherwise |
| **Pets** | `user.petsOk` (bool) | `listing.pets` (bool) | Boolean match: +1 if same, -1 if conflict |
| **Smoking** | `user.smokingOk` (bool) | `listing.smoking` (bool) | Boolean match: +1 if same, -1 if conflict |
| **Gender pref** | `user.genderPref` | `listing.genderPref` | Exact match: +1 if same, 0 if either is "mixed", -1 if conflict |

### Scoring logic

- Only attributes where **both** the profile and listing have a value are compared.
- Each comparable pair contributes +1 (match), 0 (neutral), or -1 (conflict).
- Final L2 score: `(total + maxPossible) / (2 x maxPossible)`, normalized to 0.0-1.0.
- If **no attributes** can be compared (all null on one side): **0.5** (neutral).

### Example

If 3 attributes are comparable and scores are [+1, +1, -1]:

- total = 1, maxPossible = 3
- L2 = (1 + 3) / (2 x 3) = 4/6 = **0.667**

---

## 4. Final Score

```
Final = 0.6 x L1 + 0.4 x L2
```

- **Threshold:** matches with `Final < 0.5` are discarded and not shown to the user.
- Scores are rounded to 4 decimal places.
- The dashboard displays `round(Final x 100)` as a percentage.

---

## 5. Worked Example

**User profile:** budget 1200 CHF, Zurich, radius 20km, 2+ rooms, move-in 2026-07-01 (flexible), speaks DE/EN, vibe quiet, no pets, no smoking.

**Listing:** rent 950 CHF, Winterthur (18.7km from Zurich), 2 rooms, available 2026-06-15, vibe quiet, pets no, smoking no, languages DE.

### Hard filters

- Rent 950 <= 1200 budget: **pass**
- Distance 18.7km <= 20km radius: **pass**
- Rent data exists: **pass**

### Layer 1

| Sub-score | Calculation | Result |
|---|---|---|
| Price | 950 <= 1200 | **1.0** |
| Location | 18.7km within 20km radius | **1.0** |
| Rooms | 2 >= 2 | **1.0** |
| Date | |July 1 - June 15| = 16 days, flexible | **1.0** |

```
L1 = 0.35(1.0) + 0.30(1.0) + 0.15(1.0) + 0.20(1.0) = 1.0
```

### Layer 2

| Attribute | Profile | Listing | Score |
|---|---|---|---|
| Vibe | quiet | quiet | **+1** |
| Languages | [DE, EN] | [DE] | **+1** (overlap: DE) |
| Pets | false | false | **+1** |
| Smoking | false | false | **+1** |
| Gender | null | null | not compared |

```
total = 4, maxPossible = 4
L2 = (4 + 4) / (2 x 4) = 1.0
```

### Final

```
Final = 0.6 x 1.0 + 0.4 x 1.0 = 1.0 (100%)
```

---

## 6. Score Range Analysis

Given the weights and threshold, here are some boundary scenarios:

| Scenario | L1 | L2 | Final | Shown? |
|---|---|---|---|---|
| Perfect match on everything | 1.0 | 1.0 | **1.0** | Yes |
| Good L1, no attributes to compare | 0.8 | 0.5 | **0.68** | Yes |
| All L1 neutral (missing data), no L2 | 0.5 | 0.5 | **0.50** | Borderline |
| Good location+price, bad date+rooms, no L2 | 0.65 | 0.5 | **0.59** | Yes |
| All L1 conflict, all L2 conflict | 0.0 | 0.0 | **0.0** | No |
| Average L1, all L2 conflicts | 0.5 | 0.0 | **0.30** | No |

---

## 7. Known Limitations and Discussion Points

### Hard filter strictness

1. **Budget is binary** — a listing at CHF 1201 with budget 1200 is completely excluded. No tolerance margin. Should there be a 5-10% buffer?

2. **Location is binary** — a listing at 15.1km with a 15km radius is excluded. The soft scoring code for radius-to-2x-radius exists but is unreachable after the hard filter. Should the hard filter use a larger radius (e.g., 1.5x) and let soft scoring handle the rest?

### Missing hard filters

3. **No hard filter on rooms** — a studio still shows up if you want 3 rooms (just scores 0.0 on that sub-score). Should there be a hard cutoff?

4. **No hard filter on date** — a listing available in 6 months still shows up (scores 0.0 on date). Should there be a maximum date difference?

### Layer 2 issues

5. **L2 defaults to 0.5 when no attributes are available** — most listings don't have AI-extracted attributes yet (extraction happens gradually), so L2 is a neutral constant for many matches. This means 40% of the score contributes no useful signal for unextracted listings.

6. **"mixed" vibe is treated as neutral (0)** — a "quiet" user matching a "mixed" listing gets no bonus and no penalty. Arguably it should get a small bonus since "mixed" is compatible with both.

7. **Languages use presence/absence only** — no weighting for how many languages overlap. A listing with [DE, FR, EN] matching a user with [DE] scores the same as matching [DE, FR, EN]. Should more overlap = higher score?

### Unused fields

8. **maxFlatmates** is in the profile but never used in scoring — the field exists and is collected from the user but isn't compared against the listing's `flatmateCount`. Should it be added as a Layer 1 or Layer 2 criterion?

### Weight inflexibility

9. **All L1 weights are fixed** — users can't indicate which criteria matter most to them (e.g., "location is more important than price for me"). Allowing user-adjustable weights could improve match quality but adds UI complexity.

### Other ideas

10. **Recency bias** — newer listings could get a small score boost to surface fresh opportunities.

11. **Popularity signal** — if many users dismiss a listing, it might indicate a problem not captured by the data (bad photos, misleading description, etc.).

12. **Budget efficiency bonus** — a listing at 50% of budget could score higher than one at 99% of budget, rewarding savings.
