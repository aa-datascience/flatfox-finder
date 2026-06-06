import { NextRequest, NextResponse } from "next/server";

import { getSessionUserId, unauthorized, forbidden } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();

  const { id: matchId } = await params;
  const { body } = await request.json();

  if (!body || typeof body !== "string") {
    return NextResponse.json(
      { error: "Message body is required" },
      { status: 400 }
    );
  }

  const match = await prisma.match.findUnique({ where: { id: matchId } });
  if (!match) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }
  if (match.userId !== userId) return forbidden();

  const existing = await prisma.message.findFirst({
    where: { matchId, userId },
    orderBy: { id: "desc" },
  });

  let message;
  if (existing) {
    message = await prisma.message.update({
      where: { id: existing.id },
      data: { body },
    });
  } else {
    message = await prisma.message.create({
      data: {
        matchId,
        userId,
        body,
        language: "en",
        mode: "review",
        status: "draft",
      },
    });
  }

  return NextResponse.json({ message });
}
