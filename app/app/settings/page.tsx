"use client";

import { signOut, useSession } from "next-auth/react";
import { useEffect, useState } from "react";

const CITY_OPTIONS = [
  "Zürich", "Lausanne", "Genève", "Basel", "Bern", "Winterthur",
  "Luzern", "St. Gallen", "Lugano", "Fribourg", "Neuchâtel",
];
const LANGUAGE_OPTIONS = ["DE", "FR", "EN", "IT"];
const VIBE_OPTIONS = ["quiet", "social", "mixed"] as const;
const GENDER_PREF_OPTIONS = ["any", "female_only", "male_only"] as const;
const MESSAGE_LANG_OPTIONS = [
  { value: "english", label: "Always in English" },
  { value: "my_language", label: "My language (if it matches the listing)" },
  { value: "description", label: "Language of the listing description" },
] as const;
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
  message_language: string;
  raw_text: string;
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
  message_language: "description",
  raw_text: "",
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
          message_language: p.messageLanguage ?? "description",
          raw_text: p.rawText ?? "",
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
          message_language: profile.message_language,
          raw_text: profile.raw_text || null,
          input_mode: "form",
        }),
      });
      if (!res.ok) throw new Error();
      setProfileMsg({ type: "ok", text: "Profile saved. Matches have been updated." });
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
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">Settings</h1>
        <p className="text-sm text-gray-500 mt-1">
          Manage your profile, preferences, and account.
        </p>
      </div>

      {/* Section tabs */}
      <div className="flex gap-1 mb-8">
        {([
          ["profile", "Profile"],
          ["password", "Password"],
          ["delete", "Account"],
        ] as const).map(([key, label]) => (
          <button
            key={key}
            onClick={() => setSection(key)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              section === key
                ? "bg-brand-600 text-white shadow-sm"
                : "text-gray-600 hover:bg-gray-100"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Profile section */}
      {section === "profile" && (
        <div className="space-y-6">
          {profileLoading ? (
            <div className="card p-6 text-center text-gray-500">Loading...</div>
          ) : (
            <>
              {/* Personal info card */}
              <div className="card p-6">
                <SectionTitle>Personal information</SectionTitle>
                <div className="space-y-4">
                  <Field label="Name">
                    <input
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="input"
                    />
                  </Field>

                  <div className="grid grid-cols-2 gap-4">
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
                  </div>

                  <Field label="About me">
                    <textarea
                      value={profile.raw_text}
                      onChange={(e) => setProfile({ ...profile, raw_text: e.target.value })}
                      className="input"
                      rows={3}
                      placeholder="Used to personalize your contact messages. E.g. I'm a tidy, quiet person who loves cooking..."
                    />
                    <p className="text-xs text-gray-400 mt-1">This text is included when AI drafts your messages.</p>
                  </Field>
                </div>
              </div>

              {/* Search criteria card */}
              <div className="card p-6">
                <SectionTitle>Search criteria</SectionTitle>
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Budget (max CHF/mo)">
                      <input
                        type="number"
                        value={profile.budget_max}
                        onChange={(e) => setProfile({ ...profile, budget_max: e.target.value })}
                        className="input"
                        min={0}
                      />
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
                  </div>

                  <Field label="Cities">
                    <div className="flex flex-wrap gap-2">
                      {CITY_OPTIONS.map((c) => (
                        <Chip
                          key={c}
                          label={c}
                          active={profile.cities.includes(c)}
                          onClick={() => toggleArray("cities", c)}
                        />
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
                        className="flex-1 accent-brand-600"
                      />
                      <span className="text-sm font-medium text-gray-700 bg-gray-100 rounded-md px-2.5 py-1 min-w-[3.5rem] text-center">
                        {profile.radius_km} km
                      </span>
                    </div>
                  </Field>

                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Move-in from">
                      <input
                        type="date"
                        value={profile.move_in_from}
                        onChange={(e) => setProfile({ ...profile, move_in_from: e.target.value })}
                        className="input"
                      />
                    </Field>
                    <Field label="Flexible on date?">
                      <div className="pt-1.5">
                        <Toggle
                          checked={profile.move_in_flexible}
                          onChange={(v) => setProfile({ ...profile, move_in_flexible: v })}
                        />
                      </div>
                    </Field>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
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
                  </div>
                </div>
              </div>

              {/* Preferences card */}
              <div className="card p-6">
                <SectionTitle>Living preferences</SectionTitle>
                <div className="space-y-4">
                  <Field label="Languages spoken">
                    <div className="flex flex-wrap gap-2">
                      {LANGUAGE_OPTIONS.map((l) => (
                        <Chip
                          key={l}
                          label={l}
                          active={profile.languages.includes(l)}
                          onClick={() => toggleArray("languages", l)}
                        />
                      ))}
                    </div>
                  </Field>

                  <Field label="Vibe">
                    <div className="flex gap-2">
                      {VIBE_OPTIONS.map((v) => (
                        <Chip
                          key={v}
                          label={v.charAt(0).toUpperCase() + v.slice(1)}
                          active={profile.vibe === v}
                          onClick={() => setProfile({ ...profile, vibe: profile.vibe === v ? "" : v })}
                        />
                      ))}
                    </div>
                  </Field>

                  <div className="grid grid-cols-3 gap-4">
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
                    <Field label="Gender pref.">
                      <div className="flex flex-wrap gap-1.5">
                        {GENDER_PREF_OPTIONS.map((g) => (
                          <Chip
                            key={g}
                            label={g === "any" ? "Any" : g === "female_only" ? "F" : "M"}
                            active={profile.gender_pref === g}
                            onClick={() =>
                              setProfile({ ...profile, gender_pref: profile.gender_pref === g ? "" : g })
                            }
                          />
                        ))}
                      </div>
                    </Field>
                  </div>
                </div>
              </div>

              {/* Message settings card */}
              <div className="card p-6">
                <SectionTitle>Message settings</SectionTitle>
                <Field label="Contact message language">
                  <div className="flex flex-col gap-2.5">
                    {MESSAGE_LANG_OPTIONS.map((o) => (
                      <label key={o.value} className="flex items-center gap-2.5 text-sm cursor-pointer">
                        <input
                          type="radio"
                          name="message_language"
                          value={o.value}
                          checked={profile.message_language === o.value}
                          onChange={() => setProfile({ ...profile, message_language: o.value })}
                          className="accent-brand-600"
                        />
                        <span className="text-gray-700">{o.label}</span>
                      </label>
                    ))}
                  </div>
                </Field>
              </div>

              {/* Save button */}
              <div className="flex items-center gap-4">
                <button
                  onClick={handleSaveProfile}
                  disabled={profileSaving}
                  className="btn-primary"
                >
                  {profileSaving ? "Saving..." : "Save profile"}
                </button>
                {profileMsg && (
                  <p className={`text-sm ${profileMsg.type === "ok" ? "text-green-600" : "text-red-600"}`}>
                    {profileMsg.text}
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {/* Password section */}
      {section === "password" && (
        <div className="card p-6 max-w-md">
          <SectionTitle>Change password</SectionTitle>
          <form onSubmit={handleChangePassword} className="space-y-4">
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
              <p className="text-xs text-gray-400 mt-1">Minimum 8 characters.</p>
            </Field>

            {pwMsg && (
              <p className={`text-sm ${pwMsg.type === "ok" ? "text-green-600" : "text-red-600"}`}>
                {pwMsg.text}
              </p>
            )}

            <button type="submit" disabled={pwSaving} className="btn-primary">
              {pwSaving ? "Changing..." : "Change password"}
            </button>
          </form>
        </div>
      )}

      {/* Delete account section */}
      {section === "delete" && (
        <div className="space-y-6 max-w-md">
          <div className="rounded-xl border border-red-200 bg-red-50 p-6">
            <h2 className="font-semibold text-red-800 mb-2">Danger zone</h2>
            <p className="text-sm text-red-700 mb-4">
              Permanently delete your account, profile, matches, and messages.
              This action cannot be undone.
            </p>

            {!deleteConfirm ? (
              <button
                onClick={() => setDeleteConfirm(true)}
                className="rounded-lg border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100 transition-colors"
              >
                Delete my account
              </button>
            ) : (
              <div className="space-y-3">
                <p className="text-sm font-medium text-red-800">
                  Are you absolutely sure?
                </p>
                <div className="flex gap-3">
                  <button
                    onClick={handleDeleteAccount}
                    disabled={deleting}
                    className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
                  >
                    {deleting ? "Deleting..." : "Yes, delete everything"}
                  </button>
                  <button
                    onClick={() => setDeleteConfirm(false)}
                    className="btn-secondary"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}
          </div>

          <div>
            <button
              onClick={() => signOut({ callbackUrl: "/" })}
              className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
            >
              Log out of this device
            </button>
          </div>
        </div>
      )}
    </main>
  );
}

/* --- Sub-components --- */

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4">
      {children}
    </h2>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-medium text-gray-600">{label}</label>
      {children}
    </div>
  );
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
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

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
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

function TriToggle({
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
