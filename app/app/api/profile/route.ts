import { NextResponse } from "next/server";

import { getSessionUserId, unauthorized } from "@/lib/auth";
import { prisma } from "@/lib/db";
import { runMatchingForUser } from "@/lib/matcher";

export async function GET() {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();

  const profile = await prisma.userProfile.findUnique({
    where: { userId },
  });

  return NextResponse.json({ profile });
}

export async function PUT(request: Request) {
  const userId = await getSessionUserId();
  if (!userId) return unauthorized();

  const body = await request.json();

  const data = {
    inputMode: body.input_mode ?? "form",
    rawText: body.raw_text ?? null,
    studyProgram: body.study_program ?? null,
    budgetMax: body.budget_max != null ? Number(body.budget_max) : null,
    roomsMin: body.rooms_min != null ? Number(body.rooms_min) : null,
    cities: Array.isArray(body.cities) ? body.cities : [],
    radiusKm: body.radius_km != null ? Number(body.radius_km) : 10,
    moveInFrom: body.move_in_from ? new Date(body.move_in_from) : null,
    moveInFlexible: body.move_in_flexible ?? true,
    furnishedPref: body.furnished_pref ?? null,
    languages: Array.isArray(body.languages) ? body.languages : [],
    vibe: body.vibe ?? null,
    maxFlatmates: body.max_flatmates != null ? Number(body.max_flatmates) : null,
    petsOk: body.pets_ok ?? null,
    smokingOk: body.smoking_ok ?? null,
    genderPref: body.gender_pref ?? null,
    messageLanguage: body.message_language ?? "description",
  };

  const profile = await prisma.userProfile.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });

  // Re-score listings against the updated preferences. This reconciles
  // incrementally — it refreshes scores and adds/removes matches without
  // wiping contacted history, dismissals, or saved message drafts.
  await runMatchingForUser(userId);

  if (body.name || body.locale) {
    await prisma.user.update({
      where: { id: userId },
      data: {
        ...(body.name ? { name: body.name } : {}),
        ...(body.locale ? { locale: body.locale } : {}),
      },
    });
  }

  return NextResponse.json({ profile });
}
