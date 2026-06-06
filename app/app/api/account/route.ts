import { NextResponse } from "next/server";

import { getSessionUserId, unauthorized } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function DELETE(request: Request) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();

  const { confirm } = await request.json();

  if (confirm !== true) {
    return NextResponse.json(
      { error: "Confirmation required" },
      { status: 400 }
    );
  }

  await prisma.user.delete({ where: { id: userId } });

  return NextResponse.json({ success: true });
}
