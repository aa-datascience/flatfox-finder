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
  lat: number | null;
  lng: number | null;
  reserved: boolean;
}

interface ListingImage {
  url: string;
  thumb: string;
  caption: string | null;
  width: number;
  height: number;
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
  scoreBreakdown: Record<string, number | null>;
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
  const [copyFailed, setCopyFailed] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [translatedDesc, setTranslatedDesc] = useState<string | null>(null);
  const [originalLang, setOriginalLang] = useState<string | null>(null);
  const [translating, setTranslating] = useState(false);
  const [showOriginal, setShowOriginal] = useState(false);

  const [images, setImages] = useState<ListingImage[]>([]);
  const [activeImg, setActiveImg] = useState(0);

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
        // Fetch images (non-blocking)
        fetch(`/api/matches/${id}/images`)
          .then((r) => r.ok ? r.json() : { images: [] })
          .then((d) => setImages(d.images ?? []))
          .catch(() => {/* non-critical */});

        if (detail.listing?.description) {
          setTranslating(true);
          try {
            const tRes = await fetch(`/api/matches/${id}/translate`, { method: "POST" });
            if (tRes.ok) {
              const tData = await tRes.json();
              setTranslatedDesc(tData.translated);
              setOriginalLang(tData.original_language);
            }
          } catch {
            /* translation is non-critical */
          } finally {
            setTranslating(false);
          }
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
      setCopyFailed(false);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API can be blocked (permissions, non-secure context). Tell the
      // user so they can copy manually instead of pasting nothing on Flatfox.
      setCopyFailed(true);
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
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex items-center gap-2 text-gray-500">
          <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          Loading...
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3">
        <p className="text-gray-700">{error ?? "Something went wrong."}</p>
        <Link href="/dashboard" className="text-sm text-brand-600 hover:underline">
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

  const scoreColorClass =
    scorePercent >= 80
      ? "text-brand-600 bg-brand-50 border-brand-200"
      : scorePercent >= 60
        ? "text-accent-600 bg-accent-50 border-accent-200"
        : "text-gray-600 bg-gray-50 border-gray-200";

  return (
    <main className="mx-auto max-w-3xl px-4 py-8">
      {/* Back link */}
      <Link
        href="/dashboard"
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6 transition-colors"
      >
        <svg className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M17 10a.75.75 0 01-.75.75H5.612l4.158 3.96a.75.75 0 11-1.04 1.08l-5.5-5.25a.75.75 0 010-1.08l5.5-5.25a.75.75 0 111.04 1.08L5.612 9.25H16.25A.75.75 0 0117 10z" clipRule="evenodd" /></svg>
        Back to matches
      </Link>

      {/* Header card */}
      <div className="card p-6 mb-6">
        <div className="flex items-start justify-between gap-4">
          <div className="flex-1 min-w-0">
            <h1 className="text-xl font-bold text-gray-900 mb-2">{title}</h1>
            <div className="flex flex-wrap items-center gap-2">
              {isRemoved && (
                <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-500">
                  No longer available
                </span>
              )}
              {listing?.reserved && (
                <span className="inline-flex items-center rounded-full bg-amber-50 px-2.5 py-0.5 text-xs text-amber-700 border border-amber-200">
                  Reserved
                </span>
              )}
              {match.status === "contacted" && (
                <span className="inline-flex items-center rounded-full bg-green-50 px-2.5 py-0.5 text-xs text-green-700 border border-green-200">
                  Contacted
                </span>
              )}
              {match.status === "new" && (
                <span className="badge-new">New</span>
              )}
            </div>
          </div>
          <div className={`flex flex-col items-center rounded-xl border px-4 py-3 ${scoreColorClass}`}>
            <span className="text-2xl font-bold">{scorePercent}%</span>
            <span className="text-[10px] uppercase tracking-wide opacity-70">match</span>
          </div>
        </div>
      </div>

      {/* Image gallery */}
      {images.length > 0 && (
        <div className="card overflow-hidden mb-6">
          <div className="relative aspect-[16/9] bg-gray-100">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={images[activeImg].url}
              alt={images[activeImg].caption ?? `Photo ${activeImg + 1}`}
              className="h-full w-full object-cover"
            />
            {images.length > 1 && (
              <>
                <button
                  type="button"
                  aria-label="Previous photo"
                  onClick={() => setActiveImg((i) => (i - 1 + images.length) % images.length)}
                  className="absolute left-2 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white hover:bg-black/60 transition-colors"
                >
                  <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M12.79 5.23a.75.75 0 01-.02 1.06L8.832 10l3.938 3.71a.75.75 0 11-1.04 1.08l-4.5-4.25a.75.75 0 010-1.08l4.5-4.25a.75.75 0 011.06.02z" clipRule="evenodd" /></svg>
                </button>
                <button
                  type="button"
                  aria-label="Next photo"
                  onClick={() => setActiveImg((i) => (i + 1) % images.length)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full bg-black/40 p-2 text-white hover:bg-black/60 transition-colors"
                >
                  <svg className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M7.21 14.77a.75.75 0 01.02-1.06L11.168 10 7.23 6.29a.75.75 0 111.04-1.08l4.5 4.25a.75.75 0 010 1.08l-4.5 4.25a.75.75 0 01-1.06-.02z" clipRule="evenodd" /></svg>
                </button>
                <div className="absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/50 px-3 py-1 text-xs text-white">
                  {activeImg + 1} / {images.length}
                </div>
              </>
            )}
          </div>
          {images.length > 1 && (
            <div className="flex gap-1.5 p-3 overflow-x-auto">
              {images.map((img, i) => (
                <button
                  key={i}
                  type="button"
                  aria-label={`View photo ${i + 1}`}
                  aria-current={i === activeImg}
                  onClick={() => setActiveImg(i)}
                  className={`shrink-0 rounded-lg overflow-hidden border-2 transition-all ${
                    i === activeImg ? "border-brand-500 shadow-sm" : "border-transparent opacity-60 hover:opacity-100"
                  }`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.thumb} alt={img.caption ?? `Thumb ${i + 1}`} className="h-14 w-20 object-cover" />
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Listing details */}
      {listing && (
        <div className="card p-6 mb-6">
          {/* Map */}
          {listing.lat != null && listing.lng != null && (
            <div className="mb-5 rounded-lg overflow-hidden border border-gray-200">
              <iframe
                title="Listing location"
                width="100%"
                height="200"
                style={{ border: 0 }}
                loading="lazy"
                src={`https://www.openstreetmap.org/export/embed.html?bbox=${listing.lng - 0.01},${listing.lat - 0.007},${listing.lng + 0.01},${listing.lat + 0.007}&layer=mapnik&marker=${listing.lat},${listing.lng}`}
              />
            </div>
          )}

          <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4">
            Listing details
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
            {listing.city && (
              <DetailItem icon="location" label="Location" value={`${listing.zipcode ?? ""} ${listing.city}`} />
            )}
            {listing.rentGross != null && (
              <DetailItem icon="price" label="Rent (gross)" value={`CHF ${listing.rentGross}/mo`} />
            )}
            {listing.rentNet != null && (
              <DetailItem icon="price" label="Rent (net)" value={`CHF ${listing.rentNet}/mo`} />
            )}
            {listing.rentCharges != null && (
              <DetailItem icon="price" label="Charges" value={`CHF ${listing.rentCharges}/mo`} />
            )}
            {listing.numberOfRooms != null && (
              <DetailItem icon="rooms" label="Rooms" value={`${listing.numberOfRooms}`} />
            )}
            {listing.surfaceLiving != null && (
              <DetailItem icon="area" label="Living area" value={`${listing.surfaceLiving} m²`} />
            )}
            {listing.floor != null && (
              <DetailItem icon="floor" label="Floor" value={`${listing.floor}`} />
            )}
            {listing.isFurnished != null && (
              <DetailItem icon="furnished" label="Furnished" value={listing.isFurnished ? "Yes" : "No"} />
            )}
            {listing.isTemporary != null && listing.isTemporary && (
              <DetailItem icon="temp" label="Temporary" value="Yes" />
            )}
            {listing.movingDate && (
              <DetailItem icon="date" label="Available from" value={new Date(listing.movingDate).toLocaleDateString()} />
            )}
          </div>

          {/* Attributes */}
          {attributes && (
            <div className="mt-5 pt-5 border-t border-gray-100">
              <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">
                Shared living attributes
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
            <div className="mt-5 pt-5 border-t border-gray-100">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide">
                  Description
                  {translatedDesc && originalLang && !showOriginal && (
                    <span className="ml-2 font-normal normal-case text-gray-400">
                      — translated from {originalLang.toUpperCase()}
                    </span>
                  )}
                </h3>
                {translatedDesc && (
                  <button
                    onClick={() => setShowOriginal(!showOriginal)}
                    className="text-xs text-brand-600 hover:underline"
                  >
                    {showOriginal ? "Show translation" : "Show original"}
                  </button>
                )}
              </div>
              {translating ? (
                <p className="text-sm text-gray-400 italic">Translating...</p>
              ) : (
                <p className="text-sm leading-relaxed text-gray-700 whitespace-pre-line">
                  {showOriginal || !translatedDesc
                    ? listing.description
                    : translatedDesc}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Score breakdown */}
      <div className="card p-6 mb-6">
        <div className="flex items-baseline justify-between mb-1">
          <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
            Why this is a {scorePercent}% match
          </h2>
          {(() => {
            const c = match.scoreBreakdown?.completeness;
            if (typeof c !== "number") return null;
            const label =
              c >= 0.95 ? "full info" : c >= 0.6 ? "partial info" : "limited info";
            return (
              <span
                className="text-xs text-gray-500"
                title="How much information we had to compare. Higher = more reliable score."
              >
                {label}
              </span>
            );
          })()}
        </div>
        <p className="text-xs text-gray-500 mb-5">
          Each line compares the listing against the preferences you set in your profile.
        </p>

        {(() => {
          if (!match.rationale) return null;

          type Row = { criterion: string; status: "ok" | "partial" | "miss"; detail: string };
          const L1_LABELS: Record<string, string> = {
            Budget: "Price vs. your budget",
            Location: "Distance to a preferred city",
            Rooms: "Number of rooms",
            Date: "Move-in date",
          };
          const L2_LABELS: Record<string, string> = {
            vibe: "Vibe",
            pets: "Pets",
            smoking: "Smoking",
            languages: "Languages",
            gender_pref: "Gender preference",
          };
          const STATUS_FROM_SYMBOL: Record<string, "ok" | "partial" | "miss"> = {
            "✓": "ok",
            "~": "partial",
            "✗": "miss",
          };

          const practical: Row[] = [];
          const lifestyle: Row[] = [];

          for (const raw of match.rationale.split(", ")) {
            const part = raw.trim();
            if (!part) continue;
            // L1 sub-scores look like: "Budget ✓ (CHF 950 ≤ 1200)" or "Budget: unknown"
            const l1Key = Object.keys(L1_LABELS).find((k) => part.startsWith(k));
            if (l1Key) {
              const sym = part.match(/[✓~✗]/)?.[0];
              if (!sym) continue;
              const detailMatch = part.match(/\(([^)]+)\)/);
              practical.push({
                criterion: L1_LABELS[l1Key],
                status: STATUS_FROM_SYMBOL[sym],
                detail: detailMatch ? detailMatch[1] : "",
              });
              continue;
            }
            // L2 attributes look like: "vibe ✓", "languages ~"
            const l2Key = Object.keys(L2_LABELS).find((k) => part.startsWith(k + " "));
            if (l2Key) {
              const sym = part.slice(l2Key.length + 1).trim();
              if (!STATUS_FROM_SYMBOL[sym]) continue;
              lifestyle.push({
                criterion: L2_LABELS[l2Key],
                status: STATUS_FROM_SYMBOL[sym],
                detail: "",
              });
            }
          }

          const renderRow = (r: Row) => {
            const styles =
              r.status === "ok"
                ? { dot: "bg-brand-500", text: "good fit" }
                : r.status === "partial"
                  ? { dot: "bg-accent-400", text: "partial fit" }
                  : { dot: "bg-rose-400", text: "doesn't match" };
            return (
              <div
                key={`${r.criterion}-${r.detail}`}
                className="flex items-start gap-3 py-2 border-b border-gray-100 last:border-0"
              >
                <span className={`mt-2 h-2 w-2 rounded-full shrink-0 ${styles.dot}`} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm font-medium text-gray-900">{r.criterion}</span>
                    <span className="text-xs text-gray-500 shrink-0">{styles.text}</span>
                  </div>
                  {r.detail && (
                    <p className="text-xs text-gray-500 mt-0.5">{r.detail}</p>
                  )}
                </div>
              </div>
            );
          };

          return (
            <div className="space-y-5">
              {practical.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                    Practical fit
                  </h3>
                  <div>{practical.map(renderRow)}</div>
                </div>
              )}
              {lifestyle.length > 0 && (
                <div>
                  <h3 className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">
                    Lifestyle fit
                  </h3>
                  <p className="text-xs text-gray-400 mb-1">
                    Extracted by AI from the listing description — may be incomplete.
                  </p>
                  <div>{lifestyle.map(renderRow)}</div>
                </div>
              )}
            </div>
          );
        })()}
      </div>

      {/* Message drafting */}
      {!isRemoved && (
        <div className="card p-6 mb-6">
          <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide mb-4">
            Contact message
          </h2>

          {!showEditor ? (
            <div>
              <button
                onClick={handleGenerateDraft}
                disabled={drafting}
                className="btn-accent"
              >
                {drafting ? (
                  <span className="flex items-center gap-2">
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Drafting...
                  </span>
                ) : "Generate message draft"}
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
                className="input min-h-[160px] mb-4"
              />
              <div className="flex flex-wrap items-center gap-3">
                <button onClick={handleCopyAndOpen} className="btn-accent">
                  {copied ? "Copied!" : "Copy & Open on Flatfox"}
                </button>
                <button
                  onClick={handleSaveDraft}
                  disabled={saving}
                  className="btn-secondary"
                >
                  {saving ? "Saving..." : "Save draft"}
                </button>
                <button
                  onClick={handleGenerateDraft}
                  disabled={drafting}
                  className="text-sm text-gray-500 hover:text-gray-700 transition-colors"
                >
                  {drafting ? "Regenerating..." : "Regenerate"}
                </button>
              </div>
              {copyFailed && (
                <p className="mt-3 text-sm text-amber-700">
                  We couldn&apos;t copy to your clipboard automatically. Select the
                  message above and copy it manually before sending on Flatfox.
                </p>
              )}
            </div>
          )}
        </div>
      )}

      {/* Bottom actions */}
      <div className="flex items-center gap-4">
        {match.status !== "dismissed" && (
          <button onClick={handleDismiss} className="btn-secondary">
            Dismiss match
          </button>
        )}
        {listing && (
          <a
            href={`https://flatfox.ch${listing.url}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm text-brand-600 hover:underline"
          >
            View on Flatfox
            <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M4.25 5.5a.75.75 0 00-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 00.75-.75v-4a.75.75 0 011.5 0v4A2.25 2.25 0 0112.75 17h-8.5A2.25 2.25 0 012 14.75v-8.5A2.25 2.25 0 014.25 4h5a.75.75 0 010 1.5h-5zm7.25-.75a.75.75 0 01.75-.75h3.5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0V6.31l-5.47 5.47a.75.75 0 11-1.06-1.06l5.47-5.47H12.25a.75.75 0 01-.75-.75z" clipRule="evenodd" /></svg>
          </a>
        )}
      </div>
    </main>
  );
}

/* --- Sub-components --- */

const ICONS: Record<string, React.ReactNode> = {
  location: <svg className="h-4 w-4 text-gray-400" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" /></svg>,
  price: <svg className="h-4 w-4 text-gray-400" viewBox="0 0 20 20" fill="currentColor"><path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z" /><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z" clipRule="evenodd" /></svg>,
  rooms: <svg className="h-4 w-4 text-gray-400" viewBox="0 0 20 20" fill="currentColor"><path d="M10.707 2.293a1 1 0 00-1.414 0l-7 7a1 1 0 001.414 1.414L4 10.414V17a1 1 0 001 1h2a1 1 0 001-1v-2a1 1 0 011-1h2a1 1 0 011 1v2a1 1 0 001 1h2a1 1 0 001-1v-6.586l.293.293a1 1 0 001.414-1.414l-7-7z" /></svg>,
  area: <svg className="h-4 w-4 text-gray-400" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.5 2A3.5 3.5 0 002 5.5v9A3.5 3.5 0 005.5 18h9a3.5 3.5 0 003.5-3.5v-9A3.5 3.5 0 0014.5 2h-9zM4 5.5A1.5 1.5 0 015.5 4h9A1.5 1.5 0 0116 5.5v9a1.5 1.5 0 01-1.5 1.5h-9A1.5 1.5 0 014 14.5v-9z" clipRule="evenodd" /></svg>,
  floor: <svg className="h-4 w-4 text-gray-400" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M12.577 4.878a.75.75 0 01.919-.53l4.78 1.281a.75.75 0 01.531.919l-1.281 4.78a.75.75 0 01-1.449-.387l.81-3.022a19.407 19.407 0 00-5.594 5.203.75.75 0 01-1.139.093L7 10.06l-4.72 4.72a.75.75 0 01-1.06-1.06l5.25-5.25a.75.75 0 011.06 0l3.074 3.073a20.923 20.923 0 015.545-4.931l-3.042.815a.75.75 0 01-.53-.919z" clipRule="evenodd" /></svg>,
  furnished: <svg className="h-4 w-4 text-gray-400" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M1 2.75A.75.75 0 011.75 2h16.5a.75.75 0 010 1.5H18v8.75A2.75 2.75 0 0115.25 15h-1.5v2.25a.75.75 0 01-1.5 0V15h-4.5v2.25a.75.75 0 01-1.5 0V15h-1.5A2.75 2.75 0 012 12.25V3.5h-.25A.75.75 0 011 2.75z" clipRule="evenodd" /></svg>,
  temp: <svg className="h-4 w-4 text-gray-400" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm.75-13a.75.75 0 00-1.5 0v5c0 .414.336.75.75.75h4a.75.75 0 000-1.5h-3.25V5z" clipRule="evenodd" /></svg>,
  date: <svg className="h-4 w-4 text-gray-400" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.75 2a.75.75 0 01.75.75V4h7V2.75a.75.75 0 011.5 0V4h.25A2.75 2.75 0 0118 6.75v8.5A2.75 2.75 0 0115.25 18H4.75A2.75 2.75 0 012 15.25v-8.5A2.75 2.75 0 014.75 4H5V2.75A.75.75 0 015.75 2zm-1 5.5c-.69 0-1.25.56-1.25 1.25v6.5c0 .69.56 1.25 1.25 1.25h10.5c.69 0 1.25-.56 1.25-1.25v-6.5c0-.69-.56-1.25-1.25-1.25H4.75z" clipRule="evenodd" /></svg>,
};

function DetailItem({ icon, label, value }: { icon: string; label: string; value: string }) {
  return (
    <div className="flex items-start gap-2.5">
      <div className="mt-0.5 shrink-0">{ICONS[icon]}</div>
      <div>
        <p className="text-xs text-gray-500">{label}</p>
        <p className="text-sm font-medium text-gray-900">{value}</p>
      </div>
    </div>
  );
}

function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center rounded-lg bg-brand-50 px-2.5 py-1 text-xs font-medium text-brand-700 border border-brand-100">
      {children}
    </span>
  );
}
