"""Envoi des notifications de nouvelle release, par email et/ou Pushbullet."""

import smtplib
from email.mime.text import MIMEText

import httpx

from ..models import Artist, Release, Settings


def build_message(artist: Artist, release: Release) -> tuple[str, str]:
    subject = f"Nouvelle sortie : {artist.name} - {release.title}"
    date_str = release.release_date.isoformat() if release.release_date else "date inconnue"
    lines = [
        f"{artist.name} vient de sortir : {release.title} ({release.release_type.value})",
        f"Date de sortie : {date_str}",
    ]
    if release.ownership_status.value == "owned":
        lines.append("Deja presente dans ta bibliotheque Navidrome.")
    elif release.download_status.value == "queued":
        lines.append("Absente de ta bibliotheque : telechargement lance automatiquement via MeTube.")
    elif release.ownership_status.value == "unknown":
        lines.append("Presence dans ta bibliotheque pas encore verifiee.")
    else:
        lines.append("Absente de ta bibliotheque.")
    if release.youtube_music_url:
        lines.append(f"YouTube Music : {release.youtube_music_url}")
    return subject, "\n".join(lines)


def send_email(settings: Settings, subject: str, body: str) -> tuple[bool, str]:
    if not (settings.smtp_host and settings.smtp_from and settings.smtp_to):
        return False, "Parametres SMTP incomplets"
    try:
        msg = MIMEText(body)
        msg["Subject"] = subject
        msg["From"] = settings.smtp_from
        msg["To"] = settings.smtp_to

        with smtplib.SMTP(settings.smtp_host, settings.smtp_port or 587, timeout=15) as server:
            server.starttls()
            if settings.smtp_user and settings.smtp_password:
                server.login(settings.smtp_user, settings.smtp_password)
            server.sendmail(settings.smtp_from, [settings.smtp_to], msg.as_string())
        return True, "Email envoye"
    except (smtplib.SMTPException, OSError) as exc:
        return False, f"Echec envoi email : {exc}"


def send_pushbullet(settings: Settings, title: str, body: str) -> tuple[bool, str]:
    if not settings.pushbullet_token:
        return False, "Token Pushbullet manquant"
    try:
        resp = httpx.post(
            "https://api.pushbullet.com/v2/pushes",
            headers={"Access-Token": settings.pushbullet_token},
            json={"type": "note", "title": title, "body": body},
            timeout=10,
        )
        resp.raise_for_status()
        return True, "Notification Pushbullet envoyee"
    except httpx.HTTPError as exc:
        return False, f"Echec Pushbullet : {exc}"


def notify_new_release(settings: Settings, artist: Artist, release: Release) -> None:
    subject, body = build_message(artist, release)
    if settings.notify_email_enabled:
        send_email(settings, subject, body)
    if settings.notify_pushbullet_enabled:
        send_pushbullet(settings, subject, body)
