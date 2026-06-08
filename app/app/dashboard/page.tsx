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

  const handleDismiss = async (matchId: string) => {
    try {
      const res = await fetch(`/api/matches/${matchId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "dismissed" }),
      });
      if (!res.ok) throw new Error();
      setMatches((prev) =>
        prev.map((m) => (m.id === matchId ? { ...m, status: "dismissed" } : m))
      );
    } catch {
      /* silent */
    }
  };

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
            className={`rounded-full border px-3 py-1 text-sm ${
              filter === f.value
                ? "border-blue-600 bg-blue-50 text-blue-700"
                : "border-gray-300 text-gray-700 hover:bg-gray-50"
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
            className="text-sm text-blue-600 hover:underline"
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
}: {
  match: Match;
  onDismiss: () => void;
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
  const price =
    listing?.rentGross ?? (snapshot.price as number) ?? null;
  const rooms = listing?.numberOfRooms ?? null;
  const isRemoved = listing?.status === "removed" || !listing;
  const scorePercent = Math.round(match.score * 100);

  return (
    <Link
      href={`/match/${match.id}`}
      className="block rounded-lg border border-gray-200 bg-white p-4 hover:border-blue-300 hover:shadow-sm transition-all"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-medium text-gray-900 truncate">{title}</h3>
            {match.status === "new" && (
              <span className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-xs font-medium text-blue-700">
                New
              </span>
            )}
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
          </div>

          <div className="flex items-center gap-3 text-sm text-gray-500">
            <span>{city}</span>
            {price != null && (
              <span>
                CHF {price}/mo
                {rentNet != null && rentCharges != null && (
                  <span className="text-gray-400 ml-1">
                    ({rentNet} + {rentCharges})
                  </span>
                )}
              </span>
            )}
            {rooms != null && (
              <span>
                {rooms} room{rooms !== 1 ? "s" : ""}
              </span>
            )}
            {listing?.surfaceLiving != null && (
              <span>{listing.surfaceLiving} m²</span>
            )}
          </div>

          {match.rationale && (
            <p className="mt-1.5 text-sm text-gray-600 line-clamp-2">
              {match.rationale}
            </p>
          )}
        </div>

        <div className="flex flex-col items-end gap-2 shrink-0">
          <div
            className={`rounded-full px-2.5 py-1 text-sm font-semibold ${
              scorePercent >= 80
                ? "bg-green-100 text-green-700"
                : scorePercent >= 60
                  ? "bg-yellow-100 text-yellow-700"
                  : "bg-gray-100 text-gray-600"
            }`}
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
              className="text-xs text-gray-400 hover:text-red-500"
            >
              Dismiss
            </button>
          )}
          {match.status === "dismissed" && (
            <span className="text-xs text-gray-400">Dismissed</span>
          )}
        </div>
      </div>
    </Link>
  );
}
