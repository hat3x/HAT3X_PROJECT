"""Slug de salón: slugify + unicidad."""
import re, unicodedata

def slugify(name: str) -> str:
    s = unicodedata.normalize("NFD", str(name or "")).encode("ascii", "ignore").decode("ascii")
    s = re.sub(r"[^a-zA-Z0-9]+", "-", s).strip("-").lower()
    return re.sub(r"-+", "-", s)

def ensure_unique(base: str, existing: set) -> str:
    if base not in existing:
        return base
    i = 2
    while f"{base}-{i}" in existing:
        i += 1
    return f"{base}-{i}"
