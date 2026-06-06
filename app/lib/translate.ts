import { franc } from "franc";
import { translate } from "@vitalets/google-translate-api";

const LANG_SEPARATORS = [
  /\n\s*[-–—]{3,}\s*\n/,       // --- or ——— on its own line
  /\n\s*[=]{3,}\s*\n/,          // ===
  /\n\s*[*]{3,}\s*\n/,          // ***
  /\n{3,}/,                     // 3+ blank lines
  /\n\s*\n\s*\n/,               // double blank line
];

const LANG_HEADERS =
  /^(deutsch|français|french|german|english|italiano|italian|en|de|fr|it)\s*[:：]/im;

const FRANC_TO_ISO: Record<string, string> = {
  deu: "de",
  fra: "fr",
  ita: "it",
  eng: "en",
  spa: "es",
  por: "pt",
  nld: "nl",
  ron: "ro",
};

function francToIso(code: string): string {
  return FRANC_TO_ISO[code] ?? code;
}

function detectLang(text: string): string | null {
  const trimmed = text.trim();
  if (trimmed.length < 20) return null;
  const result = franc(trimmed, { minLength: 20 });
  if (result === "und") return null;
  return francToIso(result);
}

function splitBilingual(text: string): string[] {
  if (LANG_HEADERS.test(text)) {
    const parts = text.split(LANG_HEADERS).filter((p) => p.trim().length > 30);
    if (parts.length >= 2) return parts.map((p) => p.trim());
  }

  for (const sep of LANG_SEPARATORS) {
    const parts = text.split(sep).filter((p) => p.trim().length > 30);
    if (parts.length >= 2) {
      const lang1 = detectLang(parts[0]);
      const lang2 = detectLang(parts[1]);
      if (lang1 && lang2 && lang1 !== lang2) {
        return parts.map((p) => p.trim());
      }
    }
  }

  return [text];
}

function pickBestChunk(chunks: string[], targetLang: string): string {
  if (chunks.length === 1) return chunks[0];

  for (const chunk of chunks) {
    const lang = detectLang(chunk);
    if (lang === targetLang) return chunk;
  }

  return chunks[0];
}

export interface TranslationResult {
  text: string;
  originalLanguage: string | null;
  wasTranslated: boolean;
}

export async function translateDescription(
  description: string,
  targetLang: string
): Promise<TranslationResult> {
  const chunks = splitBilingual(description);
  const bestChunk = pickBestChunk(chunks, targetLang);
  const detectedLang = detectLang(bestChunk);

  if (detectedLang === targetLang) {
    return {
      text: bestChunk,
      originalLanguage: detectedLang,
      wasTranslated: false,
    };
  }

  try {
    const result = await translate(bestChunk, { to: targetLang });
    return {
      text: result.text,
      originalLanguage: detectedLang,
      wasTranslated: true,
    };
  } catch {
    return {
      text: bestChunk,
      originalLanguage: detectedLang,
      wasTranslated: false,
    };
  }
}
