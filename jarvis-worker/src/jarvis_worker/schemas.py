from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


class ComponentMention(BaseModel):
    beteckning: str = ""
    serial_number: str = ""


class ExtractedAction(BaseModel):
    action_text: str
    component_system: str = ""
    priority: Literal["Hög", "Medium", "Låg", "high", "medium", "low"] = "Medium"
    price_estimate: float | int | str = 0
    raw_context: str = ""


class ExtractedReport(BaseModel):
    file_id: str
    filename: str
    property_name: str = ""
    report_date: str = ""  # YYYY-MM-DD
    supplier: str = ""
    components_mentioned: list[ComponentMention] = Field(default_factory=list)
    actions: list[ExtractedAction] = Field(default_factory=list)
    error: str | None = None


class ExtractBatch(BaseModel):
    files: list[ExtractedReport] = Field(default_factory=list)


class InboxFile(BaseModel):
    file_id: str
    path: str
    filename: str
    raw_text: str = ""
