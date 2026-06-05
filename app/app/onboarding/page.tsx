"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

const CITY_OPTIONS = [
  "Zürich",
  "Lausanne",
  "Genève",
  "Basel",
  "Bern",
  "Winterthur",
  "Luzern",
  "St. Gallen",
  "Lugano",
  "Fribourg",
  "Neuchâtel",
];
const LANGUAGE_OPTIONS = ["DE", "FR", "EN", "IT"];
const VIBE_OPTIONS = ["quiet", "social", "mixed"] as const;
const GENDER_PREF_OPTIONS = ["any", "female_only", "male_only"] as const;
const LOCALE_OPTIONS = [
  { value: "de", label: "Deutsch" },
  { value: "fr", label: "Français" },
  { value: "en", label: "English" },
  { value: "it", label: "Italiano" },
];

interface FormData {
  name: string;
  study_program: string;
  locale: string;
  budget_max: string;
  cities: string[];
  other_city: string;
  radius_km: string;
  rooms_min: string;
  move_in_from: string;
  move_in_flexible: boolean;
  furnished_pref: boolean | null;
  max_flatmates: string;
  languages: string[];
  vibe: string;
  pets_ok: boolean | null;
  smoking_ok: boolean | null;
  gender_pref: string;
  raw_text: string;
}

interface MergedProfile {
  name: string;
  study_program: string;
  locale: string;
  budget_max: number | null;
  cities: string[];
  radius_km: number;
  rooms_min: number | null;
  move_in_from: string | null;
  move_in_flexible: boolean;
  furnished_pref: boolean | null;
  max_flatmates: number | null;
  languages: string[];
  vibe: string | null;
  pets_ok: boolean | null;
  smoking_ok: boolean | null;
  gender_pref: string | null;
  raw_text: string;
  input_mode: string;
}

const INITIAL_FORM: FormData = {
  name: "",
  study_program: "",
  locale: "en",
  budget_max: "",
  cities: [],
  other_city: "",
  radius_km: "10",
  rooms_min: "",
  move_in_from: "",
  move_in_flexible: true,
  furnished_pref: null,
  max_flatmates: "",
  languages: [],
  vibe: "",
  pets_ok: null,
  smoking_ok: null,
  gender_pref: "",
  raw_text: "",
};

type Step = "form" | "preview";

export default function OnboardingPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [form, setForm] = useState<FormData>(INITIAL_FORM);
  const [step, setStep] = useState<Step>("form");
  const [merged, setMerged] = useState<MergedProfile | null>(null);
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/login");
    }
  }, [status, router]);

  useEffect(() => {
    if (session?.user) {
      setForm((prev) => ({
        ...prev,
        name: session.user.name || "",
        locale: session.user.locale || "en",
      }));
    }
  }, [session]);

  const toggleArrayField = (
    field: "cities" | "languages",
    value: string
  ) => {
    setForm((prev) => ({
      ...prev,
      [field]: prev[field].includes(value)
        ? prev[field].filter((v) => v !== value)
        : [...prev[field], value],
    }));
  };

  const buildMergedProfile = useCallback(
    async (formData: FormData): Promise<MergedProfile> => {
      const cities = [...formData.cities];
      if (formData.other_city.trim()) {
        cities.push(formData.other_city.trim());
      }

      const base: MergedProfile = {
        name: formData.name,
        study_program: formData.study_program,
        locale: formData.locale,
        budget_max: formData.budget_max ? Number(formData.budget_max) : null,
        cities,
        radius_km: Number(formData.radius_km) || 10,
        rooms_min: formData.rooms_min ? Number(formData.rooms_min) : null,
        move_in_from: formData.move_in_from || null,
        move_in_flexible: formData.move_in_flexible,
        furnished_pref: formData.furnished_pref,
        max_flatmates: formData.max_flatmates
          ? Number(formData.max_flatmates)
          : null,
        languages: formData.languages,
        vibe: formData.vibe || null,
        pets_ok: formData.pets_ok,
        smoking_ok: formData.smoking_ok,
        gender_pref: formData.gender_pref || null,
        raw_text: formData.raw_text,
        input_mode: formData.raw_text.trim() ? "hybrid" : "form",
      };

      if (!formData.raw_text.trim()) return base;

      setParsing(true);
      try {
        const res = await fetch("/api/profile/parse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ raw_text: formData.raw_text }),
        });
        if (!res.ok) throw new Error("Parse failed");
        const { parsed_prefs } = await res.json();

        if (parsed_prefs.budget_max != null && base.budget_max == null)
          base.budget_max = parsed_prefs.budget_max;
        if (parsed_prefs.rooms_min != null && base.rooms_min == null)
          base.rooms_min = parsed_prefs.rooms_min;
        if (
          parsed_prefs.cities?.length &&
          base.cities.length === 0
        )
          base.cities = parsed_prefs.cities;
        if (parsed_prefs.radius_km != null && formData.radius_km === "10")
          base.radius_km = parsed_prefs.radius_km;
        if (parsed_prefs.move_in_from && !base.move_in_from)
          base.move_in_from = parsed_prefs.move_in_from;
        if (parsed_prefs.move_in_flexible != null && formData.move_in_flexible)
          base.move_in_flexible = parsed_prefs.move_in_flexible;
        if (parsed_prefs.furnished_pref != null && base.furnished_pref == null)
          base.furnished_pref = parsed_prefs.furnished_pref;
        if (parsed_prefs.max_flatmates != null && base.max_flatmates == null)
          base.max_flatmates = parsed_prefs.max_flatmates;
        if (parsed_prefs.languages?.length && base.languages.length === 0)
          base.languages = parsed_prefs.languages;
        if (parsed_prefs.vibe && !base.vibe) base.vibe = parsed_prefs.vibe;
        if (parsed_prefs.pets_ok != null && base.pets_ok == null)
          base.pets_ok = parsed_prefs.pets_ok;
        if (parsed_prefs.smoking_ok != null && base.smoking_ok == null)
          base.smoking_ok = parsed_prefs.smoking_ok;
        if (parsed_prefs.gender_pref && !base.gender_pref)
          base.gender_pref = parsed_prefs.gender_pref;
      } catch {
        setError(
          "Couldn't parse your free text — your form answers will be used."
        );
      } finally {
        setParsing(false);
      }

      return base;
    },
    []
  );

  const handlePreview = async () => {
    setError(null);
    if (!form.name.trim() || !form.study_program.trim()) {
      setError("Name and study program are required.");
      return;
    }
    if (!form.budget_max && !form.raw_text.trim()) {
      setError("Please enter a budget or describe your preferences.");
      return;
    }
    if (form.cities.length === 0 && !form.other_city.trim() && !form.raw_text.trim()) {
      setError("Please select at least one city or describe your preferences.");
      return;
    }
    if (!form.move_in_from && !form.raw_text.trim()) {
      setError("Please enter a move-in date or describe your preferences.");
      return;
    }

    const profile = await buildMergedProfile(form);
    setMerged(profile);
    setStep("preview");
  };

  const handleSave = async () => {
    if (!merged) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(merged),
      });
      if (!res.ok) throw new Error("Save failed");
      router.push("/dashboard");
    } catch {
      setError("Failed to save profile. Please try again.");
      setSaving(false);
    }
  };

  if (status === "loading") {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">Loading…</p>
      </div>
    );
  }

  if (step === "preview" && merged) {
    return (
      <main className="mx-auto max-w-2xl px-4 py-12">
        <h1 className="text-2xl font-bold mb-6">Review your profile</h1>
        <p className="text-gray-600 mb-6">
          Check that everything looks right before saving.
        </p>

        <div className="rounded-lg border border-gray-200 bg-white p-6 space-y-4">
          <PreviewRow label="Name" value={merged.name} />
          <PreviewRow label="Study program" value={merged.study_program} />
          <PreviewRow
            label="Language"
            value={
              LOCALE_OPTIONS.find((l) => l.value === merged.locale)?.label ??
              merged.locale
            }
          />
          <PreviewRow
            label="Budget"
            value={
              merged.budget_max != null
                ? `CHF ${merged.budget_max}/mo`
                : "Not set"
            }
          />
          <PreviewRow
            label="Cities"
            value={merged.cities.length > 0 ? merged.cities.join(", ") : "Not set"}
          />
          <PreviewRow label="Radius" value={`${merged.radius_km} km`} />
          <PreviewRow
            label="Min rooms"
            value={merged.rooms_min?.toString() ?? "Not set"}
          />
          <PreviewRow label="Move-in from" value={merged.move_in_from ?? "Not set"} />
          <PreviewRow
            label="Flexible on date"
            value={merged.move_in_flexible ? "Yes" : "No"}
          />
          <PreviewRow
            label="Furnished"
            value={
              merged.furnished_pref == null
                ? "No preference"
                : merged.furnished_pref
                  ? "Yes"
                  : "No"
            }
          />
          <PreviewRow
            label="Max flatmates"
            value={merged.max_flatmates?.toString() ?? "No preference"}
          />
          <PreviewRow
            label="Languages"
            value={
              merged.languages.length > 0 ? merged.languages.join(", ") : "Not set"
            }
          />
          <PreviewRow label="Vibe" value={merged.vibe ?? "No preference"} />
          <PreviewRow
            label="Pets OK"
            value={
              merged.pets_ok == null
                ? "No preference"
                : merged.pets_ok
                  ? "Yes"
                  : "No"
            }
          />
          <PreviewRow
            label="Smoking OK"
            value={
              merged.smoking_ok == null
                ? "No preference"
                : merged.smoking_ok
                  ? "Yes"
                  : "No"
            }
          />
          <PreviewRow
            label="Gender preference"
            value={merged.gender_pref ?? "Any"}
          />
        </div>

        {error && (
          <p className="mt-4 text-sm text-red-600">{error}</p>
        )}

        <div className="mt-6 flex gap-3">
          <button
            onClick={() => setStep("form")}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            Back to edit
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save & continue"}
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-12">
      <h1 className="text-2xl font-bold mb-2">Set up your profile</h1>
      <p className="text-gray-600 mb-8">
        Tell us what you&apos;re looking for so we can find the best matches.
      </p>

      <div className="space-y-6">
        {/* Name */}
        <Field label="Name" required>
          <input
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="input"
            placeholder="Your full name"
          />
        </Field>

        {/* Study program */}
        <Field label="Study program" required>
          <input
            type="text"
            value={form.study_program}
            onChange={(e) =>
              setForm({ ...form, study_program: e.target.value })
            }
            className="input"
            placeholder="e.g. MSc Computer Science, ETH"
          />
        </Field>

        {/* Preferred language */}
        <Field label="Preferred language" required>
          <select
            value={form.locale}
            onChange={(e) => setForm({ ...form, locale: e.target.value })}
            className="input"
          >
            {LOCALE_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </Field>

        {/* Budget */}
        <Field label="Budget (max CHF/mo)" required>
          <input
            type="number"
            value={form.budget_max}
            onChange={(e) => setForm({ ...form, budget_max: e.target.value })}
            className="input"
            placeholder="e.g. 1500"
            min={0}
          />
        </Field>

        {/* Cities */}
        <Field label="City / cities" required>
          <div className="flex flex-wrap gap-2">
            {CITY_OPTIONS.map((city) => (
              <button
                key={city}
                type="button"
                onClick={() => toggleArrayField("cities", city)}
                className={`rounded-full border px-3 py-1 text-sm ${
                  form.cities.includes(city)
                    ? "border-blue-600 bg-blue-50 text-blue-700"
                    : "border-gray-300 text-gray-700 hover:bg-gray-50"
                }`}
              >
                {city}
              </button>
            ))}
          </div>
          <input
            type="text"
            value={form.other_city}
            onChange={(e) => setForm({ ...form, other_city: e.target.value })}
            className="input mt-2"
            placeholder="Other city…"
          />
        </Field>

        {/* Radius */}
        <Field label="Radius (km)">
          <input
            type="range"
            min={1}
            max={50}
            value={form.radius_km}
            onChange={(e) => setForm({ ...form, radius_km: e.target.value })}
            className="w-full"
          />
          <span className="text-sm text-gray-500">{form.radius_km} km</span>
        </Field>

        {/* Rooms min */}
        <Field label="Minimum rooms">
          <input
            type="number"
            value={form.rooms_min}
            onChange={(e) => setForm({ ...form, rooms_min: e.target.value })}
            className="input"
            placeholder="e.g. 2.5"
            min={1}
            max={10}
            step={0.5}
          />
        </Field>

        {/* Move-in date */}
        <Field label="Move-in from" required>
          <input
            type="date"
            value={form.move_in_from}
            onChange={(e) =>
              setForm({ ...form, move_in_from: e.target.value })
            }
            className="input"
          />
        </Field>

        {/* Flexible on date */}
        <Field label="Flexible on date?">
          <Toggle
            checked={form.move_in_flexible}
            onChange={(v) => setForm({ ...form, move_in_flexible: v })}
          />
        </Field>

        {/* Furnished */}
        <Field label="Furnished?">
          <TriToggle
            value={form.furnished_pref}
            onChange={(v) => setForm({ ...form, furnished_pref: v })}
            labels={["No preference", "Yes", "No"]}
          />
        </Field>

        {/* Max flatmates */}
        <Field label="Max flatmates">
          <input
            type="number"
            value={form.max_flatmates}
            onChange={(e) =>
              setForm({ ...form, max_flatmates: e.target.value })
            }
            className="input"
            placeholder="0 = solo"
            min={0}
            max={20}
          />
        </Field>

        {/* Languages */}
        <Field label="Languages">
          <div className="flex flex-wrap gap-2">
            {LANGUAGE_OPTIONS.map((lang) => (
              <button
                key={lang}
                type="button"
                onClick={() => toggleArrayField("languages", lang)}
                className={`rounded-full border px-3 py-1 text-sm ${
                  form.languages.includes(lang)
                    ? "border-blue-600 bg-blue-50 text-blue-700"
                    : "border-gray-300 text-gray-700 hover:bg-gray-50"
                }`}
              >
                {lang}
              </button>
            ))}
          </div>
        </Field>

        {/* Vibe */}
        <Field label="Vibe">
          <div className="flex gap-2">
            {VIBE_OPTIONS.map((v) => (
              <button
                key={v}
                type="button"
                onClick={() =>
                  setForm({ ...form, vibe: form.vibe === v ? "" : v })
                }
                className={`rounded-full border px-3 py-1 text-sm capitalize ${
                  form.vibe === v
                    ? "border-blue-600 bg-blue-50 text-blue-700"
                    : "border-gray-300 text-gray-700 hover:bg-gray-50"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
        </Field>

        {/* Pets OK */}
        <Field label="Pets OK?">
          <TriToggle
            value={form.pets_ok}
            onChange={(v) => setForm({ ...form, pets_ok: v })}
            labels={["No preference", "Yes", "No"]}
          />
        </Field>

        {/* Smoking OK */}
        <Field label="Smoking OK?">
          <TriToggle
            value={form.smoking_ok}
            onChange={(v) => setForm({ ...form, smoking_ok: v })}
            labels={["No preference", "Yes", "No"]}
          />
        </Field>

        {/* Gender preference */}
        <Field label="Gender preference">
          <div className="flex gap-2">
            {GENDER_PREF_OPTIONS.map((g) => (
              <button
                key={g}
                type="button"
                onClick={() =>
                  setForm({
                    ...form,
                    gender_pref: form.gender_pref === g ? "" : g,
                  })
                }
                className={`rounded-full border px-3 py-1 text-sm ${
                  form.gender_pref === g
                    ? "border-blue-600 bg-blue-50 text-blue-700"
                    : "border-gray-300 text-gray-700 hover:bg-gray-50"
                }`}
              >
                {g === "any"
                  ? "Any"
                  : g === "female_only"
                    ? "Female only"
                    : "Male only"}
              </button>
            ))}
          </div>
        </Field>

        {/* Free text */}
        <Field label="Tell us anything else (optional)">
          <textarea
            value={form.raw_text}
            onChange={(e) => setForm({ ...form, raw_text: e.target.value })}
            className="input min-h-[100px]"
            placeholder="e.g. I'm looking for a quiet WG near ETH, ideally under 1200 CHF, moving in September…"
          />
          <p className="mt-1 text-xs text-gray-500">
            AI will extract preferences from your text to fill any empty fields
            above.
          </p>
        </Field>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          onClick={handlePreview}
          disabled={parsing}
          className="w-full rounded-md bg-blue-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {parsing ? "Analyzing your text…" : "Preview profile"}
        </button>
      </div>
    </main>
  );
}

function Field({
  label,
  required,
  children,
}: {
  label: string;
  required?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-gray-700">
        {label}
        {required && <span className="text-red-500 ml-0.5">*</span>}
      </label>
      {children}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
        checked ? "bg-blue-600" : "bg-gray-300"
      }`}
    >
      <span
        className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
          checked ? "translate-x-6" : "translate-x-1"
        }`}
      />
    </button>
  );
}

function TriToggle({
  value,
  onChange,
  labels,
}: {
  value: boolean | null;
  onChange: (v: boolean | null) => void;
  labels: [string, string, string];
}) {
  const options: Array<{ val: boolean | null; label: string }> = [
    { val: null, label: labels[0] },
    { val: true, label: labels[1] },
    { val: false, label: labels[2] },
  ];
  return (
    <div className="flex gap-2">
      {options.map((opt) => (
        <button
          key={opt.label}
          type="button"
          onClick={() => onChange(opt.val)}
          className={`rounded-full border px-3 py-1 text-sm ${
            value === opt.val
              ? "border-blue-600 bg-blue-50 text-blue-700"
              : "border-gray-300 text-gray-700 hover:bg-gray-50"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between border-b border-gray-100 pb-2">
      <span className="text-sm text-gray-500">{label}</span>
      <span className="text-sm font-medium text-gray-900">{value}</span>
    </div>
  );
}
