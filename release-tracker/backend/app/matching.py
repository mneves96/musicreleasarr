"""Normalisation de texte et correspondance floue, utilisees pour reconcilier
les noms d'artistes/titres entre MusicBrainz, Deezer, Last.fm, YouTube Music et Navidrome."""

import re
import unicodedata
from difflib import SequenceMatcher

_PUNCT_RE = re.compile(r"[^\w\s]")
_WS_RE = re.compile(r"\s+")


def normalize_text(value: str) -> str:
    value = unicodedata.normalize("NFKD", value)
    value = "".join(c for c in value if not unicodedata.combining(c))
    value = value.lower()
    value = _PUNCT_RE.sub(" ", value)
    value = _WS_RE.sub(" ", value).strip()
    return value


def similarity(a: str, b: str) -> float:
    return SequenceMatcher(None, normalize_text(a), normalize_text(b)).ratio()


def best_match(target: str, candidates: list[str], threshold: float = 0.82) -> int | None:
    """Retourne l'index du meilleur candidat au-dessus du seuil, sinon None."""
    best_idx, best_score = None, 0.0
    for idx, candidate in enumerate(candidates):
        score = similarity(target, candidate)
        if score > best_score:
            best_idx, best_score = idx, score
    return best_idx if best_score >= threshold else None
