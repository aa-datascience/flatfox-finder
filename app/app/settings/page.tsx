"use client";

import { signOut, useSession } from "next-auth/react";
import Link from "next/link";
import { useEffect, useState } from "react";

const CITY_OPTIONS = [
  "Zürich", "Lausanne", "Genève", "Basel", "Bern", "Winterthur",
  "Luzern", "St. Gallen", "Lugano", "Fribourg", "Neuchâtel",
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

interface ProfileData {
  study_program: string;
  budget_max: string;
  cities: string[];
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
}

const EMPTY_PROFILE: ProfileData = {
  study_program: "",
  budget_max: "",
  cities: [],
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
};

type Section = "profile" | "password" | "delete";

export default function SettingsPage() {
  const { data: session } = useSession();
  const [section, setSection] = useState<Section>("profile");
  const [name, setName] = useState("");
  const [locale, setLocale] = useState("en");
  const [profile, setProfile] = useState<ProfileData>(EMPTY_PROFILE);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileMsg, setProfileMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const [oldPassword, setOldPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [pwSaving, setPwSaving] = useState(false);
  const [pwMsg, setPwMsg] = useState<{ type: "ok" | "err"; text: string } | null>(null);

  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (session?.user) {
      setName(session.user.name || "");
      setLocale(session.user.locale || "en");
    }
  }, [session]);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/profile");
        if (!res.ok) return;
        const { profile: p } = await res.json();
        if (!p) return;
        setProfile({
          study_program: p.studyProgram ?? "",
          budget_max: p.budgetMax?.toString() ?? "",
          cities: p.cities ?? [],
          radius_km: p.radiusKm?.toString() ?? "10",
          rooms_min: p.roomsMin?.toString() ?? "",
          move_in_from: p.moveInFrom ? p.moveInFrom.split("T")[0] : "",
          move_in_flexible: p.moveInFlexible ?? true,
          furnished_pref: p.furnishedPref ?? null,
          max_flatmates: p.maxFlatmates?.toString() ?? "",
          languages: p.languages ?? [],
          vibe: p.vibe ?? "",
          pets_ok: p.petsOk ?? null,
          smoking_ok: p.smokingOk ?? null,
          gender_pref: p.genderPref ?? "",
        });
      } finally {
        setProfileLoading(false);
      }
    }
    load();
  }, []);

  const toggleArray = (field: "cities" | "languages", value: string) => {
    setProfile((prev) => ({
      ...prev,
      [field]: prev[field].includes(value)
        ? prev[field].filter((v) => v !== value)
        : [...prev[field], value],
    }));
  };

  const handleSaveProfile = async () => {
    setProfileSaving(true);
    setProfileMsg(null);
    try {
      const res = await fetch("/api/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          locale,
          study_program: profile.study_program,
          budget_max: profile.budget_max ? Number(profile.budget_max) : null,
          cities: profile.cities,
          radius_km: Number(profile.radius_km) || 10,
          rooms_min: profile.rooms_min ? Number(profile.rooms_min) : null,
          move_in_from: profile.move_in_from || null,
          move_in_flexible: profile.move_in_flexible,
          furnished_pref: profile.furnished_pref,
          max_flatmates: profile.max_flatmates ? Number(profile.max_flatmates) : null,
          languages: profile.languages,
          vibe: profile.vibe || null,
          pets_ok: profile.pets_ok,
          smoking_ok: profile.smoking_ok,
          gender_pref: profile.gender_pref || null,
          input_mode: "form",
        }),
      });
      if (!res.ok) throw new Error();
      setProfileMsg({ type: "ok", text: "Profile saved." });
    } catch {
      setProfileMsg({ type: "err", text: "Failed to save." });
    } finally {
      setProfileSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPwSaving(true);
    setPwMsg(null);
    try {
      const res = await fetch("/api/settings/password", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ old_password: oldPassword, new_password: newPassword }),
      });
      if (!res.ok) {
        const data = await res.json();
        setPwMsg({ type: "err", text: data.error ?? "Failed." });
        return;
      }
      setPwMsg({ type: "ok", text: "Password changed." });
      setOldPassword("");
      setNewPassword("");
    } catch {
      setPwMsg({ type: "err", text: "Something went wrong." });
    } finally {
      setPwSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    try {
      const res = await fetch("/api/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirm: true }),
      });
      if (!res.ok) throw new Error();
      await signOut({ callbackUrl: "/" });
    } catch {
      setDeleting(false);
    }
  };

  return (
    <main className="mx-auto max-w-2xl px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold">Settings</h1>
        <Link href="/dashboard" className="text-sm text-gray-500 hover:text-gray-700">
          Back to dashboard
        </Link>
      </div>

      {/* Section tabs */}
      <div className="flex gap-1 mb-6 border-b border-gray-200">
        {([
          ["profile", "Profile"],
          ["password", "Password"],
          ["delete", "Account"],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setSection(key)}
            className={`px-4 py-2 text-sm font-medium border-b-2 -mb-px ${
              section === key
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Profile section */}
      {section === "profile" && (
        <div className="space-y-5">
          {profileLoading ? (
            <p className="text-gray-500">Loading…</p>
          ) : (
            <>
              <Field label="Name">
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="input"
                />
              </Field>

              <Field label="Preferred language">
                <select value={locale} onChange={(e) => setLocale(e.target.value)} className="input">
                  {LOCALE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
              </Field>

              <Field label="Study program">
                <input
                  type="text"
                  value={profile.study_program}
                  onChange={(e) => setProfile({ ...profile, study_program: e.target.value })}
                  className="input"
                />
              </Field>

              <Field label="Budget (max CHF/mo)">
                <input
                  type="number"
                  value={profile.budget_max}
                  onChange={(e) => setProfile({ ...profile, budget_max: e.target.value })}
                  className="input"
                  min={0}
                />
              </Field>

              <Field label="Cities">
                <div className="flex flex-wrap gap-2">
                  {CITY_OPTIONS.map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => toggleArray("cities", c)}
                      className={`rounded-full border px-3 py-1 text-sm ${
                        profile.cities.includes(c)
                          ? "border-blue-600 bg-blue-50 text-blue-700"
                          : "border-gray-300 text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      {c}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="Radius (km)">
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={1}
                    max={50}
                    value={profile.radius_km}
                    onChange={(e) => setProfile({ ...profile, radius_km: e.target.value })}
                    className="flex-1"
                  />
                  <span className="text-sm text-gray-500 w-12">{profile.radius_km} km</span>
                </div>
              </Field>

              <Field label="Min rooms">
                <input
                  type="number"
                  value={profile.rooms_min}
                  onChange={(e) => setProfile({ ...profile, rooms_min: e.target.value })}
                  className="input"
                  min={1}
                  max={10}
                  step={0.5}
                />
              </Field>

              <Field label="Move-in from">
                <input
                  type="date"
                  value={profile.move_in_from}
                  onChange={(e) => setProfile({ ...profile, move_in_from: e.target.value })}
                  className="input"
                />
              </Field>

              <Field label="Flexible on date?">
                <Toggle
                  checked={profile.move_in_flexible}
                  onChange={(v) => setProfile({ ...profile, move_in_flexible: v })}
                />
              </Field>

              <Field label="Furnished?">
                <TriToggle
                  value={profile.furnished_pref}
                  onChange={(v) => setProfile({ ...profile, furnished_pref: v })}
                />
              </Field>

              <Field label="Max flatmates">
                <input
                  type="number"
                  value={profile.max_flatmates}
                  onChange={(e) => setProfile({ ...profile, max_flatmates: e.target.value })}
                  className="input"
                  min={0}
                />
              </Field>

              <Field label="Languages">
                <div className="flex flex-wrap gap-2">
                  {LANGUAGE_OPTIONS.map((l) => (
                    <button
                      key={l}
                      type="button"
                      onClick={() => toggleArray("languages", l)}
                      className={`rounded-full border px-3 py-1 text-sm ${
                        profile.languages.includes(l)
                          ? "border-blue-600 bg-blue-50 text-blue-700"
                          : "border-gray-300 text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      {l}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="Vibe">
                <div className="flex gap-2">
                  {VIBE_OPTIONS.map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setProfile({ ...profile, vibe: profile.vibe === v ? "" : v })}
                      className={`rounded-full border px-3 py-1 text-sm capitalize ${
                        profile.vibe === v
                          ? "border-blue-600 bg-blue-50 text-blue-700"
                          : "border-gray-300 text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      {v}
                    </button>
                  ))}
                </div>
              </Field>

              <Field label="Pets OK?">
                <TriToggle
                  value={profile.pets_ok}
                  onChange={(v) => setProfile({ ...profile, pets_ok: v })}
                />
              </Field>

              <Field label="Smoking OK?">
                <TriToggle
                  value={profile.smoking_ok}
                  onChange={(v) => setProfile({ ...profile, smoking_ok: v })}
                />
              </Field>

              <Field label="Gender preference">
                <div className="flex gap-2">
                  {GENDER_PREF_OPTIONS.map((g) => (
                    <button
                      key={g}
                      type="button"
                      onClick={() =>
                        setProfile({ ...profile, gender_pref: profile.gender_pref === g ? "" : g })
                      }
                      className={`rounded-full border px-3 py-1 text-sm ${
                        profile.gender_pref === g
                          ? "border-blue-600 bg-blue-50 text-blue-700"
                          : "border-gray-300 text-gray-700 hover:bg-gray-50"
                      }`}
                    >
                      {g === "any" ? "Any" : g === "female_only" ? "Female only" : "Male only"}
                    </button>
                  ))}
                </div>
              </Field>

              {profileMsg && (
                <p className={`text-sm ${profileMsg.type === "ok" ? "text-green-600" : "text-red-600"}`}>
                  {profileMsg.text}
                </p>
              )}

              <button
                onClick={handleSaveProfile}
                disabled={profileSaving}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {profileSaving ? "Saving…" : "Save profile"}
              </button>
            </>
          )}
        </div>
      )}

      {/* Password section */}
      {section === "password" && (
        <form onSubmit={handleChangePassword} className="space-y-4 max-w-sm">
          <Field label="Current password">
            <input
              type="password"
              value={oldPassword}
              onChange={(e) => setOldPassword(e.target.value)}
              className="input"
              required
            />
          </Field>
          <Field label="New password">
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              className="input"
              minLength={8}
              required
            />
          </Field>

          {pwMsg && (
            <p className={`text-sm ${pwMsg.type === "ok" ? "text-green-600" : "text-red-600"}`}>
              {pwMsg.text}
            </p>
          )}

          <button
            type="submit"
            disabled={pwSaving}
            className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
          >
            {pwSaving ? "Changing…" : "Change password"}
          </button>
        </form>
      )}

      {/* Delete account section */}
      {section === "delete" && (
        <div className="max-w-sm">
          <div className="rounded-lg border border-red-200 bg-red-50 p-6">
            <h2 className="font-medium text-red-800 mb-2">Delete account</h2>
            <p className="text-sm text-red-700 mb-4">
              This permanently deletes your account, profile, matches, and messages.
              This action cannot be undone.
            </p>

            {!deleteConfirm ? (
              <button
                onClick={() => setDeleteConfirm(true)}
                className="rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100"
              >
                I want to delete my account
              </button>
            ) : (
              <div className="space-y-3">
                <p className="text-sm font-medium text-red-800">
                  Are you sure? This cannot be undone.
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={handleDeleteAccount}
                    disabled={deleting}
                    className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    {deleting ? "Deleting…" : "Yes, delete everything"}
                  </button>
                  <button
                    onClick={() => setDeleteConfirm(false)}
                    className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="mt-6">
            <button
              onClick={() => signOut({ callbackUrl: "/" })}
              className="text-sm text-gray-500 hover:text-gray-700"
            >
              Log out
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-gray-700">{label}</label>
      {children}
    </div>
  );
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
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
}: {
  value: boolean | null;
  onChange: (v: boolean | null) => void;
}) {
  const options: Array<{ val: boolean | null; label: string }> = [
    { val: null, label: "No preference" },
    { val: true, label: "Yes" },
    { val: false, label: "No" },
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
