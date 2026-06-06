import { NextRequest, NextResponse } from "next/server";

import { getSessionUserId, unauthorized, forbidden } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { stripPii } from "@/lib/pii";
import { translateDescription } from "@/lib/translate";

export async function POST(
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
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
