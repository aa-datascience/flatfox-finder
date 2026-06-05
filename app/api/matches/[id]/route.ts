import { NextRequest, NextResponse } from "next/server";

import { getSessionUserId, unauthorized, forbidden } from "@/lib/auth";
import { prisma } from "@/lib/db";

const VALID_STATUSES = ["new", "seen", "contacted", "dismissed"];

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();

  const { id: matchId } = await params;

  const match = await prisma.match.findUnique({
    where: { id: matchId },
    include: {
      listing: {
        include: { attributes: true },
      },
      messages: {
        orderBy: { id: "desc" },
        take: 1,
      },
    },
  });

  if (!match) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }
  if (match.userId !== userId) return forbidden();

  if (match.status === "new") {
    await prisma.match.update({
      where: { id: matchId },
      data: { status: "seen" },
    });
  }

  const messageDraft = match.messages[0]?.body ?? null;

  return NextResponse.json({
    match: {
      id: match.id,
      score: match.score,
      scoreBreakdown: match.scoreBreakdown,
      rationale: match.rationale,
      status: match.status === "new" ? "seen" : match.status,
      listingSnapshot: match.listingSnapshot,
      createdAt: match.createdAt,
    },
    listing: match.listing,
    attributes: match.listing?.attributes ?? null,
    message_draft: messageDraft,
  });
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();

  const { id: matchId } = await params;
  const { status } = await request.json();

  if (!status || !VALID_STATUSES.includes(status)) {
    return NextResponse.json(
      { error: `Invalid status. Must be one of: ${VALID_STATUSES.join(", ")}` },
      { status: 400 }
    );
  }

  const match = await prisma.match.findUnique({ where: { id: matchId } });
  if (!match) {
    return NextResponse.json({ error: "Match not found" }, { status: 404 });
  }
  if (match.userId !== userId) return forbidden();

  const updated = await prisma.match.update({
    where: { id: matchId },
    data: { status },
  });

  return NextResponse.json({ match: updated });
}
