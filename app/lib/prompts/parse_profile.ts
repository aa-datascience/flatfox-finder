export const PARSE_PROFILE_SYSTEM = `You extract structured housing preferences from a student's free-text description.
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
If information is not mentioned, use null. Do not invent values.`;

export interface ParsedPreferences {
  budget_max: number | null;
  rooms_min: number | null;
  cities: string[] | null;
  radius_km: number | null;
  move_in_from: string | null;
  move_in_flexible: boolean | null;
  furnished_pref: boolean | null;
  languages: string[] | null;
  vibe: "quiet" | "social" | "mixed" | null;
  max_flatmates: number | null;
  pets_ok: boolean | null;
  smoking_ok: boolean | null;
  gender_pref: "any" | "female_only" | "male_only" | null;
}
