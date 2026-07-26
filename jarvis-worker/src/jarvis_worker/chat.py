"""Jarvis chat v0 — tool-calling over Liljeblads webhook API."""

from __future__ import annotations

import json
import re
from typing import Any

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage, ToolMessage
from langchain_core.tools import tool
from langchain_google_genai import ChatGoogleGenerativeAI

from jarvis_worker.config import Settings, get_settings
from jarvis_worker.liljeblads_client import LiljebladsClient


def _make_tools(client: LiljebladsClient):
    @tool
    def list_properties() -> str:
        """Lista alla fastigheter i organisationen (namn och id)."""
        props = client.list_properties()
        return json.dumps(
            [{"id": p.get("id"), "name": p.get("name"), "address": p.get("address")} for p in props],
            ensure_ascii=False,
        )

    @tool
    def search_components(query: str = "", property_name: str = "") -> str:
        """Sök komponenter. query kan vara namn/serienr; property_name filtrerar på fastighet."""
        rows = client.search_components(
            query=query or "",
            property_name=property_name or None,
            limit=30,
        )
        return json.dumps(rows, ensure_ascii=False, default=str)

    @tool
    def list_services(component_id: str = "", serial_number: str = "", limit: int = 20) -> str:
        """Lista servicehistorik för en komponent (component_id eller serial_number)."""
        payload: dict[str, Any] = {"type": "list_services", "limit": limit}
        if component_id:
            payload["component_id"] = component_id
        if serial_number:
            payload["serial_number"] = serial_number
        data = client._post(payload)
        return json.dumps(data, ensure_ascii=False, default=str)

    @tool
    def open_work_orders_hint(property_name: str = "") -> str:
        """
        Returnerar vägledning + senast kända properties.
        (Full WO-lista kräver UI; verktyget listar fastigheter och påminner om att öppna Arbetsordrar.)
        """
        props = client.list_properties()
        if property_name:
            props = [p for p in props if property_name.lower() in (p.get("name") or "").lower()]
        return json.dumps(
            {
                "message": "Öppna Arbetsordrar i Liljeblads-appen för full lista. Här är matchande fastigheter.",
                "properties": props,
            },
            ensure_ascii=False,
            default=str,
        )

    return [list_properties, search_components, list_services, open_work_orders_hint]


SYSTEM = """Du är Jarvis, assistent för fastighetsförvaltning (Liljeblads).
Svara på svenska, kort och konkret.
Använd tools för fakta om fastigheter, komponenter och service.
Om du saknar data — säg det och föreslå nästa steg i appen.
Hitta aldrig på UUID eller kostnader.
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

    # Simple tool loop (max 5 rounds)
    for _ in range(5):
        ai: AIMessage = llm.invoke(messages)  # type: ignore[assignment]
        messages.append(ai)
        if not getattr(ai, "tool_calls", None):
            content = ai.content
            return content if isinstance(content, str) else str(content)

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
    print("Jarvis chat v0 — skriv 'exit' för att avsluta.\n")
    while True:
        try:
            q = input("Du: ").strip()
        except (EOFError, KeyboardInterrupt):
            print()
            break
        if not q:
            continue
        if q.lower() in {"exit", "quit", "q"}:
            break
        try:
            ans = chat_once(q, settings)
        except Exception as exc:  # noqa: BLE001
            ans = f"Fel: {exc}"
        print(f"Jarvis: {ans}\n")
