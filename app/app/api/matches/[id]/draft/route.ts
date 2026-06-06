import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

import { getSessionUserId, unauthorized, forbidden } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { stripPii } from "@/lib/pii";
import {
  buildDraftUserMessage,
  DRAFT_MESSAGE_SYSTEM,
  substitutePlaceholders,
} from "@/lib/prompts/draft_message";

const DRAFT_MODEL = "claude-sonnet-4-5-20250929";

const LOCALE_NAMES: Record<string, string> = {
  en: "English",
  de: "German",
  fr: "French",
  it: "Italian",
};

function resolveMessageLanguage(
  preference: string,
  userLocale: string,
  descriptionLang: string | null,
): string {
  switch (preference) {
    case "english":
      return "English";
    case "my_language": {
      const userLang = LOCALE_NAMES[userLocale] ?? "English";
      if (descriptionLang && LOCALE_NAMES[descriptionLang] === userLang) {
        return userLang;
      }
      return userLang;
    }
    case "description":
    default:
      if (descriptionLang && LOCALE_NAMES[descriptionLang]) {
        return LOCALE_NAMES[descriptionLang];
      }
      return "the same language as the listing description";
  }
}

async function detectDescriptionLanguage(
  client: Anthropic,
  description: string,
): Promise<string | null> {
  try {
    const resp = await client.messages.create({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 10,
      messages: [
        {
          role: "user",
          content: `What language is this text written in? Reply with ONLY the 2-letter ISO code (de, fr, it, en, etc). If bilingual, pick the primary one.\n\n${description.slice(0, 500)}`,
        },
      ],
    });
    const code = resp.content[0].type === "text" ? resp.content[0].text.trim().toLowerCase().slice(0, 2) : null;
    return code;
  } catch {
    return null;
  }
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();

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

  const client = new Anthropic();

  const messagePref = profile.messageLanguage ?? "description";
  let descriptionLang: string | null = null;
  if (messagePref === "description" || messagePref === "my_language") {
    descriptionLang = await detectDescriptionLanguage(client, sanitizedDescription);
  }

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
  });

  try {
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
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
