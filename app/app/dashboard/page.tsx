"use client";

import { useSession } from "next-auth/react";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

interface MatchListing {
  id: number;
  slug: string;
  url: string;
  status: string;
  publicTitle: string | null;
  shortTitle: string | null;
  city: string | null;
  zipcode: string | null;
  rentNet: number | null;
  rentCharges: number | null;
  rentGross: number | null;
  numberOfRooms: number | null;
  surfaceLiving: number | null;
  isFurnished: boolean | null;
  movingDate: string | null;
  reserved: boolean;
}

interface Match {
  id: string;
  score: number;
  scoreBreakdown: Record<string, number>;
  rationale: string | null;
  status: string;
  listingSnapshot: Record<string, unknown>;
  createdAt: string;
  listing: MatchListing | null;
}

type StatusFilter = "all" | "new" | "seen" | "contacted" | "dismissed";

const STATUS_FILTERS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "new", label: "New" },
  { value: "seen", label: "Seen" },
  { value: "contacted", label: "Contacted" },
  { value: "dismissed", label: "Dismissed" },
];

export default function DashboardPage() {
  const { data: session } = useSession();
  const [matches, setMatches] = useState<Match[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [filter, setFilter] = useState<StatusFilter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const limit = 20;

  const fetchMatches = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        sort: "score",
        page: String(page),
        limit: String(limit),
      });
      if (filter !== "all") {
        params.set("status", filter);
      }
      const res = await fetch(`/api/matches?${params}`);
      if (!res.ok) throw new Error("Failed to load matches");
      const data = await res.json();
      setMatches(data.matches);
      setTotal(data.total);
    } catch {
      setError("Could not load matches. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [page, filter]);

  useEffect(() => {
    fetchMatches();
  }, [fetchMatches]);

  const setStatus = async (matchId: string, status: string) => {
    try {
      const res = await fetch(`/api/matches/${matchId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error();
      setMatches((prev) =>
        prev.map((m) => (m.id === matchId ? { ...m, status } : m))
      );
    } catch {
      /* silent */
    }
  };

  const handleDismiss = (matchId: string) => setStatus(matchId, "dismissed");
  // Un-dismissing returns the match to "seen" (it's been looked at, not new).
  const handleUndismiss = (matchId: string) => setStatus(matchId, "seen");

  const totalPages = Math.ceil(total / limit);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Your matches</h1>
        <p className="text-sm text-gray-500 mt-1">
          Listings that match your preferences, ranked by score.
        </p>
      </div>

      {/* Status filter */}
      <div className="flex gap-2 mb-6">
        {STATUS_FILTERS.map((f) => (
          <button
            key={f.value}
            onClick={() => {
              setFilter(f.value);
              setPage(1);
            }}
            className={`rounded-full border px-3 py-1 text-sm transition-colors ${
              filter === f.value
                ? "border-brand-600 bg-brand-50 text-brand-700"
                : "border-gray-300 text-gray-700 hover:bg-gray-100"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="py-12 text-center text-gray-500">Loading matches…</div>
      ) : error ? (
        <div className="py-12 text-center">
          <p className="text-red-600 mb-3">{error}</p>
          <button
            onClick={fetchMatches}
            className="text-sm text-brand-600 hover:underline"
          >
            Retry
          </button>
        </div>
      ) : matches.length === 0 ? (
        <EmptyState filter={filter} />
      ) : (
        <>
          <div className="space-y-3">
            {matches.map((match) => (
              <MatchCard
                key={match.id}
                match={match}
                onDismiss={() => handleDismiss(match.id)}
                onUndismiss={() => handleUndismiss(match.id)}
              />
            ))}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-center gap-4 mt-8">
              <button
                onClick={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                className="rounded border border-gray-300 px-3 py-1 text-sm disabled:opacity-40"
              >
                Previous
              </button>
              <span className="text-sm text-gray-600">
                Page {page} of {totalPages}
              </span>
              <button
                onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                className="rounded border border-gray-300 px-3 py-1 text-sm disabled:opacity-40"
              >
                Next
              </button>
            </div>
          )}
        </>
      )}
    </main>
  );
}

function EmptyState({ filter }: { filter: StatusFilter }) {
  if (filter !== "all") {
    return (
      <div className="py-12 text-center text-gray-500">
        <p>No {filter} matches.</p>
      </div>
    );
  }
  return (
    <div className="py-12 text-center">
      <p className="text-gray-700 font-medium mb-2">No matches yet</p>
      <p className="text-sm text-gray-500">
        We&apos;re searching — matches appear within a few hours. Try widening
        your budget or radius if nothing shows up.
      </p>
    </div>
  );
}

function MatchCard({
  match,
  onDismiss,
  onUndismiss,
}: {
  match: Match;
  onDismiss: () => void;
  onUndismiss: () => void;
}) {
  const listing = match.listing;
  const snapshot = match.listingSnapshot as Record<string, unknown>;
  const title =
    listing?.publicTitle ??
    listing?.shortTitle ??
    (snapshot.title as string) ??
    "Untitled listing";
  const city =
    listing?.city ?? (snapshot.city as string) ?? "Unknown";
  const rentNet = listing?.rentNet ?? (snapshot.rent_net as number | null) ?? null;
  const rentCharges = listing?.rentCharges ?? (snapshot.rent_charges as number | null) ?? null;
  const rawGross = listing?.rentGross ?? (snapshot.price as number | null) ?? null;
  const price =
    (rawGross != null && rawGross > 0)
      ? rawGross
      : (rentNet != null && rentNet > 0)
        ? rentNet + (rentCharges ?? 0)
        : null;
  const rooms = listing?.numberOfRooms ?? null;
  const isRemoved = listing?.status === "removed" || !listing;
  const scorePercent = Math.round(match.score * 100);

  const borderColor =
    scorePercent >= 80
      ? "border-l-brand-500"
      : scorePercent >= 60
        ? "border-l-accent-400"
        : "border-l-gray-300";

  return (
    <Link
      href={`/match/${match.id}`}
      className={`block rounded-xl border border-gray-200 border-l-4 ${borderColor} bg-white p-5 transition-all hover:shadow-md hover:-translate-y-0.5`}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          {/* Title row */}
          <div className="flex items-center gap-2 mb-2">
            <h3 className="font-semibold text-gray-900 truncate">{title}</h3>
            {match.status === "new" && (
              <span className="badge-new">New</span>
            )}
            {isRemoved && (
              <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
                Unavailable
              </span>
            )}
            {listing?.reserved && (
              <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs text-amber-700 border border-amber-200">
                Reserved
              </span>
            )}
          </div>

          {/* Info chips */}
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <span className="inline-flex items-center gap-1 rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700">
              <svg className="h-3 w-3 text-gray-400" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M5.05 4.05a7 7 0 119.9 9.9L10 18.9l-4.95-4.95a7 7 0 010-9.9zM10 11a2 2 0 100-4 2 2 0 000 4z" clipRule="evenodd" /></svg>
              {city}
            </span>
            {price != null && (
              <span className="inline-flex items-center gap-1 rounded-md bg-brand-50 px-2 py-1 text-xs font-medium text-brand-700">
                <svg className="h-3 w-3 text-brand-400" viewBox="0 0 20 20" fill="currentColor"><path d="M8.433 7.418c.155-.103.346-.196.567-.267v1.698a2.305 2.305 0 01-.567-.267C8.07 8.34 8 8.114 8 8c0-.114.07-.34.433-.582zM11 12.849v-1.698c.22.071.412.164.567.267.364.243.433.468.433.582 0 .114-.07.34-.433.582a2.305 2.305 0 01-.567.267z" /><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-13a1 1 0 10-2 0v.092a4.535 4.535 0 00-1.676.662C6.602 6.234 6 7.009 6 8c0 .99.602 1.765 1.324 2.246.48.32 1.054.545 1.676.662v1.941c-.391-.127-.68-.317-.843-.504a1 1 0 10-1.51 1.31c.562.649 1.413 1.076 2.353 1.253V15a1 1 0 102 0v-.092a4.535 4.535 0 001.676-.662C13.398 13.766 14 12.991 14 12c0-.99-.602-1.765-1.324-2.246A4.535 4.535 0 0011 9.092V7.151c.391.127.68.317.843.504a1 1 0 101.511-1.31c-.563-.649-1.413-1.076-2.354-1.253V5z" clipRule="evenodd" /></svg>
                CHF {price}/mo
                {rentNet != null && rentCharges != null && (
                  <span className="text-brand-400 font-normal">
                    ({rentNet}+{rentCharges})
                  </span>
                )}
              </span>
            )}
            {rooms != null && (
              <span className="inline-flex items-center rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700">
                {rooms} room{rooms !== 1 ? "s" : ""}
              </span>
            )}
            {listing?.surfaceLiving != null && (
              <span className="inline-flex items-center rounded-md bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700">
                {listing.surfaceLiving} m²
              </span>
            )}
          </div>

          {/* Rationale */}
          {match.rationale && (
            <p className="text-sm text-gray-500 line-clamp-1">
              {match.rationale}
            </p>
          )}
        </div>

        {/* Score + actions */}
        <div className="flex flex-col items-end gap-2 shrink-0">
          <div
            className={scorePercent >= 80
              ? "badge-score-high"
              : scorePercent >= 60
                ? "badge-score-mid"
                : "badge-score-low"
            }
          >
            {scorePercent}%
          </div>

          {match.status !== "dismissed" && (
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDismiss();
              }}
              className="text-xs text-gray-400 transition-colors hover:text-red-500"
            >
              Dismiss
            </button>
          )}
          {match.status === "dismissed" && (
            <span className="flex items-center gap-1.5 text-xs text-gray-400">
              Dismissed
              <button
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  onUndismiss();
                }}
                className="font-medium text-brand-600 transition-colors hover:text-brand-700"
              >
                Undo
              </button>
            </span>
          )}
        </div>
      </div>
    </Link>
  );
}
