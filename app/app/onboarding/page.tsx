"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import {
  Field,
  LivingPreferenceFields,
  LOCALE_OPTIONS,
  SearchCriteriaFields,
  type ProfileFieldsValue,
} from "@/components/profile/fields";

interface FormData extends ProfileFieldsValue {
  name: string;
  study_program: string;
  locale: string;
  other_city: string;
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

  // Merge a partial update from the shared field groups into form state.
  const patchForm = (patch: Partial<ProfileFieldsValue>) =>
    setForm((prev) => ({ ...prev, ...patch }));

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
          <button onClick={() => setStep("form")} className="btn-secondary">
            Back to edit
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="btn-primary"
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
        <Field label="Name" htmlFor="ob-name" required>
          <input
            id="ob-name"
            type="text"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            className="input"
            placeholder="Your full name"
          />
        </Field>

        {/* Study program */}
        <Field label="Study program" htmlFor="ob-study" required>
          <input
            id="ob-study"
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
        <Field label="Preferred language" htmlFor="ob-locale" required>
          <select
            id="ob-locale"
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

        <SearchCriteriaFields
          value={form}
          onChange={patchForm}
          requiredHints
          otherCity={form.other_city}
          onOtherCityChange={(v) =>
            setForm((prev) => ({ ...prev, other_city: v }))
          }
        />

        <LivingPreferenceFields value={form} onChange={patchForm} />

        {/* Free text */}
        <Field
          label="Tell us anything else (optional)"
          htmlFor="ob-about"
          hint="AI will extract preferences from your text to fill any empty fields above."
        >
          <textarea
            id="ob-about"
            value={form.raw_text}
            onChange={(e) => setForm({ ...form, raw_text: e.target.value })}
            className="input min-h-[100px]"
            placeholder="e.g. I'm looking for a quiet WG near ETH, ideally under 1200 CHF, moving in September…"
          />
        </Field>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          onClick={handlePreview}
          disabled={parsing}
          className="btn-primary w-full py-2.5"
        >
          {parsing ? "Analyzing your text…" : "Preview profile"}
        </button>
      </div>
    </main>
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
