"""Jarvis chat — tool-calling over Liljeblads webhook API (LangGraph worker CLI).

Full property Q&A uses get_property_overview + document search + risk tools.
In-app AI Chat (ai-chat edge) has the same capability via jarvisTools.
"""

from __future__ import annotations

import json
from typing import Any

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_core.tools import tool
from langchain_google_genai import ChatGoogleGenerativeAI

from jarvis_worker.config import Settings, get_settings
from jarvis_worker.liljeblads_client import LiljebladsClient


def _make_tools(client: LiljebladsClient):
    @tool
    def list_properties() -> str:
        """Lista alla fastigheter i organisationen (namn, id, adress)."""
        props = client.list_properties()
        return json.dumps(
            [
                {
                    "id": p.get("id"),
                    "name": p.get("name"),
                    "address": p.get("address"),
                }
                for p in props
            ],
            ensure_ascii=False,
        )

    @tool
    def get_property_overview(property_name: str) -> str:
        """
        Hämta ALLT om en fastighet: grunddata, komponenter, öppna WO, todos,
        anteckningar, dokumentlista, kontakter, högriskkomponenter, underhållsplan.
        Använd alltid detta först när frågan gäller en specifik fastighet.
        """
        data = client.get_property_overview(property_name=property_name)
        return json.dumps(data, ensure_ascii=False, default=str)

    @tool
    def search_components(query: str = "", property_name: str = "") -> str:
        """Sök komponenter. query = namn/serienr; property_name filtrerar på fastighet."""
        rows = client.search_components(
            query=query or "",
            property_name=property_name or None,
            limit=30,
        )
        return json.dumps(rows, ensure_ascii=False, default=str)

    @tool
    def list_services(
        component_id: str = "",
        serial_number: str = "",
        limit: int = 20,
    ) -> str:
        """Lista servicehistorik för en komponent (component_id eller serial_number)."""
        payload: dict[str, Any] = {"type": "list_services", "limit": limit}
        if component_id:
            payload["component_id"] = component_id
        if serial_number:
            payload["serial_number"] = serial_number
        data = client._post(payload)
        return json.dumps(data, ensure_ascii=False, default=str)

    @tool
    def list_work_orders(
        property_name: str = "",
        status: str = "",
        limit: int = 30,
    ) -> str:
        """Lista öppna arbetsordrar. Valfritt property_name och status."""
        rows = client.list_work_orders(
            property_name=property_name or None,
            status=status or None,
            limit=limit,
        )
        return json.dumps(rows, ensure_ascii=False, default=str)

    @tool
    def list_high_risk_components(
        property_name: str = "",
        min_level: str = "high",
        limit: int = 15,
    ) -> str:
        """Lista komponenter med högst prediktiv Weibull-risk (hela org eller en fastighet)."""
        rows = client.list_high_risk_components(
            property_name=property_name or None,
            min_level=min_level or "high",
            limit=limit,
        )
        return json.dumps(rows, ensure_ascii=False, default=str)

    @tool
    def search_property_documents(query: str, property_name: str = "") -> str:
        """
        Sök fastighetsdokument (namn/metadata + ev. semantiska utdrag om indexerade).
        query t.ex. 'energideklaration', 'OVK', 'ritning'.
        """
        data = client.search_property_documents(
            query=query,
            property_name=property_name or None,
            limit=20,
        )
        return json.dumps(data, ensure_ascii=False, default=str)

    return [
        list_properties,
        get_property_overview,
        search_components,
        list_services,
        list_work_orders,
        list_high_risk_components,
        search_property_documents,
    ]


def _content_to_text(content: Any) -> str:
    if content is None:
        return ""
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts: list[str] = []
        for block in content:
            if isinstance(block, str):
                parts.append(block)
            elif isinstance(block, dict) and block.get("type") == "text":
                parts.append(str(block.get("text") or ""))
            elif hasattr(block, "text"):
                parts.append(str(getattr(block, "text") or ""))
        return "\n".join(p for p in parts if p).strip() or str(content)
    return str(content)


SYSTEM = """Du är Jarvis, assistent för fastighetsförvaltning i Liljeblads.

Runtime: LangGraph-worker + Gemini tools mot Liljeblads API. Inte CrewAI.

Svara på svenska, kort och konkret. Hitta aldrig på UUID, belopp eller riskscore.

När användaren frågar om en **fastighet**:
1. Anropa get_property_overview(property_name=...)
2. Komplettera vid behov med list_high_risk_components, list_work_orders,
   search_property_documents, search_components.

När användaren frågar om **risk generellt**: list_high_risk_components.
När det gäller **dokument/innehåll**: search_property_documents (och säg om
semantisk sökning saknas — då finns bara filnamn/metadata).

Peka gärna på app-ytor: Underhållsplan, Komponenter, Arbetsordrar, Dokument.
"""


def chat_once(question: str, settings: Settings | None = None) -> str:
    settings = settings or get_settings()
    if not settings.google_api_key:
        return "GOOGLE_API_KEY saknas — kan inte köra chat."

    client = LiljebladsClient(settings)
    tools = _make_tools(client)
    llm = ChatGoogleGenerativeAI(
        model=settings.gemini_model,
        google_api_key=settings.google_api_key,
        temperature=0.2,
    ).bind_tools(tools)

    messages: list[Any] = [
        SystemMessage(content=SYSTEM),
        HumanMessage(content=question),
    ]

    for _ in range(8):
        ai: AIMessage = llm.invoke(messages)  # type: ignore[assignment]
        messages.append(ai)
        if not getattr(ai, "tool_calls", None):
            return _content_to_text(ai.content)

        for tc in ai.tool_calls:
            name = tc["name"]
            args = tc.get("args") or {}
            tool_fn = next((t for t in tools if t.name == name), None)
            if not tool_fn:
                result = f"Unknown tool {name}"
            else:
                try:
                    result = tool_fn.invoke(args)
                except Exception as exc:  # noqa: BLE001
                    result = f"Tool error: {exc}"
            messages.append(
                ToolMessage(content=str(result), tool_call_id=tc["id"])
            )

    return "Jag nådde max antal tool-anrop. Försök ställa en mer specifik fråga."


def chat_repl(settings: Settings | None = None) -> None:
    settings = settings or get_settings()
    print("Jarvis chat (LangGraph worker) — skriv exit för att avsluta")
    print("Ex: 'Berätta om Automaten 11' · 'Vilka har högst risk?' · 'Dokument om OVK'")
    while True:
        try:
            q = input("\nDu> ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            break
        if not q:
            continue
        if q.lower() in {"exit", "quit", "q"}:
            break
        try:
            print("\nJarvis>", chat_once(q, settings))
        except Exception as exc:  # noqa: BLE001
            print(f"\nFel: {exc}")
