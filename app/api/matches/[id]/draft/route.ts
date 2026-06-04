import Anthropic from "@anthropic-ai/sdk";
import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";
import { stripPii } from "@/lib/pii";
import {
  buildDraftUserMessage,
  DRAFT_MESSAGE_SYSTEM,
  substitutePlaceholders,
} from "@/lib/prompts/draft_message";

const DRAFT_MODEL = "claude-sonnet-4-6-20250514";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: matchId } = await params;

  // Auth: get session user
  // TODO task 8: replace with proper NextAuth session check
  // For now, load the match and trust the caller
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

    // Save as draft message
    await prisma.message.create({
      data: {
        matchId: match.id,
        userId: user.id,
        body: messageBody,
        language: user.locale,
        mode: "review",
        status: "draft",
      },
    });

    return NextResponse.json({ message_body: messageBody });
  } catch (error) {
    console.error("Draft generation failed:", error);
    return NextResponse.json(
      { error: "Failed to generate message draft. Please try again." },
      { status: 500 }
    );
  }
}
