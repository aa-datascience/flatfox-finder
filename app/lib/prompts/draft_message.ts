export const DRAFT_MESSAGE_SYSTEM = `You write a short, friendly contact message from a student to a landlord/flatmate
about a housing listing. The message should:
- Be 3–5 sentences.
- Be warm and personal, not formal or generic.
- Mention 1–2 specific things about the listing that match the student's profile.
- Briefly introduce the student using the placeholders provided ({STUDENT_NAME}, {STUDENT_PROGRAM}).
- End with a polite request to visit or chat.
- Be written in the SAME LANGUAGE as the listing description.
- Do NOT include a subject line.`;

export function buildDraftUserMessage(params: {
  publicTitle: string;
  description: string;
  city: string;
  rentGross: number | null;
  numberOfRooms: number | null;
  studentName: string;
  studentProgram: string;
  studentLanguage: string;
  budgetMax: number | null;
  moveInFrom: string | null;
  rationale: string;
}): string {
  return `Listing title: ${params.publicTitle}
Listing description: ${params.description}
Listing city: ${params.city}, rent: CHF ${params.rentGross ?? "unknown"}/mo, rooms: ${params.numberOfRooms ?? "unknown"}
Student profile: {STUDENT_NAME}, studying {STUDENT_PROGRAM}, speaks ${params.studentLanguage}, budget CHF ${params.budgetMax ?? "unknown"}/mo, moving from ${params.moveInFrom ?? "flexible"}
Match rationale: ${params.rationale}`;
}

export function substitutePlaceholders(
  text: string,
  values: { name: string; program: string; language: string }
): string {
  return text
    .replace(/\{STUDENT_NAME\}/g, values.name)
    .replace(/\{STUDENT_PROGRAM\}/g, values.program)
    .replace(/\{STUDENT_LANGUAGE\}/g, values.language);
}
