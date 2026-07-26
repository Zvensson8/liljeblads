from __future__ import annotations

from typing import Any

from jarvis_worker.pdf_text import normalize_name
from jarvis_worker.schemas import ComponentMention


def match_property_name(report_ref: str, property_names: list[str]) -> str:
    """Return exact property name from list or ''."""
    if not report_ref or not property_names:
        return ""
    target = normalize_name(report_ref)
    if not target:
        return ""
    best = ""
    best_score = 0
    for name in property_names:
        n = normalize_name(name)
        if not n:
            continue
        if n == target:
            return name
        # substring score
        if target in n or n in target:
            score = min(len(n), len(target))
            if score > best_score:
                best_score = score
                best = name
    return best if best_score >= 4 else ""


def match_component(
    mentions: list[ComponentMention],
    components: list[dict[str, Any]],
) -> dict[str, Any] | None:
    """Match component by serial first, then beteckning/name/aff_code."""
    if not components:
        return None

    for m in mentions:
        serial = normalize_name(m.serial_number or "")
        if not serial:
            continue
        for c in components:
            cser = normalize_name(c.get("serial_number") or "")
            if cser and cser == serial:
                return c

    for m in mentions:
        bet = normalize_name(m.beteckning or "")
        if not bet:
            continue
        for c in components:
            candidates = [
                normalize_name(c.get("name") or ""),
                normalize_name(c.get("aff_code") or ""),
                normalize_name(c.get("registration_number") or ""),
            ]
            if bet in candidates or any(bet and bet in x for x in candidates if x):
                return c

    return None
