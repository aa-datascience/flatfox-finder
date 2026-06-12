import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

import { getSessionUserId, unauthorized } from "@/lib/auth";
import { consumeRateLimit } from "@/lib/rate-limit";
import { stripPii } from "@/lib/pii";
import {
  PARSE_PROFILE_SYSTEM,
  type ParsedPreferences,
} from "@/lib/prompts/parse_profile";

const anthropic = new Anthropic();

const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 60 * 60 * 1000; // 1 hour

export async function POST(request: Request) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();

  const rl = consumeRateLimit(`ai:parse:${userId}`, RATE_LIMIT, RATE_WINDOW_MS);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Too many requests. Please try again later." },
      { status: 429, headers: { "Retry-After": String(rl.retryAfterSec) } }
    );
  }

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
      model: "claude-haiku-4-5-20251001",
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
