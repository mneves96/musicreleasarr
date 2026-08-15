"""Recupere les derniers posts de r/navidrome pour le widget du tableau de
bord, via le flux RSS public de Reddit. L'API JSON classique (/r/x.json)
bloque desormais les requetes non authentifiees venant d'une IP de
serveur/datacenter (403 systematique, verifie manuellement) ; le flux RSS,
lui, reste accessible sans cle ni compte des lors qu'on fournit un
User-Agent explicite. Mis en cache en memoire quelques minutes pour rester
un citoyen correct de l'API et eviter un blocage similaire."""

import re
import threading
import time
import xml.etree.ElementTree as ET
from html import unescape

import httpx

REDDIT_RSS_URL = "https://www.reddit.com/r/navidrome/.rss"
USER_AGENT = "musicreleasarr/1.0 (dashboard widget; github.com/mneves96/musicreleasarr)"
CACHE_TTL_SECONDS = 600
PREVIEW_MAX_CHARS = 240

_ATOM_NS = "{http://www.w3.org/2005/Atom}"
_TAG_RE = re.compile(r"<[^>]+>")
# Le flux RSS de Reddit ajoute un pied de page "submitted by ... [link]
# [comments]" a chaque entree, redondant avec les champs author/url deja
# extraits separement - on le retire de l'apercu du contenu.
_FOOTER_RE = re.compile(r"submitted by.*", re.DOTALL)

_cache_lock = threading.Lock()
_cache: dict[str, object] = {"posts": None, "fetched_at": 0.0}


def _strip_html(html: str) -> str:
    text = _FOOTER_RE.sub("", html)
    text = _TAG_RE.sub(" ", text)
    text = unescape(text)
    return re.sub(r"\s+", " ", text).strip()


def get_navidrome_posts(limit: int = 6) -> list[dict]:
    with _cache_lock:
        cached = _cache["posts"]
        if cached is not None and time.time() - _cache["fetched_at"] < CACHE_TTL_SECONDS:
            return cached

    resp = httpx.get(
        REDDIT_RSS_URL,
        params={"limit": limit},
        headers={"User-Agent": USER_AGENT},
        timeout=10,
    )
    resp.raise_for_status()
    root = ET.fromstring(resp.text)

    posts = []
    for entry in root.findall(f"{_ATOM_NS}entry")[:limit]:
        title = entry.findtext(f"{_ATOM_NS}title") or ""
        link_el = entry.find(f"{_ATOM_NS}link")
        author = entry.findtext(f"{_ATOM_NS}author/{_ATOM_NS}name") or ""
        content_html = entry.findtext(f"{_ATOM_NS}content") or ""
        preview = _strip_html(content_html)
        if len(preview) > PREVIEW_MAX_CHARS:
            preview = preview[:PREVIEW_MAX_CHARS].rstrip() + "…"
        posts.append(
            {
                "title": title,
                "url": link_el.get("href") if link_el is not None else None,
                "author": author.removeprefix("/u/"),
                "published_at": entry.findtext(f"{_ATOM_NS}published") or entry.findtext(f"{_ATOM_NS}updated"),
                "preview": preview,
            }
        )

    with _cache_lock:
        _cache["posts"] = posts
        _cache["fetched_at"] = time.time()
    return posts
