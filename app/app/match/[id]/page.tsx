"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

interface Listing {
  id: number;
  slug: string;
  url: string;
  status: string;
  publicTitle: string | null;
  shortTitle: string | null;
  city: string | null;
  zipcode: string | null;
  rentGross: number | null;
  rentNet: number | null;
  rentCharges: number | null;
  numberOfRooms: number | null;
  surfaceLiving: number | null;
  floor: number | null;
  isFurnished: boolean | null;
  isTemporary: boolean | null;
  movingDate: string | null;
  movingDateType: string | null;
  description: string | null;
  reserved: boolean;
}

interface Attributes {
  flatmateCount: number | null;
  languages: string[];
  vibe: string | null;
  pets: boolean | null;
  smoking: boolean | null;
  genderPref: string | null;
  moveInFlexible: boolean | null;
}

interface MatchData {
  id: string;
  score: number;
  scoreBreakdown: Record<string, number>;
  rationale: string | null;
  status: string;
  listingSnapshot: Record<string, unknown>;
  createdAt: string;
}

interface MatchDetail {
  match: MatchData;
  listing: Listing | null;
  attributes: Attributes | null;
  message_draft: string | null;
}

export default function MatchDetailPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<MatchDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [draft, setDraft] = useState("");
  const [drafting, setDrafting] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [showEditor, setShowEditor] = useState(false);
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/matches/${id}`);
        if (!res.ok) throw new Error("Not found");
        const detail: MatchDetail = await res.json();
        setData(detail);
        if (detail.message_draft) {
          setDraft(detail.message_draft);
          setShowEditor(true);
        }
      } catch {
        setError("Match not found.");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  const handleGenerateDraft = useCallback(async () => {
    setDrafting(true);
    setDraftError(null);
    try {
      const res = await fetch(`/api/matches/${id}/draft`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? `HTTP ${res.status}`);
      setDraft(data.message_body);
      setShowEditor(true);
    } catch (e) {
      setDraftError(`Error: ${e instanceof Error ? e.message : String(e)}`);
    } finally {
      setDrafting(false);
    }
  }, [id]);

  const handleSaveDraft = useCallback(async () => {
    setSaving(true);
    try {
      await fetch(`/api/matches/${id}/message`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body: draft }),
      });
    } catch {
      /* silent */
    } finally {
      setSaving(false);
    }
  }, [id, draft]);

  const handleCopyAndOpen = useCallback(async () => {
    if (!data?.listing) return;

    await handleSaveDraft();

    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      /* clipboard may fail in some contexts */
    }

    window.open(`https://flatfox.ch${data.listing.url}`, "_blank");

    await fetch(`/api/matches/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "contacted" }),
    });

    setData((prev) =>
      prev ? { ...prev, match: { ...prev.match, status: "contacted" } } : prev
    );
  }, [data, draft, id, handleSaveDraft]);

  const handleDismiss = useCallback(async () => {
    await fetch(`/api/matches/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "dismissed" }),
    });
    router.push("/dashboard");
  }, [id, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-gray-500">Loading…</p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-3">
        <p className="text-gray-700">{error ?? "Something went wrong."}</p>
        <Link href="/dashboard" className="text-sm text-blue-600 hover:underline">
          Back to dashboard
        </Link>
      </div>
    );
  }

  const { match, listing, attributes } = data;
  const snapshot = match.listingSnapshot as Record<string, unknown>;
  const title =
    listing?.publicTitle ??
    listing?.shortTitle ??
    (snapshot.title as string) ??
    "Untitled listing";
  const isRemoved = listing?.status === "removed" || !listing;
  const scorePercent = Math.round(match.score * 100);

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      {/* Back link */}
      <Link
        href="/dashboard"
        className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700 mb-6"
      >
        &larr; Back to matches
      </Link>

      {/* Header */}
      <div className="flex items-start justify-between gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold">{title}</h1>
          <div className="flex items-center gap-2 mt-1">
            {isRemoved && (
              <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                No longer available
              </span>
            )}
            {listing?.reserved && (
              <span className="inline-flex items-center rounded-full bg-yellow-100 px-2 py-0.5 text-xs text-yellow-700">
                Reserved
              </span>
            )}
            {match.status === "contacted" && (
              <span className="inline-flex items-center rounded-full bg-green-100 px-2 py-0.5 text-xs text-green-700">
                Contacted
              </span>
            )}
          </div>
        </div>
        <div
          className={`rounded-full px-3 py-1.5 text-lg font-semibold ${
            scorePercent >= 80
              ? "bg-green-100 text-green-700"
              : scorePercent >= 60
                ? "bg-yellow-100 text-yellow-700"
                : "bg-gray-100 text-gray-600"
          }`}
        >
          {scorePercent}%
        </div>
      </div>

      {/* Listing details card */}
      {listing && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 mb-6">
          <div className="grid grid-cols-2 gap-4 text-sm">
            {listing.city && (
              <Detail label="Location" value={`${listing.zipcode ?? ""} ${listing.city}`} />
            )}
            {listing.rentGross != null && (
              <Detail label="Rent (gross)" value={`CHF ${listing.rentGross}/mo`} />
            )}
            {listing.rentNet != null && (
              <Detail label="Rent (net)" value={`CHF ${listing.rentNet}/mo`} />
            )}
            {listing.rentCharges != null && (
              <Detail label="Charges" value={`CHF ${listing.rentCharges}/mo`} />
            )}
            {listing.numberOfRooms != null && (
              <Detail
                label="Rooms"
                value={`${listing.numberOfRooms}`}
              />
            )}
            {listing.surfaceLiving != null && (
              <Detail label="Living area" value={`${listing.surfaceLiving} m²`} />
            )}
            {listing.floor != null && (
              <Detail label="Floor" value={`${listing.floor}`} />
            )}
            {listing.isFurnished != null && (
              <Detail label="Furnished" value={listing.isFurnished ? "Yes" : "No"} />
            )}
            {listing.isTemporary != null && listing.isTemporary && (
              <Detail label="Temporary" value="Yes" />
            )}
            {listing.movingDate && (
              <Detail
                label="Available from"
                value={new Date(listing.movingDate).toLocaleDateString()}
              />
            )}
          </div>

          {/* Attributes */}
          {attributes && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <h3 className="text-xs font-medium text-gray-500 uppercase mb-2">
                Listing attributes
              </h3>
              <div className="flex flex-wrap gap-2">
                {attributes.flatmateCount != null && (
                  <Tag>{attributes.flatmateCount} flatmate{attributes.flatmateCount !== 1 ? "s" : ""}</Tag>
                )}
                {attributes.vibe && <Tag>{attributes.vibe}</Tag>}
                {attributes.languages.length > 0 && (
                  <Tag>{attributes.languages.join(", ")}</Tag>
                )}
                {attributes.pets != null && (
                  <Tag>Pets: {attributes.pets ? "OK" : "No"}</Tag>
                )}
                {attributes.smoking != null && (
                  <Tag>Smoking: {attributes.smoking ? "OK" : "No"}</Tag>
                )}
                {attributes.genderPref && (
                  <Tag>Gender: {attributes.genderPref}</Tag>
                )}
                {attributes.moveInFlexible != null && (
                  <Tag>Date {attributes.moveInFlexible ? "flexible" : "fixed"}</Tag>
                )}
              </div>
            </div>
          )}

          {/* Description */}
          {listing.description && (
            <div className="mt-4 pt-4 border-t border-gray-100">
              <h3 className="text-xs font-medium text-gray-500 uppercase mb-2">
                Description
              </h3>
              <p className="text-sm text-gray-700 whitespace-pre-line">
                {listing.description}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Score breakdown & rationale */}
      <div className="rounded-lg border border-gray-200 bg-white p-6 mb-6">
        <h2 className="font-medium mb-3">Match rationale</h2>
        {match.rationale && (
          <p className="text-sm text-gray-700 mb-4">{match.rationale}</p>
        )}
        {match.scoreBreakdown &&
          Object.keys(match.scoreBreakdown).length > 0 && (
            <div className="grid grid-cols-2 gap-2 text-sm">
              {Object.entries(match.scoreBreakdown).map(([key, val]) => (
                <div key={key} className="flex justify-between">
                  <span className="text-gray-500">
                    {key.replace(/_/g, " ")}
                  </span>
                  <span className="font-medium">
                    {typeof val === "number" ? Math.round(val * 100) : val}%
                  </span>
                </div>
              ))}
            </div>
          )}
      </div>

      {/* Message drafting section */}
      {!isRemoved && (
        <div className="rounded-lg border border-gray-200 bg-white p-6 mb-6">
          <h2 className="font-medium mb-3">Contact message</h2>

          {!showEditor ? (
            <div>
              <button
                onClick={handleGenerateDraft}
                disabled={drafting}
                className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 disabled:opacity-50"
              >
                {drafting ? "Drafting…" : "Generate message draft"}
              </button>
              {draftError && (
                <p className="mt-2 text-sm text-red-600">{draftError}</p>
              )}
            </div>
          ) : (
            <div>
              <textarea
                ref={textareaRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                className="input min-h-[160px] mb-3"
              />
              <div className="flex items-center gap-3">
                <button
                  onClick={handleCopyAndOpen}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700"
                >
                  {copied ? "Copied!" : "Copy & Open on Flatfox"}
                </button>
                <button
                  onClick={handleSaveDraft}
                  disabled={saving}
                  className="rounded-md border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
                >
                  {saving ? "Saving…" : "Save draft"}
                </button>
                <button
                  onClick={handleGenerateDraft}
                  disabled={drafting}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  {drafting ? "Regenerating…" : "Regenerate"}
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Actions */}
      <div className="flex items-center gap-3">
        {match.status !== "dismissed" && (
          <button
            onClick={handleDismiss}
            className="rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50"
          >
            Dismiss match
          </button>
        )}
        {listing && (
          <a
            href={`https://flatfox.ch${listing.url}`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-600 hover:underline"
          >
            View on Flatfox
          </a>
        )}
      </div>
    </main>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <span className="text-gray-500">{label}</span>
      <p className="font-medium text-gray-900">{value}</p>
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-600">
      {children}
    </span>
  );
}
