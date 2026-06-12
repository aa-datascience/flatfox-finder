import { NextRequest, NextResponse } from "next/server";

import { getSessionUserId, unauthorized, forbidden } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { stripPii } from "@/lib/pii";
import { consumeRateLimit } from "@/lib/rate-limit";
import { translateDescription } from "@/lib/translate";

const RATE_LIMIT = 60;
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();

  const rl = consumeRateLimit(`ai:translate:${userId}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } }
    );
  }

  const { id: matchId } = await params;

  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: { listing: true },
  });

  if (!match) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }
  if (match.userId !== userId) return forbidden();

  if (!match.listing?.description) {
    return NextResponse.json(
      { error: "No description to translate" },
      { status: 400 }
    );
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  const targetLang = user?.locale ?? "en";

  const sanitized = stripPii(match.listing.description);

  try {
    const result = await translateDescription(sanitized, targetLang);

    return NextResponse.json({
      translated: result.text,
      original_language: result.originalLanguage,
      target_language: targetLang,
      was_translated: result.wasTranslated,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[translate] failed:", msg);
    return NextResponse.json(
      { error: "Couldn't translate the description right now." },
      { status: 500 }
    );
  }
}
