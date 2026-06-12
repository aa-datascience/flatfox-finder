"use client";

import { signOut, useSession } from "next-auth/react";
import { useEffect, useState } from "react";

import {
  Field,
  FieldGroup,
  LivingPreferenceFields,
  LOCALE_OPTIONS,
  MESSAGE_LANG_OPTIONS,
  SearchCriteriaFields,
  type ProfileFieldsValue,
} from "@/components/profile/fields";

interface ProfileData extends ProfileFieldsValue {
  study_program: string;
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
  const [deletePassword, setDeletePassword] = useState("");
  const [deleteError, setDeleteError] = useState<string | null>(null);
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

  // Merge a partial update from the shared field groups into profile state.
  const patchProfile = (patch: Partial<ProfileFieldsValue>) =>
    setProfile((prev) => ({ ...prev, ...patch }));

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
    setDeleteError(null);
    try {
      const res = await fetch("/api/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password: deletePassword }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setDeleteError(data.error ?? "Could not delete account.");
        setDeleting(false);
        return;
      }
      await signOut({ callbackUrl: "/" });
    } catch {
      setDeleteError("Something went wrong. Please try again.");
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
                  <Field label="Name" htmlFor="set-name">
                    <input
                      id="set-name"
                      type="text"
                      value={name}
                      onChange={(e) => setName(e.target.value)}
                      className="input"
                    />
                  </Field>

                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Preferred language" htmlFor="set-locale">
                      <select
                        id="set-locale"
                        value={locale}
                        onChange={(e) => setLocale(e.target.value)}
                        className="input"
                      >
                        {LOCALE_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>{o.label}</option>
                        ))}
                      </select>
                    </Field>
                    <Field label="Study program" htmlFor="set-study">
                      <input
                        id="set-study"
                        type="text"
                        value={profile.study_program}
                        onChange={(e) => setProfile({ ...profile, study_program: e.target.value })}
                        className="input"
                      />
                    </Field>
                  </div>

                  <Field
                    label="About me"
                    htmlFor="set-about"
                    hint="This text is included when AI drafts your messages."
                  >
                    <textarea
                      id="set-about"
                      value={profile.raw_text}
                      onChange={(e) => setProfile({ ...profile, raw_text: e.target.value })}
                      className="input"
                      rows={3}
                      placeholder="Used to personalize your contact messages. E.g. I'm a tidy, quiet person who loves cooking..."
                    />
                  </Field>
                </div>
              </div>

              {/* Search criteria card */}
              <div className="card p-6">
                <SectionTitle>Search criteria</SectionTitle>
                <SearchCriteriaFields value={profile} onChange={patchProfile} />
              </div>

              {/* Preferences card */}
              <div className="card p-6">
                <SectionTitle>Living preferences</SectionTitle>
                <LivingPreferenceFields value={profile} onChange={patchProfile} />
              </div>

              {/* Message settings card */}
              <div className="card p-6">
                <SectionTitle>Message settings</SectionTitle>
                <FieldGroup label="Contact message language">
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
                </FieldGroup>
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
            <Field label="Current password" htmlFor="pw-old">
              <input
                id="pw-old"
                type="password"
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                className="input"
                autoComplete="current-password"
                required
              />
            </Field>
            <Field label="New password" htmlFor="pw-new" hint="Minimum 8 characters.">
              <input
                id="pw-new"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="input"
                autoComplete="new-password"
                minLength={8}
                required
              />
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
                  Are you absolutely sure? Enter your password to confirm.
                </p>
                <input
                  type="password"
                  value={deletePassword}
                  onChange={(e) => setDeletePassword(e.target.value)}
                  className="input"
                  placeholder="Your password"
                  autoComplete="current-password"
                />
                {deleteError && (
                  <p className="text-sm text-red-700">{deleteError}</p>
                )}
                <div className="flex gap-3">
                  <button
                    onClick={handleDeleteAccount}
                    disabled={deleting || !deletePassword}
                    className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50 transition-colors"
                  >
                    {deleting ? "Deleting..." : "Yes, delete everything"}
                  </button>
                  <button
                    onClick={() => {
                      setDeleteConfirm(false);
                      setDeletePassword("");
                      setDeleteError(null);
                    }}
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
