import { NextRequest, NextResponse } from "next/server";

import { getSessionUserId, unauthorized, forbidden } from "@/lib/auth";
import { prisma } from "@/lib/db";

const FLATFOX_BASE = "https://flatfox.ch";

interface FlatfoxImage {
  pk: number;
  caption: string;
  url: string;
  url_thumb_m: string;
  url_listing_search: string;
  ordering: number;
  width: number;
  height: number;
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();

  const { id: matchId } = await params;

  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: { listing: true },
  });

  if (!match) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }
  if (match.userId !== userId) return forbidden();
  if (!match.listing) {
    return NextResponse.json({ images: [] });
  }

  try {
    const res = await fetch(
      `${FLATFOX_BASE}/api/v1/public-listing/${match.listing.id}/?expand=images`,
      { next: { revalidate: 3600 } }
    );

    if (!res.ok) {
      return NextResponse.json({ images: [] });
    }

    const data = await res.json();
    const images: FlatfoxImage[] = data.images ?? [];

    const mapped = images
      .sort((a: FlatfoxImage, b: FlatfoxImage) => a.ordering - b.ordering)
      .map((img: FlatfoxImage) => ({
        url: `${FLATFOX_BASE}${img.url}`,
        thumb: `${FLATFOX_BASE}${img.url_listing_search || img.url_thumb_m || img.url}`,
        caption: img.caption || null,
        width: img.width,
        height: img.height,
      }));

    return NextResponse.json({ images: mapped });
  } catch {
    return NextResponse.json({ images: [] });
  }
}
