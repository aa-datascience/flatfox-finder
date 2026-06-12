import { compare, hash } from "bcryptjs";
import { NextResponse } from "next/server";

import { getSessionUserId, unauthorized } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function PUT(request: Request) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();

  const { old_password, new_password } = await request.json();

  if (!old_password || !new_password) {
    return NextResponse.json(
      { error: "Both old and new passwords are required" },
      { status: 400 }
    );
  }

  if (typeof new_password !== "string" || new_password.length < 8) {
    return NextResponse.json(
      { error: "New password must be at least 8 characters" },
      { status: 400 }
    );
  }

  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return unauthorized();

  const valid = await compare(old_password, user.passwordHash);
  if (!valid) {
    return NextResponse.json(
      { error: "Current password is incorrect" },
      { status: 403 }
    );
  }

  const passwordHash = await hash(new_password, 12);
  await prisma.user.update({
    where: { id: userId },
    data: { passwordHash },
  });

  return NextResponse.json({ success: true });
}
