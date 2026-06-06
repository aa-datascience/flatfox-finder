import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

import { getSessionUserId, unauthorized, forbidden } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { stripPii } from "@/lib/pii";
import {
  buildTranslateUserMessage,
  TRANSLATE_DESCRIPTION_SYSTEM,
} from "@/lib/prompts/translate_description";

const TRANSLATE_MODEL = "claude-haiku-4-5-20251001";

const LOCALE_NAMES: Record<string, string> = {
  en: "English",
  de: "German",
  fr: "French",
  it: "Italian",
};

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
  const targetLocale = user?.locale ?? "en";
  const targetLanguage = LOCALE_NAMES[targetLocale] ?? "English";

  const sanitized = stripPii(match.listing.description);

  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: TRANSLATE_MODEL,
      max_tokens: 1000,
      system: TRANSLATE_DESCRIPTION_SYSTEM,
      messages: [
        {
          role: "user",
          content: buildTranslateUserMessage({
            description: sanitized,
            targetLanguage,
          }),
        },
      ],
    });

    const rawText =
      response.content[0].type === "text" ? response.content[0].text : "";

    const langMatch = rawText.match(/\[lang:(\w{2})\]\s*$/);
    const originalLang = langMatch?.[1] ?? null;
    const translatedText = rawText.replace(/\[lang:\w{2}\]\s*$/, "").trim();

    return NextResponse.json({
      translated: translatedText,
      original_language: originalLang,
      target_language: targetLocale,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[translate] failed:", msg);
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
