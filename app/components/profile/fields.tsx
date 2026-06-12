"use client";

import { useId } from "react";

/* ---------------------------------------------------------------------------
 * Shared profile fields
 *
 * Onboarding and Settings collect the same housing preferences but in very
 * different shells (a wizard with an AI-parse + preview step vs. a tabbed
 * editor). To stop the two from drifting, the actual preference *fields* live
 * here as two presentational groups — SearchCriteriaFields and
 * LivingPreferenceFields — driven by a normalized value object and a partial
 * "patch" callback. Each page owns its own layout/flow and just renders these.
 * ------------------------------------------------------------------------- */

export const CITY_OPTIONS = [
  "Zürich", "Lausanne", "Genève", "Basel", "Bern", "Winterthur",
  "Luzern", "St. Gallen", "Lugano", "Fribourg", "Neuchâtel",
];
export const LANGUAGE_OPTIONS = ["DE", "FR", "EN", "IT"];
export const VIBE_OPTIONS = ["quiet", "social", "mixed"] as const;
export const GENDER_PREF_OPTIONS = ["any", "female_only", "male_only"] as const;
export const LOCALE_OPTIONS = [
  { value: "de", label: "Deutsch" },
  { value: "fr", label: "Français" },
  { value: "en", label: "English" },
  { value: "it", label: "Italiano" },
];
export const MESSAGE_LANG_OPTIONS = [
  { value: "english", label: "Always in English" },
  { value: "my_language", label: "My language (if it matches the listing)" },
  { value: "description", label: "Language of the listing description" },
] as const;

/** The preference fields shared by onboarding and settings. Both pages' state
 * objects are supersets of this, so they can be passed straight through. */
export interface ProfileFieldsValue {
  budget_max: string;
  rooms_min: string;
  cities: string[];
  radius_km: string;
  move_in_from: string;
  move_in_flexible: boolean;
  furnished_pref: boolean | null;
  max_flatmates: string;
  languages: string[];
  vibe: string;
  pets_ok: boolean | null;
  smoking_ok: boolean | null;
  gender_pref: string;
}

/* --- Primitives (exported so pages can reuse them for their own fields) --- */

export function Field({
  label,
  htmlFor,
  required,
  hint,
  children,
}: {
  label: string;
  htmlFor?: string;
  required?: boolean;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label
        htmlFor={htmlFor}
        className="mb-1.5 block text-sm font-medium text-gray-600"
      >
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
      {hint && <p className="mt-1 text-xs text-gray-500">{hint}</p>}
    </div>
  );
}

/** Like Field, but for a cluster of controls (chips/toggles) that has no single
 * focusable target — exposes the label to assistive tech via a labelled group. */
export function FieldGroup({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  const labelId = useId();
  return (
    <div>
      <span
        id={labelId}
        className="mb-1.5 block text-sm font-medium text-gray-600"
      >
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </span>
      <div role="group" aria-labelledby={labelId}>
        {children}
      </div>
    </div>
  );
}

export function Chip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-lg border px-3 py-1.5 text-sm font-medium transition-all ${
        active
          ? "border-brand-500 bg-brand-50 text-brand-700 shadow-sm"
          : "border-gray-200 text-gray-600 hover:border-gray-300 hover:bg-gray-50"
      }`}
    >
      {label}
    </button>
  );
}

export function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
        checked ? "bg-brand-600" : "bg-gray-300"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}

export function TriToggle({
  value,
  onChange,
}: {
  value: boolean | null;
  onChange: (v: boolean | null) => void;
}) {
  const options: Array<{ val: boolean | null; label: string }> = [
    { val: null, label: "Any" },
    { val: true, label: "Yes" },
    { val: false, label: "No" },
  ];
  return (
    <div className="flex gap-1.5">
      {options.map((opt) => (
        <Chip
          key={opt.label}
          label={opt.label}
          active={value === opt.val}
          onClick={() => onChange(opt.val)}
        />
      ))}
    </div>
  );
}

/* --- Field groups --- */

export function SearchCriteriaFields({
  value,
  onChange,
  requiredHints,
  otherCity,
  onOtherCityChange,
}: {
  value: ProfileFieldsValue;
  onChange: (patch: Partial<ProfileFieldsValue>) => void;
  /** Show "*" on the fields onboarding treats as required. */
  requiredHints?: boolean;
  /** Optional free-text "other city" input (onboarding only). */
  otherCity?: string;
  onOtherCityChange?: (v: string) => void;
}) {
  const toggleCity = (city: string) =>
    onChange({
      cities: value.cities.includes(city)
        ? value.cities.filter((c) => c !== city)
        : [...value.cities, city],
    });

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <Field label="Budget (max CHF/mo)" htmlFor="pf-budget" required={requiredHints}>
          <input
            id="pf-budget"
            type="number"
            min={0}
            className="input"
            placeholder="e.g. 1500"
            value={value.budget_max}
            onChange={(e) => onChange({ budget_max: e.target.value })}
          />
        </Field>
        <Field label="Min rooms" htmlFor="pf-rooms">
          <input
            id="pf-rooms"
            type="number"
            min={1}
            max={10}
            step={0.5}
            className="input"
            placeholder="e.g. 2.5"
            value={value.rooms_min}
            onChange={(e) => onChange({ rooms_min: e.target.value })}
          />
        </Field>
      </div>

      <FieldGroup label="Cities" required={requiredHints}>
        <div className="flex flex-wrap gap-2">
          {CITY_OPTIONS.map((c) => (
            <Chip
              key={c}
              label={c}
              active={value.cities.includes(c)}
              onClick={() => toggleCity(c)}
            />
          ))}
        </div>
        {onOtherCityChange && (
          <input
            type="text"
            className="input mt-2"
            placeholder="Other city…"
            value={otherCity ?? ""}
            onChange={(e) => onOtherCityChange(e.target.value)}
          />
        )}
      </FieldGroup>

      <Field label="Radius (km)" htmlFor="pf-radius">
        <div className="flex items-center gap-3">
          <input
            id="pf-radius"
            type="range"
            min={1}
            max={50}
            className="flex-1 accent-brand-600"
            value={value.radius_km}
            onChange={(e) => onChange({ radius_km: e.target.value })}
          />
          <span className="text-sm font-medium text-gray-700 bg-gray-100 rounded-md px-2.5 py-1 min-w-[3.5rem] text-center">
            {value.radius_km} km
          </span>
        </div>
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Move-in from" htmlFor="pf-movein" required={requiredHints}>
          <input
            id="pf-movein"
            type="date"
            className="input"
            value={value.move_in_from}
            onChange={(e) => onChange({ move_in_from: e.target.value })}
          />
        </Field>
        <FieldGroup label="Flexible on date?">
          <div className="pt-1.5">
            <Toggle
              checked={value.move_in_flexible}
              onChange={(v) => onChange({ move_in_flexible: v })}
            />
          </div>
        </FieldGroup>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <FieldGroup label="Furnished?">
          <TriToggle
            value={value.furnished_pref}
            onChange={(v) => onChange({ furnished_pref: v })}
          />
        </FieldGroup>
        <Field label="Max flatmates" htmlFor="pf-flatmates">
          <input
            id="pf-flatmates"
            type="number"
            min={0}
            className="input"
            placeholder="0 = solo"
            value={value.max_flatmates}
            onChange={(e) => onChange({ max_flatmates: e.target.value })}
          />
        </Field>
      </div>
    </div>
  );
}

export function LivingPreferenceFields({
  value,
  onChange,
}: {
  value: ProfileFieldsValue;
  onChange: (patch: Partial<ProfileFieldsValue>) => void;
}) {
  const toggleLanguage = (lang: string) =>
    onChange({
      languages: value.languages.includes(lang)
        ? value.languages.filter((l) => l !== lang)
        : [...value.languages, lang],
    });

  return (
    <div className="space-y-4">
      <FieldGroup label="Languages">
        <div className="flex flex-wrap gap-2">
          {LANGUAGE_OPTIONS.map((l) => (
            <Chip
              key={l}
              label={l}
              active={value.languages.includes(l)}
              onClick={() => toggleLanguage(l)}
            />
          ))}
        </div>
      </FieldGroup>

      <FieldGroup label="Vibe">
        <div className="flex flex-wrap gap-2">
          {VIBE_OPTIONS.map((v) => (
            <Chip
              key={v}
              label={v.charAt(0).toUpperCase() + v.slice(1)}
              active={value.vibe === v}
              onClick={() => onChange({ vibe: value.vibe === v ? "" : v })}
            />
          ))}
        </div>
      </FieldGroup>

      <div className="grid grid-cols-3 gap-4">
        <FieldGroup label="Pets OK?">
          <TriToggle
            value={value.pets_ok}
            onChange={(v) => onChange({ pets_ok: v })}
          />
        </FieldGroup>
        <FieldGroup label="Smoking OK?">
          <TriToggle
            value={value.smoking_ok}
            onChange={(v) => onChange({ smoking_ok: v })}
          />
        </FieldGroup>
        <FieldGroup label="Gender pref.">
          <div className="flex flex-wrap gap-1.5">
            {GENDER_PREF_OPTIONS.map((g) => (
              <Chip
                key={g}
                label={g === "any" ? "Any" : g === "female_only" ? "Female" : "Male"}
                active={value.gender_pref === g}
                onClick={() =>
                  onChange({ gender_pref: value.gender_pref === g ? "" : g })
                }
              />
            ))}
          </div>
        </FieldGroup>
      </div>
    </div>
  );
}
