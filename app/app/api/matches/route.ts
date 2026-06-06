import { NextRequest, NextResponse } from "next/server";

import { getSessionUserId, unauthorized } from "@/lib/auth";
import { prisma } from "@/lib/db";

export async function GET(request: NextRequest) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();

  const { searchParams } = new URL(request.url);
  const statusFilter = searchParams.get("status");
  const sort = searchParams.get("sort") ?? "score";
  const page = Math.max(1, Number(searchParams.get("page") ?? "1"));
  const limit = Math.min(50, Math.max(1, Number(searchParams.get("limit") ?? "20")));
  const offset = (page - 1) * limit;

  const where: Record<string, unknown> = { userId };
  if (statusFilter) {
    where.status = { in: statusFilter.split(",") };
  }

  const orderBy =
    sort === "date"
      ? { createdAt: "desc" as const }
      : { score: "desc" as const };

  const [matches, total] = await Promise.all([
    prisma.match.findMany({
      where,
      orderBy,
      skip: offset,
      take: limit,
      include: {
        listing: {
          select: {
            id: true,
            slug: true,
            url: true,
            status: true,
            publicTitle: true,
            shortTitle: true,
            city: true,
            zipcode: true,
            rentNet: true,
            rentCharges: true,
            rentGross: true,
            numberOfRooms: true,
            surfaceLiving: true,
            isFurnished: true,
            movingDate: true,
            reserved: true,
          },
        },
      },
    }),
    prisma.match.count({ where }),
  ]);

  return NextResponse.json({ matches, total, page });
}
