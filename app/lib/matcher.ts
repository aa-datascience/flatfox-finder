import type { Prisma } from "@prisma/client";

import { prisma } from "@/lib/db";

const L1_WEIGHT = 0.6;
const L2_WEIGHT = 0.4;

const PRICE_W = 0.35;
const LOCATION_W = 0.30;
const ROOMS_W = 0.15;
const DATE_W = 0.20;

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
  "bern": [46.9480, 7.4474],
  "winterthur": [47.5001, 8.7240],
  "luzern": [47.0502, 8.3093],
  "lucerne": [47.0502, 8.3093],
  "st. gallen": [47.4245, 9.3767],
  "st.gallen": [47.4245, 9.3767],
  "lugano": [46.0037, 8.9511],
  "fribourg": [46.8065, 7.1620],
  "neuchâtel": [46.9900, 6.9293],
  "neuchatel": [46.9900, 6.9293],
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

function priceScore(rentGross: number | null, budgetMax: number | null): [number, string] {
  if (rentGross == null || budgetMax == null) return [0.5, "Budget: unknown"];
  if (rentGross <= budgetMax) return [1.0, `Budget ✓ (CHF ${rentGross.toFixed(0)} ≤ ${budgetMax})`];
  const ratio = rentGross / budgetMax;
  if (ratio > 1.3) return [0.0, `Budget ✗ (CHF ${rentGross.toFixed(0)} > 130% of ${budgetMax})`];
  const score = 1.0 - (ratio - 1.0) / 0.3;
  return [score, `Budget ~ (CHF ${rentGross.toFixed(0)}, ${(ratio * 100).toFixed(0)}% of ${budgetMax})`];
}

function locationScore(
  listingLat: number | null,
  listingLng: number | null,
  listingCity: string | null,
  profileCities: string[],
  radiusKm: number
): [number, string] {
  if (profileCities.length === 0) return [0.5, "Location: no preference"];

  let bestScore = 0.0;
  let bestReason = "Location ✗ (no city match)";

  for (const pc of profileCities) {
    const coords = CITY_COORDS[pc.toLowerCase().trim()];
    if (!coords) {
      if (listingCity && pc.toLowerCase().trim() === listingCity.toLowerCase().trim()) {
        return [1.0, `Location ✓ (${listingCity})`];
      }
      continue;
    }

    if (listingLat != null && listingLng != null) {
      const dist = haversine(coords[0], coords[1], listingLat, listingLng);
      if (dist <= radiusKm) return [1.0, `Location ✓ (${dist.toFixed(1)}km from ${pc})`];
      if (dist <= 2 * radiusKm) {
        const s = 1.0 - (dist - radiusKm) / radiusKm;
        if (s > bestScore) {
          bestScore = s;
          bestReason = `Location ~ (${dist.toFixed(1)}km from ${pc})`;
        }
      }
    } else if (listingCity && pc.toLowerCase().trim() === listingCity.toLowerCase().trim()) {
      return [1.0, `Location ✓ (${listingCity})`];
    }
  }

  return [bestScore, bestReason];
}

function roomsScore(numberOfRooms: number | null, roomsMin: number | null): [number, string] {
  if (numberOfRooms == null || roomsMin == null) return [0.5, "Rooms: unknown"];
  if (numberOfRooms >= roomsMin) return [1.0, `Rooms ✓ (${numberOfRooms} ≥ ${roomsMin})`];
  if (roomsMin - numberOfRooms <= 0.5) return [0.5, `Rooms ~ (${numberOfRooms}, need ${roomsMin})`];
  return [0.0, `Rooms ✗ (${numberOfRooms} < ${roomsMin})`];
}

function dateScore(
  movingDate: Date | null,
  moveInFrom: Date | null,
  moveInFlexible: boolean
): [number, string] {
  if (movingDate == null || moveInFrom == null) {
    return [moveInFlexible ? 0.5 : 0.3, "Date: unknown"];
  }
  const diffDays = Math.abs(
    Math.round((movingDate.getTime() - moveInFrom.getTime()) / (1000 * 60 * 60 * 24))
  );
  if (diffDays <= 14 || (moveInFlexible && diffDays <= 30)) return [1.0, `Date ✓ (${diffDays}d diff)`];
  if (diffDays <= 30) return [0.5, `Date ~ (${diffDays}d diff)`];
  return [0.0, `Date ✗ (${diffDays}d diff)`];
}

function textAttrScore(profileVal: unknown, listingVal: unknown): number {
  if (profileVal == null || listingVal == null) return 0;
  if (typeof profileVal === "boolean" && typeof listingVal === "boolean") {
    return profileVal === listingVal ? 1 : -1;
  }
  if (Array.isArray(profileVal) && Array.isArray(listingVal)) {
    const overlap = profileVal.filter((v) => listingVal.includes(v));
    return overlap.length > 0 ? 1 : 0;
  }
  if (profileVal === listingVal) return 1;
  if (profileVal === "mixed" || listingVal === "mixed") return 0;
  return -1;
}

function layer2Score(
  profile: Profile,
  attrs: ListingWithAttrs["attributes"]
): [number, string[]] {
  const pairs: [string, unknown, unknown][] = [
    ["vibe", profile.vibe, attrs?.vibe ?? null],
    ["languages", profile.languages.length > 0 ? profile.languages : null, attrs?.languages?.length ? attrs.languages : null],
    ["pets", profile.petsOk, attrs?.pets ?? null],
    ["smoking", profile.smokingOk, attrs?.smoking ?? null],
    ["gender_pref", profile.genderPref, attrs?.genderPref ?? null],
  ];

  let total = 0;
  let maxPossible = 0;
  const reasons: string[] = [];

  for (const [name, pval, lval] of pairs) {
    const s = textAttrScore(pval, lval);
    if (pval != null && lval != null) {
      maxPossible += 1;
      total += s;
      if (s > 0) reasons.push(`${name} ✓`);
      else if (s < 0) reasons.push(`${name} ✗`);
    }
  }

  if (maxPossible === 0) return [0.5, ["No text attributes to compare"]];
  const score = (total + maxPossible) / (2 * maxPossible);
  return [score, reasons];
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
  // Compute effective gross rent
  const effectiveGross =
    listing.rentGross ??
    (listing.rentNet != null
      ? listing.rentNet + (listing.rentCharges ?? 0)
      : null);

  // Hard filter: exclude listings with no rent info
  if (effectiveGross == null) return null;

  // Hard filter: skip listings over budget
  if (profile.budgetMax != null && effectiveGross > profile.budgetMax) {
    return null;
  }

  // Hard filter: skip listings outside radius of all preferred cities
  if (profile.cities.length > 0) {
    let withinRadius = false;
    for (const pc of profile.cities) {
      const coords = CITY_COORDS[pc.toLowerCase().trim()];
      if (coords && listing.lat != null && listing.lng != null) {
        const dist = haversine(coords[0], coords[1], listing.lat, listing.lng);
        if (dist <= profile.radiusKm) {
          withinRadius = true;
          break;
        }
      } else if (
        listing.city &&
        pc.toLowerCase().trim() === listing.city.toLowerCase().trim()
      ) {
        withinRadius = true;
        break;
      }
    }
    if (!withinRadius) return null;
  }

  const [ps, pr] = priceScore(effectiveGross, profile.budgetMax);
  const [ls, lr] = locationScore(listing.lat, listing.lng, listing.city, profile.cities, profile.radiusKm);
  const [rs, rr] = roomsScore(listing.numberOfRooms, profile.roomsMin);
  const [ds, dr] = dateScore(listing.movingDate, profile.moveInFrom, profile.moveInFlexible);

  const l1 = PRICE_W * ps + LOCATION_W * ls + ROOMS_W * rs + DATE_W * ds;
  const [l2, l2Reasons] = layer2Score(profile, listing.attributes);
  const final = L1_WEIGHT * l1 + L2_WEIGHT * l2;

  if (final < MATCH_SCORE_THRESHOLD) return null;

  return {
    score: Math.round(final * 10000) / 10000,
    scoreBreakdown: {
      l1: Math.round(l1 * 10000) / 10000,
      l2: Math.round(l2 * 10000) / 10000,
      price: Math.round(ps * 10000) / 10000,
      location: Math.round(ls * 10000) / 10000,
      rooms: Math.round(rs * 10000) / 10000,
      date: Math.round(ds * 10000) / 10000,
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
