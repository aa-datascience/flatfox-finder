import re

EMAIL_RE = re.compile(r"[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}")
PHONE_RE = re.compile(
    r"(?:\+\d{1,3}[\s\-]?)?"
    r"(?:\(?\d{2,4}\)?[\s\-]?)?"
    r"\d{3}[\s\-]?\d{2}[\s\-]?\d{2}"
)


def strip_pii(text: str, names: list[str] | None = None) -> str:
    result = EMAIL_RE.sub("[EMAIL]", text)
    result = PHONE_RE.sub("[PHONE]", result)
    for name in names or []:
        if name and len(name) >= 2:
            result = result.replace(name, "[NAME]")
    return result
