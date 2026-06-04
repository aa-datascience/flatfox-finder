import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";

export async function getSessionUserId(): Promise<string | null> {
  const session = await getServerSession();
  if (!session?.user?.email) return null;
  // Will be replaced with proper user ID lookup in task 8
  return null;
}

export function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

export function forbidden() {
  return NextResponse.json({ error: "Forbidden" }, { status: 403 });
}
