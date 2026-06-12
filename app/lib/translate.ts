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

// A description translated to a given language is deterministic, so cache the
// result. The match-detail page asks for a translation on every open, and the
// underlying (unofficial) Google Translate call is slow and rate-limit-prone —
// this collapses repeat views of the same listing into a single call.
//
// In-process and per-instance: it survives only for the lifetime of the server
// process. A shared/persistent cache (e.g. a listing_translations table) is the
// durable version of this.
const CACHE_MAX = 500;
const cache = new Map<string, TranslationResult>();

function cacheGet(key: string): TranslationResult | undefined {
  const hit = cache.get(key);
  if (hit !== undefined) {
    // Refresh recency for simple LRU eviction.
    cache.delete(key);
    cache.set(key, hit);
  }
  return hit;
}

function cacheSet(key: string, value: TranslationResult): void {
  cache.set(key, value);
  if (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest !== undefined) cache.delete(oldest);
  }
}

export async function translateDescription(
  description: string,
  targetLang: string
): Promise<TranslationResult> {
  const cacheKey = `${targetLang}::${description}`;
  const cached = cacheGet(cacheKey);
  if (cached !== undefined) return cached;

  const chunks = splitBilingual(description);
  const bestChunk = pickBestChunk(chunks, targetLang);
  const detectedLang = detectLang(bestChunk);

  if (detectedLang === targetLang) {
    const result: TranslationResult = {
      text: bestChunk,
      originalLanguage: detectedLang,
      wasTranslated: false,
    };
    cacheSet(cacheKey, result);
    return result;
  }

  try {
    const result = await translate(bestChunk, { to: targetLang });
    const out: TranslationResult = {
      text: result.text,
      originalLanguage: detectedLang,
      wasTranslated: true,
    };
    cacheSet(cacheKey, out);
    return out;
  } catch {
    // Don't cache failures — let the next view retry.
    return {
      text: bestChunk,
      originalLanguage: detectedLang,
      wasTranslated: false,
    };
  }
}
