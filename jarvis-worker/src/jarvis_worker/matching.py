from __future__ import annotations

from typing import Any, Literal

from jarvis_worker.pdf_text import normalize_name
from jarvis_worker.schemas import ComponentMention

MatchQuality = Literal["exact", "fuzzy", "none"]


def match_property_name(report_ref: str, property_names: list[str]) -> str:
    """Return exact property name from list or ''."""
    name, _ = match_property_name_scored(report_ref, property_names)
    return name


def match_property_name_scored(
    report_ref: str, property_names: list[str]
) -> tuple[str, MatchQuality]:
    """Return (property_name, quality). exact > fuzzy > none."""
    if not report_ref or not property_names:
        return "", "none"
    target = normalize_name(report_ref)
    if not target:
        return "", "none"
    best = ""
    best_score = 0
    for name in property_names:
        n = normalize_name(name)
        if not n:
            continue
        if n == target:
            return name, "exact"
        # substring score
        if target in n or n in target:
            score = min(len(n), len(target))
            if score > best_score:
                best_score = score
                best = name
    if best_score >= 4:
        return best, "fuzzy"
    return "", "none"


def match_component(
    mentions: list[ComponentMention],
    components: list[dict[str, Any]],
) -> dict[str, Any] | None:
    """Match component by serial first, then beteckning/name/aff_code."""
    matched, _ = match_component_scored(mentions, components)
    return matched


def match_component_scored(
    mentions: list[ComponentMention],
    components: list[dict[str, Any]],
) -> tuple[dict[str, Any] | None, MatchQuality]:
    """
    Match component with quality:
      exact = serial number match
      fuzzy = name/beteckning/aff_code
      none  = no match
    """
    if not components:
        return None, "none"

    for m in mentions:
        serial = normalize_name(m.serial_number or "")
        if not serial:
            continue
        for c in components:
            cser = normalize_name(c.get("serial_number") or "")
            if cser and cser == serial:
                return c, "exact"

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
            if bet in candidates:
                return c, "exact"
            if any(bet and bet in x for x in candidates if x):
                return c, "fuzzy"

    return None, "none"


def should_force_hitl(
    property_quality: MatchQuality,
    component_quality: MatchQuality,
    *,
    mode_hitl: bool,
) -> bool:
    """
    HITL queue when mode is hitl OR match is uncertain (fuzzy/none component
    with property found, or no property at all still routes to failed_match).
    """
    if mode_hitl:
        return True
    if property_quality == "none":
        return False  # failed_match path — not HITL suggest without property
    if component_quality in ("fuzzy", "none"):
        return True
    return False
