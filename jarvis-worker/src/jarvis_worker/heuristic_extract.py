"""Rule-based extract for structured Swedish service reports (Gemini fallback)."""

from __future__ import annotations

import re

from jarvis_worker.matching import match_property_name
from jarvis_worker.schemas import (
    ComponentMention,
    ExtractBatch,
    ExtractedAction,
    ExtractedReport,
)


def _field(text: str, label: str) -> str:
    m = re.search(
        rf"(?im)^{re.escape(label)}\s*\n\s*(.+?)\s*$",
        text,
        re.MULTILINE,
    )
    if m:
        return m.group(1).strip()
    m = re.search(rf"(?i){re.escape(label)}\s*[:\-]?\s*(.+)", text)
    return m.group(1).strip() if m else ""


def _parse_price(block: str) -> float:
    m = re.search(r"Ca\.?\s*kr\s*([\d\s\u00a0]+)", block, re.I)
    if not m:
        m = re.search(r"([\d\s\u00a0]+)\s*SEK", block, re.I)
    if not m:
        m = re.search(r"([\d\s\u00a0]+)\s*kr", block, re.I)
    if not m:
        m = re.search(r"Upp till\s*([\d\s\u00a0]+)\s*kr", block, re.I)
    if not m:
        return 0
    try:
        return float(m.group(1).replace(" ", "").replace("\xa0", "").replace(",", "."))
    except ValueError:
        return 0


def _normalize_priority(raw: str) -> str:
    import unicodedata

    p = unicodedata.normalize("NFC", (raw or "").lower())
    if "hög" in p or "skall" in p or p in {"hog", "high", "h", "2"}:
        return "Hög"
    if "låg" in p or p in {"lag", "low", "l"}:
        return "Låg"
    return "Medium"


def _clean_action(text: str) -> str:
    t = re.sub(r"\s+", " ", (text or "").strip())
    t = re.sub(r"[,;:\-–]+\s*$", "", t)
    return t[:140]


def _property_from_filename(filename: str, property_names: list[str]) -> str:
    stem = re.sub(r"\.pdf$", "", filename, flags=re.I)
    # "Hjulet 1&2- Vent och kyla - Q2" → before first " - "
    stem = re.split(r"\s+-\s+", stem, maxsplit=1)[0]
    stem = stem.replace("_", ":").replace("&", " & ")
    stem = re.sub(r"\s+", " ", stem).strip()
    return match_property_name(stem, property_names) or ""


def _property_from_omangruppen(text: str, property_names: list[str]) -> str:
    """Ömangruppen / Trophi service reports."""
    # Lines like: Hjulet 1 & 2, Ramgatan 4 , Hjulet 1 & 2
    for m in re.finditer(
        r"(?m)^([A-ZÅÄÖa-zåäö0-9][^\n,]{2,40}),\s*[A-ZÅÄÖa-zåäö].*$",
        text,
    ):
        cand = m.group(1).strip()
        hit = match_property_name(cand, property_names)
        if hit:
            return hit
    # Gäller anläggning/aggregat/system\nHjulet 1 & 2
    m = re.search(
        r"(?is)Gäller anläggning/aggregat/system\s*\n\s*([^\n]+)",
        text,
    )
    if m:
        hit = match_property_name(m.group(1).strip(), property_names)
        if hit:
            return hit
    # Footer: Orrby 1:72, Sveagatan 89, 664 34 Grums
    for name in property_names:
        if name and name.lower() in text.lower():
            return name
        # fuzzy: Hjulet 1 & 2 vs Hjulet 1&2
        n = re.sub(r"\s+", " ", name.replace("&", " & ")).strip()
        if n and n.lower() in re.sub(r"\s+", " ", text).lower():
            return name
    return ""


def _omangruppen_actions(text: str) -> list[ExtractedAction]:
    """Parse Åtgärdslista / Ej godkända checkpunkter blocks."""
    actions: list[ExtractedAction] = []
    # Split by Checkpunkt sections that have Anmärkning + Åtgärd/Bedömning
    chunks = re.split(r"(?m)^Checkpunkt\s*$", text)
    for chunk in chunks[1:]:
        anm = re.search(
            r"(?is)Anmärkning\s*\n(.+?)(?=\nÅtgärd|\nBedömning|\nCheckpunkt|\nGäller |\Z)",
            chunk,
        )
        atg = re.search(
            r"(?is)Åtgärd\s*\n?(.*?)(?=\nBedömning|\nCheckpunkt|\nGäller |\Z)",
            chunk,
        )
        price = _parse_price(chunk)
        # Assessment line
        bed = re.search(
            r"(?im)Bedömning\s*\n\s*(Bör åtgärdas|Skall åtgärdas|Ej angiven|Klar)",
            chunk,
        )
        priority = "Medium"
        if bed:
            priority = _normalize_priority(bed.group(1))

        parts: list[str] = []
        if atg:
            a = _clean_action(atg.group(1))
            if a and a.lower() not in {
                "arbete, material och tid",
                "ej angiven",
                "bedömning",
            }:
                parts.append(a)
        if anm:
            n = _clean_action(anm.group(1))
            # drop pure checklist boilerplate
            if n and "värde/anteckningar" not in n.lower():
                if not parts:
                    parts.append(n)
                elif n.lower() not in parts[0].lower():
                    # Prefer action line; keep short note context in raw only
                    pass

        action_text = parts[0] if parts else ""
        if not action_text:
            # Noteringar: ...
            note = re.search(r"(?i)Noteringar:\s*(.+)", chunk)
            if note:
                action_text = _clean_action(note.group(1))
        if not action_text:
            continue
        if action_text.lower() in {"x", "1", "2", "å", "-"}:
            continue

        # Component codes in chunk
        sys_m = re.search(r"\b([A-Z]{1,3}\d{1,3})\b", chunk)
        component_system = sys_m.group(1) if sys_m else ""

        actions.append(
            ExtractedAction(
                action_text=action_text[:140],
                component_system=component_system,
                priority=priority,  # type: ignore[arg-type]
                price_estimate=price,
                raw_context=chunk[:300].replace("\n", " "),
            )
        )
    return actions


def _mention_codes(text: str) -> list[ComponentMention]:
    mentions: list[ComponentMention] = []
    seen: set[str] = set()
    for m in re.finditer(r"\b((?:LA|LB|KA|TA|FA|VV|VS)\d{1,3})\b", text, re.I):
        code = m.group(1).upper()
        if code in seen:
            continue
        seen.add(code)
        mentions.append(ComponentMention(beteckning=code, serial_number=""))
    # Serienr lines
    for m in re.finditer(
        r"(?i)(?:Typ\s*Serienr\.?|Serienr\.?|Serie-ID)\s*[:\s]*([A-Z0-9\-]+)",
        text,
    ):
        serial = m.group(1).strip()
        if serial and serial.upper() not in {"X", "TL", "FL"}:
            mentions.append(ComponentMention(beteckning="", serial_number=serial))
    return mentions


def extract_report_heuristic(
    *,
    file_id: str,
    filename: str,
    raw_text: str,
    property_names: list[str],
) -> ExtractedReport:
    text = raw_text or ""

    prop_raw = _field(text, "Fastighet")
    property_name = match_property_name(prop_raw, property_names) or ""
    if not property_name:
        property_name = _property_from_omangruppen(text, property_names)
    if not property_name:
        property_name = _property_from_filename(filename, property_names)
    if not property_name and prop_raw:
        property_name = prop_raw

    report_date = _field(text, "Servicedatum")
    if not re.match(r"\d{4}-\d{2}-\d{2}", report_date):
        m = re.search(r"(20\d{2}-\d{2}-\d{2})", text)
        if m:
            report_date = m.group(1)
        else:
            # 12.05.2026 → 2026-05-12
            m = re.search(r"\b(\d{2})\.(\d{2})\.(20\d{2})\b", text)
            if m:
                report_date = f"{m.group(3)}-{m.group(2)}-{m.group(1)}"

    beteckning = _field(text, "Beteckning")
    serial = _field(text, "Serie-ID") or _field(text, "Serienummer")
    supplier = (
        _field(text, "Leverantör")
        or _field(text, "Entreprenör")
        or _field(text, "Ansvarig tekniker")
    )
    if not supplier and "Ömangruppen" in text:
        supplier = "Ömangruppen / Air4You"
    if not supplier and "Air4You" in text:
        supplier = "Air4You"

    mentions: list[ComponentMention] = []
    if beteckning or serial:
        mentions.append(ComponentMention(beteckning=beteckning, serial_number=serial))
    mentions.extend(_mention_codes(text))

    actions: list[ExtractedAction] = []

    # Classic numbered ANMÄRKNINGAR format
    anm = re.search(r"(?is)2\.\s*ANMÄRKNINGAR.*?(?=3\.|$)", text)
    if anm:
        block = anm.group(0)
        parts = re.split(r"(?m)^\s*(\d+)\s*\n", block)
        i = 1
        while i + 1 < len(parts):
            body = parts[i + 1]
            pri_m = re.search(r"\b(Hög|Medium|Låg|Hog|Medel|High|Low)\b", body, re.I)
            priority = _normalize_priority(pri_m.group(1) if pri_m else "Medium")

            after = body[pri_m.end() :] if pri_m else body
            rec_lines: list[str] = []
            for ln in after.splitlines():
                s = ln.strip()
                if not s:
                    if rec_lines:
                        break
                    continue
                if re.search(r"SEK|\d[\d\s]{2,}\s*kr", s, re.I):
                    break
                if re.match(r"^\d+$", s):
                    break
                if len(s) < 8 and not rec_lines:
                    continue
                rec_lines.append(s)
            action_text = _clean_action(" ".join(rec_lines))
            if not action_text:
                for ln in after.splitlines():
                    s = ln.strip()
                    if re.search(
                        r"(?i)byte|byt|kontroll|planera|åtgärd|rekommend|rens|byta|install|juster|smörj",
                        s,
                    ):
                        action_text = _clean_action(s)
                        break

            price = _parse_price(body)
            if action_text:
                if beteckning and beteckning not in action_text:
                    title = _clean_action(f"{beteckning}: {action_text}")
                else:
                    title = action_text
                actions.append(
                    ExtractedAction(
                        action_text=title,
                        component_system=beteckning or "",
                        priority=priority,  # type: ignore[arg-type]
                        price_estimate=price,
                        raw_context=body[:300].replace("\n", " "),
                    )
                )
            i += 2

    # Ömangruppen åtgärdslista
    if not actions and (
        "Åtgärdslista" in text
        or "Ej godkända checkpunkter" in text
        or "Bör åtgärdas" in text
    ):
        actions = _omangruppen_actions(text)

    if not actions and "UTFÖRDA ARBETEN" in text.upper():
        actions.append(
            ExtractedAction(
                action_text=_clean_action(
                    f"Uppföljning efter service {beteckning or filename}"
                ),
                component_system=beteckning or "",
                priority="Medium",
                price_estimate=0,
                raw_context="Automatisk fallback från utförda arbeten",
            )
        )

    return ExtractedReport(
        file_id=file_id,
        filename=filename,
        property_name=property_name,
        report_date=report_date,
        supplier=supplier,
        components_mentioned=mentions,
        actions=actions,
    )


def extract_batch_heuristic(
    files: list[dict[str, str]],
    property_names: list[str],
) -> ExtractBatch:
    out: list[ExtractedReport] = []
    for f in files:
        out.append(
            extract_report_heuristic(
                file_id=f["file_id"],
                filename=f["filename"],
                raw_text=f.get("raw_text") or "",
                property_names=property_names,
            )
        )
    return ExtractBatch(files=out)
