const EMAIL_RE = /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;
const PHONE_RE =
  /(?:\+\d{1,3}[\s-]?)?(?:\(?\d{2,4}\)?[\s-]?)?\d{3}[\s-]?\d{2}[\s-]?\d{2}/g;

export function stripPii(text: string, names?: string[]): string {
  let result = text.replace(EMAIL_RE, "[EMAIL]").replace(PHONE_RE, "[PHONE]");
  for (const name of names ?? []) {
    if (name && name.length >= 2) {
      result = result.replaceAll(name, "[NAME]");
    }
  }
  return result;
}
