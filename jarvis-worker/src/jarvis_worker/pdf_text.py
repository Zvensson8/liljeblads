from __future__ import annotations

from pathlib import Path

from pypdf import PdfReader


def extract_text_from_pdf(path: Path, max_chars: int = 80_000) -> str:
    """Extract text from a PDF. Returns empty string if unreadable."""
    try:
        reader = PdfReader(str(path))
        parts: list[str] = []
        for page in reader.pages:
            t = page.extract_text() or ""
            if t.strip():
                parts.append(t)
        text = "\n\n".join(parts).strip()
        if len(text) > max_chars:
            return text[:max_chars] + "\n\n[...truncated...]"
        return text
    except Exception as exc:  # noqa: BLE001
        return f"[PDF_READ_ERROR] {exc}"


def normalize_name(value: str) -> str:
    """Normalize property/component names for fuzzy match (CrewAI rules)."""
    s = (value or "").lower().strip()
    for ch in (":", "&", "-", "_", ".", " "):
        s = s.replace(ch, "")
    return s
