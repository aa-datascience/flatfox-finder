import { hash } from "bcrypt";
import { NextRequest, NextResponse } from "next/server";

import { prisma } from "@/lib/db";

const BCRYPT_ROUNDS = 12;
const MIN_PASSWORD_LENGTH = 8;
const VALID_LOCALES = ["de", "fr", "en", "it"];

export async function POST(request: NextRequest) {
  let body: { email?: string; password?: string; name?: string; locale?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { email, password, name, locale } = body;

  if (!email || !password || !name) {
    return NextResponse.json(
      { error: "email, password, and name are required" },
      { status: 400 }
    );
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters` },
      { status: 400 }
    );
  }

  const userLocale = locale && VALID_LOCALES.includes(locale) ? locale : "en";

  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    return NextResponse.json(
      { error: "An account with this email already exists" },
      { status: 409 }
    );
  }

  const passwordHash = await hash(password, BCRYPT_ROUNDS);

  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      name,
      locale: userLocale,
    },
  });

  return NextResponse.json({ user_id: user.id }, { status: 201 });
}
