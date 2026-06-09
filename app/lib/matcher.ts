import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";

// Base layer weights (renormalized by Layer 2 coverage in the final blend).
const L1_BASE_WEIGHT = 0.6;
const L2_BASE_WEIGHT = 0.4;

const PRICE_W = 0.35;
const LOCATION_W = 0.3;
const ROOMS_W = 0.15;
const DATE_W = 0.2;

// Curve parameters (v2 — see MATCHING-ALGORITHM-V2.md).
const BUDGET_CEILING_MULT = 1.3;
const RADIUS_CEILING_MULT = 2.0;
const ROOMS_TOLERANCE = 1.0;
const ROOMS_HARD_DEFICIT = 2.0;
const DATE_GRACE_EARLY = 30;
const DATE_EARLY_CEILING = 120;
const DATE_EARLY_FLOOR_DROP = 0.6;
const DATE_GRACE_LATE = 7;
const DATE_LATE_CEILING = 45;
const DATE_MAX_LATE = 120;
const DATE_FLEX_BONUS_GRACE = 14;
const DATE_FLEX_BONUS_CEILING = 30;
const DATE_FLEX_BONUS_MAX_LATE = 30;
const VIBE_MIXED_SCORE = 0.65;

const L2_ATTRIBUTE_COUNT = 5;
const L1_SUBSCORE_COUNT = 4;

const MATCH_SCORE_THRESHOLD = 0.5;
const EARTH_RADIUS_KM = 6371.0;

const CITY_COORDS: Record<string, [number, number]> = {
  "zürich": [47.3769, 8.5417],
  "zurich": [47.3769, 8.5417],
  "lausanne": [46.5197, 6.6323],
  "genève": [46.2044, 6.1432],
  "geneva": [46.2044, 6.1432],
  "geneve": [46.2044, 6.1432],
  "basel": [47.5596, 7.5886],
  "bern": [46.948, 7.4474],
  "winterthur": [47.5001, 8.724],
  "luzern": [47.0502, 8.3093],
  "lucerne": [47.0502, 8.3093],
  "st. gallen": [47.4245, 9.3767],
  "st.gallen": [47.4245, 9.3767],
  "lugano": [46.0037, 8.9511],
  "fribourg": [46.8065, 7.162],
  "neuchâtel": [46.99, 6.9293],
  "neuchatel": [46.99, 6.9293],
};

interface Profile {
  userId: string;
  budgetMax: number | null;
  roomsMin: number | null;
  cities: string[];
  radiusKm: number;
  moveInFrom: Date | null;
  moveInFlexible: boolean;
  languages: string[];
  vibe: string | null;
  maxFlatmates: number | null;
  petsOk: boolean | null;
  smokingOk: boolean | null;
  genderPref: string | null;
}

interface ListingWithAttrs {
  id: number;
  slug: string;
  url: string;
  city: string | null;
  rentNet: number | null;
  rentCharges: number | null;
  rentGross: number | null;
  numberOfRooms: number | null;
  movingDate: Date | null;
  lat: number | null;
  lng: number | null;
  publicTitle: string | null;
  attributes: {
    flatmateCount: number | null;
    languages: string[];
    vibe: string | null;
    pets: boolean | null;
    smoking: boolean | null;
    genderPref: string | null;
    moveInFlexible: boolean | null;
  } | null;
}

function haversine(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const rlat1 = toRad(lat1);
  const rlon1 = toRad(lon1);
  const rlat2 = toRad(lat2);
  const rlon2 = toRad(lon2);
  const dlat = rlat2 - rlat1;
  const dlon = rlon2 - rlon1;
  const a =
    Math.sin(dlat / 2) ** 2 +
    Math.cos(rlat1) * Math.cos(rlat2) * Math.sin(dlon / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(a));
}

function clamp(v: number, lo = 0, hi = 1): number {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

function smoothDecay(value: number, target: number, ceiling: number): number {
  if (ceiling <= target) return value <= target ? 1.0 : 0.0;
  const x = clamp((value - target) / (ceiling - target));
  return 1.0 - x * x;
}

function getCityCoords(city: string): [number, number] | undefined {
  return CITY_COORDS[city.toLowerCase().trim()];
}

function diffDays(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));
}

// === Layer 1 sub-scores ===

function priceScore(rentGross: number | null, budgetMax: number | null): [number | null, string] {
  if (rentGross == null || budgetMax == null) return [null, "Budget: unknown"];
  if (rentGross <= budgetMax) return [1.0, `Budget ✓ (CHF ${rentGross.toFixed(0)} ≤ ${budgetMax})`];
  const ceiling = budgetMax * BUDGET_CEILING_MULT;
  const score = smoothDecay(rentGross, budgetMax, ceiling);
  return [score, `Budget ~ (CHF ${rentGross.toFixed(0)}, ${Math.round((rentGross / budgetMax) * 100)}% of ${budgetMax})`];
}

function locationScore(
  listingLat: number | null,
  listingLng: number | null,
  listingCity: string | null,
  profileCities: string[],
  radiusKm: number
): [number | null, string] {
  if (profileCities.length === 0) return [null, "Location: no preference"];

  let bestScore: number | null = null;
  let bestReason = "Location ✗ (no city match)";
  const ceiling = radiusKm * RADIUS_CEILING_MULT;

  for (const pc of profileCities) {
    const coords = getCityCoords(pc);
    if (!coords) {
      if (listingCity && pc.toLowerCase().trim() === listingCity.toLowerCase().trim()) {
        return [1.0, `Location ✓ (${listingCity})`];
      }
      continue;
    }

    if (listingLat != null && listingLng != null) {
      const dist = haversine(coords[0], coords[1], listingLat, listingLng);
      if (dist <= radiusKm) return [1.0, `Location ✓ (${dist.toFixed(1)}km from ${pc})`];
      const s = smoothDecay(dist, radiusKm, ceiling);
      if (bestScore == null || s > bestScore) {
        bestScore = s;
        bestReason = `Location ~ (${dist.toFixed(1)}km from ${pc})`;
      }
    } else if (listingCity && pc.toLowerCase().trim() === listingCity.toLowerCase().trim()) {
      return [1.0, `Location ✓ (${listingCity})`];
    }
  }

  return [bestScore ?? 0.0, bestReason];
}

function roomsScore(numberOfRooms: number | null, roomsMin: number | null): [number | null, string] {
  if (numberOfRooms == null || roomsMin == null) return [null, "Rooms: unknown"];
  const deficit = Math.max(0, roomsMin - numberOfRooms);
  if (deficit === 0) return [1.0, `Rooms ✓ (${numberOfRooms} ≥ ${roomsMin})`];
  const score = smoothDecay(deficit, 0, ROOMS_TOLERANCE);
  return [score, `Rooms ~ (${numberOfRooms}, need ${roomsMin})`];
}

function dateScore(
  movingDate: Date | null,
  moveInFrom: Date | null,
  moveInFlexible: boolean
): [number | null, string] {
  if (movingDate == null || moveInFrom == null) return [null, "Date: unknown"];
  const diff = diffDays(movingDate, moveInFrom);

  if (diff <= 0) {
    const earliness = -diff;
    if (earliness <= DATE_GRACE_EARLY) return [1.0, `Date ✓ (${earliness}d early)`];
    const x = clamp((earliness - DATE_GRACE_EARLY) / (DATE_EARLY_CEILING - DATE_GRACE_EARLY));
    const score = 1.0 - DATE_EARLY_FLOOR_DROP * x * x;
    return [score, `Date ~ (${earliness}d early)`];
  }

  const graceLate = DATE_GRACE_LATE + (moveInFlexible ? DATE_FLEX_BONUS_GRACE : 0);
  const lateCeiling = DATE_LATE_CEILING + (moveInFlexible ? DATE_FLEX_BONUS_CEILING : 0);
  if (diff <= graceLate) return [1.0, `Date ✓ (${diff}d late)`];
  const score = smoothDecay(diff, graceLate, lateCeiling);
  return [score, `Date ~ (${diff}d late)`];
}

// === Layer 2 attributes ===

function categoryScore(profileVal: string, listingVal: string): number {
  if (profileVal === listingVal) return 1.0;
  if (profileVal === "mixed" || listingVal === "mixed") return VIBE_MIXED_SCORE;
  return 0.0;
}

function languagesScore(profileLangs: string[], listingLangs: string[]): number {
  const userSet = new Set(profileLangs.map((l) => l.toLowerCase()));
  const listingSet = new Set(listingLangs.map((l) => l.toLowerCase()));
  if (userSet.size === 0) return 1.0;
  let overlap = 0;
  userSet.forEach((l) => {
    if (listingSet.has(l)) overlap++;
  });
  return overlap / userSet.size;
}

function layer2Score(
  profile: Profile,
  attrs: ListingWithAttrs["attributes"]
): { score: number | null; reasons: string[]; presentCount: number } {
  const reasons: string[] = [];
  const present: number[] = [];

  if (profile.vibe != null && attrs?.vibe != null) {
    const s = categoryScore(profile.vibe, attrs.vibe);
    present.push(s);
    reasons.push(`vibe ${s >= 1.0 ? "✓" : s > 0 ? "~" : "✗"}`);
  }

  if (profile.genderPref != null && attrs?.genderPref != null) {
    const s = categoryScore(profile.genderPref, attrs.genderPref);
    present.push(s);
    reasons.push(`gender_pref ${s >= 1.0 ? "✓" : s > 0 ? "~" : "✗"}`);
  }

  if (profile.petsOk != null && attrs?.pets != null) {
    const s = profile.petsOk === attrs.pets ? 1.0 : 0.0;
    present.push(s);
    reasons.push(`pets ${s === 1.0 ? "✓" : "✗"}`);
  }

  if (profile.smokingOk != null && attrs?.smoking != null) {
    const s = profile.smokingOk === attrs.smoking ? 1.0 : 0.0;
    present.push(s);
    reasons.push(`smoking ${s === 1.0 ? "✓" : "✗"}`);
  }

  if (profile.languages.length > 0 && attrs?.languages && attrs.languages.length > 0) {
    const s = languagesScore(profile.languages, attrs.languages);
    present.push(s);
    reasons.push(`languages ${s >= 1.0 ? "✓" : s > 0 ? "~" : "✗"}`);
  }

  if (present.length === 0) {
    return { score: null, reasons: ["No text attributes to compare"], presentCount: 0 };
  }

  const score = present.reduce((a, b) => a + b, 0) / present.length;
  return { score, reasons, presentCount: present.length };
}

// === Hard filters ===

function passesHardFilters(
  profile: Profile,
  listing: ListingWithAttrs,
  effectiveGross: number
): boolean {
  if (profile.budgetMax != null && effectiveGross > profile.budgetMax * BUDGET_CEILING_MULT) {
    return false;
  }

  if (profile.cities.length > 0) {
    let withinCeiling = false;
    const ceiling = profile.radiusKm * RADIUS_CEILING_MULT;
    for (const pc of profile.cities) {
      const coords = getCityCoords(pc);
      if (!coords) {
        if (listing.city && pc.toLowerCase().trim() === listing.city.toLowerCase().trim()) {
          withinCeiling = true;
          break;
        }
        continue;
      }
      if (listing.lat != null && listing.lng != null) {
        const dist = haversine(coords[0], coords[1], listing.lat, listing.lng);
        if (dist <= ceiling) {
          withinCeiling = true;
          break;
        }
      } else if (listing.city && pc.toLowerCase().trim() === listing.city.toLowerCase().trim()) {
        withinCeiling = true;
        break;
      }
    }
    if (!withinCeiling) return false;
  }

  if (profile.roomsMin != null && listing.numberOfRooms != null) {
    if (profile.roomsMin - listing.numberOfRooms > ROOMS_HARD_DEFICIT) return false;
  }

  if (profile.moveInFrom != null && listing.movingDate != null) {
    const diff = diffDays(listing.movingDate, profile.moveInFrom);
    if (diff > 0) {
      const maxLate = DATE_MAX_LATE + (profile.moveInFlexible ? DATE_FLEX_BONUS_MAX_LATE : 0);
      if (diff > maxLate) return false;
    }
  }

  return true;
}

function computeMatch(
  profile: Profile,
  listing: ListingWithAttrs
): {
  score: number;
  scoreBreakdown: Prisma.JsonObject;
  rationale: string;
  listingSnapshot: Prisma.JsonObject;
} | null {
  const effectiveGross =
    listing.rentGross != null && listing.rentGross > 0
      ? listing.rentGross
      : listing.rentNet != null && listing.rentNet > 0
        ? listing.rentNet + (listing.rentCharges ?? 0)
        : null;

  if (effectiveGross == null) return null;
  if (!passesHardFilters(profile, listing, effectiveGross)) return null;

  const [ps, pr] = priceScore(effectiveGross, profile.budgetMax);
  const [ls, lr] = locationScore(listing.lat, listing.lng, listing.city, profile.cities, profile.radiusKm);
  const [rs, rr] = roomsScore(listing.numberOfRooms, profile.roomsMin);
  const [ds, dr] = dateScore(listing.movingDate, profile.moveInFrom, profile.moveInFlexible);

  const l1Pairs: [number, number][] = [];
  if (ps != null) l1Pairs.push([ps, PRICE_W]);
  if (ls != null) l1Pairs.push([ls, LOCATION_W]);
  if (rs != null) l1Pairs.push([rs, ROOMS_W]);
  if (ds != null) l1Pairs.push([ds, DATE_W]);

  let l1: number | null = null;
  if (l1Pairs.length > 0) {
    const totalW = l1Pairs.reduce((a, [, w]) => a + w, 0);
    l1 = l1Pairs.reduce((a, [s, w]) => a + s * w, 0) / totalW;
  }

  const { score: l2, reasons: l2Reasons, presentCount: l2Present } = layer2Score(profile, listing.attributes);

  if (l1 == null && l2 == null) return null;

  let final: number;
  let coverage = 0;
  if (l2 == null || l2Present === 0) {
    final = l1 ?? 0;
  } else if (l1 == null) {
    coverage = l2Present / L2_ATTRIBUTE_COUNT;
    final = l2;
  } else {
    coverage = l2Present / L2_ATTRIBUTE_COUNT;
    const w2 = L2_BASE_WEIGHT * coverage;
    const w1 = 1 - w2;
    final = w1 * l1 + w2 * l2;
  }

  if (final < MATCH_SCORE_THRESHOLD) return null;

  const l1PresentCount = [ps, ls, rs, ds].filter((s) => s != null).length;
  const completeness = (l1PresentCount + l2Present) / (L1_SUBSCORE_COUNT + L2_ATTRIBUTE_COUNT);

  const round4 = (v: number) => Math.round(v * 10000) / 10000;

  return {
    score: round4(final),
    scoreBreakdown: {
      l1: l1 != null ? round4(l1) : null,
      l2: l2 != null ? round4(l2) : null,
      price: ps != null ? round4(ps) : null,
      location: ls != null ? round4(ls) : null,
      rooms: rs != null ? round4(rs) : null,
      date: ds != null ? round4(ds) : null,
      coverage: round4(coverage),
      completeness: round4(completeness),
    } as Prisma.JsonObject,
    rationale: [pr, lr, rr, dr, ...l2Reasons].join(", "),
    listingSnapshot: {
      title: listing.publicTitle ?? "",
      city: listing.city ?? "",
      price: effectiveGross,
      rent_net: listing.rentNet,
      rent_charges: listing.rentCharges,
    } as Prisma.JsonObject,
  };
}

// Suppress unused-import warning for L1_BASE_WEIGHT (kept for documentation).
void L1_BASE_WEIGHT;

export async function runMatchingForUser(userId: string): Promise<number> {
  const profile = await prisma.userProfile.findUnique({
    where: { userId },
  });
  if (!profile) return 0;

  const p: Profile = {
    userId,
    budgetMax: profile.budgetMax,
    roomsMin: profile.roomsMin,
    cities: profile.cities,
    radiusKm: profile.radiusKm,
    moveInFrom: profile.moveInFrom,
    moveInFlexible: profile.moveInFlexible,
    languages: profile.languages,
    vibe: profile.vibe,
    maxFlatmates: profile.maxFlatmates,
    petsOk: profile.petsOk,
    smokingOk: profile.smokingOk,
    genderPref: profile.genderPref,
  };

  const listings = await prisma.listing.findMany({
    where: { status: "active", removedAt: null },
    select: {
      id: true,
      slug: true,
      url: true,
      city: true,
      rentNet: true,
      rentCharges: true,
      rentGross: true,
      numberOfRooms: true,
      movingDate: true,
      lat: true,
      lng: true,
      publicTitle: true,
      attributes: {
        select: {
          flatmateCount: true,
          languages: true,
          vibe: true,
          pets: true,
          smoking: true,
          genderPref: true,
          moveInFlexible: true,
        },
      },
    },
  });

  const matchData: Prisma.MatchCreateManyInput[] = [];

  for (const listing of listings) {
    const result = computeMatch(p, listing);
    if (result) {
      matchData.push({
        userId,
        listingId: listing.id,
        score: result.score,
        scoreBreakdown: result.scoreBreakdown,
        rationale: result.rationale,
        status: "new",
        listingSnapshot: result.listingSnapshot,
      });
    }
  }

  if (matchData.length > 0) {
    await prisma.match.createMany({
      data: matchData,
      skipDuplicates: true,
    });
  }

  return matchData.length;
}
