"""Recupere les dernieres releases GitHub (flux Atom natif, aucune cle
necessaire) des projets dont l'app depend directement - Navidrome, MeTube -
pour reperer une mise a jour disponible sans avoir a suivre chaque repo a la
main. Meme principe de cache que services/reddit.py, avec un TTL plus large
puisque des releases sortent bien moins souvent que des posts de forum."""

import re
import threading
import time
import xml.etree.ElementTree as ET
from html import unescape

import httpx

USER_AGENT = "musicreleasarr/1.0 (dashboard widget; github.com/mneves96/musicreleasarr)"
CACHE_TTL_SECONDS = 1800
PREVIEW_MAX_CHARS = 240

_ATOM_NS = "{http://www.w3.org/2005/Atom}"
_TAG_RE = re.compile(r"<[^>]+>")

_cache_lock = threading.Lock()
_cache: dict[str, dict] = {}


def _strip_html(html: str) -> str:
    text = _TAG_RE.sub(" ", html)
    text = unescape(text)
    return re.sub(r"\s+", " ", text).strip()


def get_latest_releases(repo: str, limit: int = 4) -> list[dict]:
    """repo au format "owner/name", ex. "navidrome/navidrome"."""
    with _cache_lock:
        cached = _cache.get(repo)
        if cached is not None and time.time() - cached["fetched_at"] < CACHE_TTL_SECONDS:
            return cached["releases"]

    resp = httpx.get(
        f"https://github.com/{repo}/releases.atom",
        headers={"User-Agent": USER_AGENT},
        timeout=10,
    )
    resp.raise_for_status()
    root = ET.fromstring(resp.text)

    releases = []
    for entry in root.findall(f"{_ATOM_NS}entry")[:limit]:
        title = entry.findtext(f"{_ATOM_NS}title") or ""
        link_el = entry.find(f"{_ATOM_NS}link")
        content_html = entry.findtext(f"{_ATOM_NS}content") or ""
        preview = _strip_html(content_html)
        if len(preview) > PREVIEW_MAX_CHARS:
            preview = preview[:PREVIEW_MAX_CHARS].rstrip() + "…"
        releases.append(
            {
                "version": title,
                "url": link_el.get("href") if link_el is not None else None,
                "published_at": entry.findtext(f"{_ATOM_NS}published") or entry.findtext(f"{_ATOM_NS}updated"),
                "preview": preview,
            }
        )

    with _cache_lock:
        _cache[repo] = {"releases": releases, "fetched_at": time.time()}
    return releases
