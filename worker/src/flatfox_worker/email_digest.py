"""Email digest — notify users of new matches after a matching run."""

import logging
import smtplib
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

import psycopg2

from flatfox_worker.config import settings

logger = logging.getLogger(__name__)

TOP_N = 3


def _load_digest_data(conn) -> list[dict]:
    """Load users who have new matches, with their top matches."""
    with conn.cursor() as cur:
        cur.execute("""
            SELECT u.id, u.email, u.name, u.locale
            FROM users u
            JOIN matches m ON m.user_id = u.id
            WHERE m.status = 'new'
            GROUP BY u.id, u.email, u.name, u.locale
            HAVING COUNT(*) > 0
        """)
        users = []
        for row in cur.fetchall():
            users.append({
                "user_id": str(row[0]),
                "email": row[1],
                "name": row[2],
                "locale": row[3],
            })

    for user in users:
        with conn.cursor() as cur:
            cur.execute(
                """
                SELECT m.score, m.rationale,
                       COALESCE(l.public_title, l.short_title, 'Untitled'),
                       l.city, l.rent_gross
                FROM matches m
                LEFT JOIN listings l ON l.id = m.listing_id
                WHERE m.user_id = %s AND m.status = 'new'
                ORDER BY m.score DESC
                """,
                (user["user_id"],),
            )
            rows = cur.fetchall()
            user["total_new"] = len(rows)
            user["top_matches"] = [
                {
                    "score": round(r[0] * 100),
                    "rationale": r[1] or "",
                    "title": r[2] or "Untitled",
                    "city": r[3] or "Unknown",
                    "rent_gross": r[4],
                }
                for r in rows[:TOP_N]
            ]

    return users


def _build_email_body(user: dict) -> tuple[str, str]:
    """Build plain text and HTML email body."""
    name = user["name"] or "there"
    total = user["total_new"]
    top = user["top_matches"]

    subject = f"You have {total} new match{'es' if total != 1 else ''}!"

    lines = [
        f"Hi {name},",
        "",
        f"You have {total} new housing match{'es' if total != 1 else ''}. "
        f"Here are the top {min(len(top), TOP_N)}:",
        "",
    ]

    html_matches = []
    for i, m in enumerate(top, 1):
        price_str = f"CHF {m['rent_gross']}/mo" if m["rent_gross"] else "Price unknown"
        lines.append(f"  {i}. {m['title']} — {m['city']}, {price_str} ({m['score']}% match)")
        if m["rationale"]:
            lines.append(f"     {m['rationale']}")
        lines.append("")

        html_matches.append(
            f"<tr><td style='padding:8px;border-bottom:1px solid #eee'>"
            f"<strong>{m['title']}</strong><br>"
            f"{m['city']} &middot; {price_str} &middot; {m['score']}% match"
            f"{'<br><small style=\"color:#666\">' + m['rationale'] + '</small>' if m['rationale'] else ''}"
            f"</td></tr>"
        )

    if total > TOP_N:
        lines.append(f"  ...and {total - TOP_N} more.")
        lines.append("")

    lines.append("Log in to review your matches and send messages.")
    lines.append("")
    lines.append("— Flatfox Finder")

    plain = "\n".join(lines)

    html = f"""<html><body style="font-family:sans-serif;color:#333">
<p>Hi {name},</p>
<p>You have <strong>{total}</strong> new housing match{'es' if total != 1 else ''}:</p>
<table style="width:100%;border-collapse:collapse">{''.join(html_matches)}</table>
{f'<p style="color:#666">...and {total - TOP_N} more.</p>' if total > TOP_N else ''}
<p><a href="{settings.app_base_url}/dashboard" style="color:#2563eb">View all matches</a></p>
<p style="color:#999;font-size:12px">— Flatfox Finder</p>
</body></html>"""

    return subject, plain, html  # type: ignore[return-value]


def _send_email(to: str, subject: str, plain: str, html: str) -> bool:
    """Send an email via SMTP."""
    if not settings.smtp_host:
        logger.warning("SMTP not configured — skipping email to user_id (email redacted)")
        return False

    msg = MIMEMultipart("alternative")
    msg["From"] = settings.smtp_from
    msg["To"] = to
    msg["Subject"] = subject
    msg.attach(MIMEText(plain, "plain"))
    msg.attach(MIMEText(html, "html"))

    try:
        with smtplib.SMTP(settings.smtp_host, settings.smtp_port) as server:
            if settings.smtp_tls:
                server.starttls()
            if settings.smtp_user:
                server.login(settings.smtp_user, settings.smtp_password)
            server.send_message(msg)
        return True
    except Exception:
        logger.exception("Failed to send digest email (recipient redacted)")
        return False


def run_email_digest(database_url: str | None = None) -> int:
    """Send digest emails to users with new matches. Returns count sent."""
    db_url = database_url or settings.database_url
    conn = psycopg2.connect(db_url)

    try:
        users = _load_digest_data(conn)
        if not users:
            logger.info("No users with new matches — skipping digest.")
            return 0

        sent = 0
        for user in users:
            subject, plain, html = _build_email_body(user)
            if _send_email(user["email"], subject, plain, html):
                sent += 1
                logger.info("Digest sent to user_id=%s (%d new matches)", user["user_id"], user["total_new"])
            else:
                logger.warning("Digest skipped for user_id=%s", user["user_id"])

        logger.info("Email digest: %d/%d sent.", sent, len(users))
        return sent

    finally:
        conn.close()
