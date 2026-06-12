import { compare } from "bcryptjs";
import { NextResponse } from "next/server";

import { getSessionUserId, unauthorized } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function DELETE(request: Request) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();

  let body: { password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  if (!body.password) {
    return NextResponse.json(
      { error: "Password is required to delete your account" },
      { status: 400 }
    );
  }

  // Re-authenticate before this irreversible, destructive action so a session
  // left open on a shared device can't be used to wipe the account.
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return unauthorized();

  const valid = await compare(body.password, user.passwordHash);
  if (!valid) {
    return NextResponse.json(
      { error: "Incorrect password" },
      { status: 403 }
    );
  }

  await prisma.user.delete({ where: { id: userId } });

  return NextResponse.json({ success: true });
}
