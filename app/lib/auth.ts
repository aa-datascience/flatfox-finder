import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

import { authOptions } from "@/lib/auth-options";

export async function getSessionUserId(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  const user = session?.user as { id?: string } | undefined;
  return user?.id ?? null;
}

export function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export function forbidden() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
