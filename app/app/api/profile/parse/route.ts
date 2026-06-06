import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

import { getSessionUserId, unauthorized } from "@/lib/auth";
import { stripPii } from "@/lib/pii";
import {
  PARSE_PROFILE_SYSTEM,
  type ParsedPreferences,
} from "@/lib/prompts/parse_profile";

const anthropic = new Anthropic();

export async function POST(request: Request) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();

  const { raw_text } = await request.json();
  if (!raw_text || typeof raw_text !== "string") {
    return NextResponse.json(
      { error: "raw_text is required" },
      { status: 400 }
    );
  }

  const sanitized = stripPii(raw_text);

  try {
    const response = await anthropic.messages.create({
      model: "claude-3-5-haiku-20241022",
      max_tokens: 512,
      system: PARSE_PROFILE_SYSTEM,
      messages: [{ role: "user", content: sanitized }],
    });

    const text =
      response.content[0].type === "text" ? response.content[0].text : "";
    const parsed: ParsedPreferences = JSON.parse(text);

    return NextResponse.json({ parsed_prefs: parsed });
  } catch {
    return NextResponse.json(
      { error: "Failed to parse preferences. Please try again." },
      { status: 500 }
    );
  }
}
