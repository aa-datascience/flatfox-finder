import Anthropic from "@anthropic-ai/sdk";
import { franc } from "franc";
import { NextRequest, NextResponse } from "next/server";

import { getSessionUserId, unauthorized, forbidden } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { stripPii } from "@/lib/pii";
import { consumeRateLimit } from "@/lib/rate-limit";
import {
  buildDraftUserMessage,
  DRAFT_MESSAGE_SYSTEM,
  substitutePlaceholders,
} from "@/lib/prompts/draft_message";

const DRAFT_MODEL = "claude-sonnet-4-5-20250929";

const RATE_LIMIT = 30;
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

const LOCALE_NAMES: Record<string, string> = {
  en: "English",
  de: "German",
  fr: "French",
  it: "Italian",
};

const FRANC_TO_ISO: Record<string, string> = {
  deu: "de",
  fra: "fr",
  ita: "it",
  eng: "en",
};

function detectLang(text: string): string | null {
  const result = franc(text, { minLength: 20 });
  if (result === "und") return null;
  return FRANC_TO_ISO[result] ?? result;
}

function resolveMessageLanguage(
  preference: string,
  userLocale: string,
  descriptionLang: string | null,
): string {
  switch (preference) {
    case "english":
      return "English";
    case "my_language":
      return LOCALE_NAMES[userLocale] ?? "English";
    case "description":
    default:
      if (descriptionLang && LOCALE_NAMES[descriptionLang]) {
        return LOCALE_NAMES[descriptionLang];
      }
      return "the same language as the listing description";
  }
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();

  const rl = consumeRateLimit(`ai:draft:${userId}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many message drafts in a short time. Please try again later." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } }
    );
  }

  const { id: matchId } = await params;

  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      listing: true,
      user: {
        include: { profile: true },
      },
    },
  });

  if (!match) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }

  if (match.userId !== userId) return forbidden();

  if (!match.listing) {
    return NextResponse.json(
      { error: "Listing no longer available" },
      { status: 410 }
    );
  }

  const user = match.user;
  const profile = user.profile;

  if (!profile) {
    return NextResponse.json(
      { error: "Profile not found" },
      { status: 400 }
    );
  }

  const sanitizedDescription = stripPii(match.listing.description ?? "");
  const sanitizedTitle = stripPii(match.listing.publicTitle ?? "");

  const messagePref = profile.messageLanguage ?? "description";
  const descriptionLang = detectLang(sanitizedDescription);

  const writeInLanguage = resolveMessageLanguage(
    messagePref,
    user.locale,
    descriptionLang,
  );

  const userMessage = buildDraftUserMessage({
    publicTitle: sanitizedTitle,
    description: sanitizedDescription,
    city: match.listing.city ?? "",
    rentGross: match.listing.rentGross,
    numberOfRooms: match.listing.numberOfRooms,
    studentName: "{STUDENT_NAME}",
    studentProgram: "{STUDENT_PROGRAM}",
    studentLanguage: user.locale,
    budgetMax: profile.budgetMax,
    moveInFrom: profile.moveInFrom?.toISOString().split("T")[0] ?? null,
    rationale: match.rationale ?? "",
    writeInLanguage,
    aboutMe: profile.rawText ? stripPii(profile.rawText) : null,
  });

  try {
    const client = new Anthropic();
    const response = await client.messages.create({
      model: DRAFT_MODEL,
      max_tokens: 500,
      system: DRAFT_MESSAGE_SYSTEM,
      messages: [{ role: "user", content: userMessage }],
    });

    const rawBody =
      response.content[0].type === "text" ? response.content[0].text : "";

    const messageBody = substitutePlaceholders(rawBody, {
      name: user.name,
      program: profile.studyProgram ?? "",
      language: user.locale,
    });

    const resolvedLang = descriptionLang ?? user.locale;

    await prisma.message.create({
      data: {
        matchId: match.id,
        userId: user.id,
        body: messageBody,
        language: resolvedLang,
        mode: "review",
        status: "draft",
      },
    });

    return NextResponse.json({
      message_body: messageBody,
      language: writeInLanguage,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : String(error);
    console.error("[draft] generation failed:", msg);
    return NextResponse.json(
      { error: "Couldn't draft a message right now. Please try again." },
      { status: 500 }
    );
  }
}
