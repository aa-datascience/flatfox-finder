import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";

export async function GET() {
  try {
    const client = new Anthropic();
    const models = await client.models.list();
    return NextResponse.json({ models: models.data.map((m) => m.id) });
  } catch (e) {
    return NextResponse.json({ error: String(e) }, { status: 500 });
  }
}
