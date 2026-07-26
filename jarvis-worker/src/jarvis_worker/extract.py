from __future__ import annotations

import json
import re
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_google_genai import ChatGoogleGenerativeAI

from jarvis_worker.config import Settings
from jarvis_worker.heuristic_extract import extract_batch_heuristic
from jarvis_worker.schemas import ExtractBatch, ExtractedReport


SYSTEM = """Du är senior teknisk fastighetsförvaltare i Sverige.
Du extraherar strukturerad data från servicerapporter (VVS, ventilation, kyla, el, brand).
Ignorera fakturarader och ren status utan åtgärd.
Returnera ENDAST giltig JSON enligt schemat — ingen markdown.
Prioritet: Hög | Medium | Låg.
report_date: YYYY-MM-DD (sista dagen i kvartalet om bara Q anges, t.ex. Q2 2026 → 2026-06-30).
property_name: matcha mot listan property_names med normalisering (ta bort : _ - mellanslag) och kopiera EXAKT stavning från listan.
action_text: konkret åtgärd, max 140 tecken, aldrig tom om det finns en rekommendation.
component_system: beteckning t.ex. LA1, KA1 — inte fastighetsnamn.
"""


def _parse_json_content(content: str) -> dict[str, Any]:
    text = content.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    return json.loads(text)


def extract_reports_with_gemini(
    settings: Settings,
    *,
    files: list[dict[str, str]],
    property_names: list[str],
) -> ExtractBatch:
    """files: [{file_id, filename, raw_text}]"""
    if not settings.google_api_key:
        raise RuntimeError("GOOGLE_API_KEY is not set")

    llm = ChatGoogleGenerativeAI(
        model=settings.gemini_model,
        google_api_key=settings.google_api_key,
        temperature=0.1,
    )

    user_payload = {
        "property_names": property_names,
        "files": files,
        "schema": {
            "files": [
                {
                    "file_id": "string",
                    "filename": "string",
                    "property_name": "exact from property_names or empty",
                    "report_date": "YYYY-MM-DD",
                    "supplier": "string",
                    "components_mentioned": [
                        {"beteckning": "string", "serial_number": "string"}
                    ],
                    "actions": [
                        {
                            "action_text": "string",
                            "component_system": "string",
                            "priority": "Hög|Medium|Låg",
                            "price_estimate": 0,
                            "raw_context": "string",
                        }
                    ],
                }
            ]
        },
    }

    try:
        msg = llm.invoke(
            [
                SystemMessage(content=SYSTEM),
                HumanMessage(
                    content=(
                        "Extrahera data för alla filer. "
                        "Kopiera file_id och filename exakt.\n\n"
                        + json.dumps(user_payload, ensure_ascii=False)[:100_000]
                    )
                ),
            ]
        )
        raw = msg.content if isinstance(msg.content, str) else str(msg.content)
        data = _parse_json_content(raw)
        return ExtractBatch.model_validate(data)
    except Exception as exc:  # noqa: BLE001
        # Free-tier quota / network: structured regex fallback
        print(f"[extract] Gemini failed ({exc}); using heuristic fallback")
        return extract_batch_heuristic(files, property_names)


def fallback_empty_report(file_id: str, filename: str, error: str) -> ExtractedReport:
    return ExtractedReport(
        file_id=file_id,
        filename=filename,
        error=error,
        actions=[],
    )
