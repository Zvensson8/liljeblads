"""HTTP client for Liljeblads Jarvis webhook (API key auth, LangGraph worker)."""

from __future__ import annotations

from typing import Any

import httpx

from jarvis_worker.config import Settings


class LiljebladsClient:
    def __init__(self, settings: Settings):
        self.settings = settings
        self._headers = {
            "Authorization": f"Bearer {settings.liljeblads_api_key}",
            "Content-Type": "application/json",
            "x-api-key": settings.liljeblads_api_key,
        }

    def _post(self, payload: dict[str, Any]) -> dict[str, Any]:
        if not self.settings.liljeblads_api_key:
            raise RuntimeError("LILJEBLADS_API_KEY is not set")
        with httpx.Client(timeout=60.0) as client:
            r = client.post(
                self.settings.liljeblads_webhook_url,
                headers=self._headers,
                json=payload,
            )
            try:
                data = r.json()
            except Exception:
                data = {"raw": r.text}
            if r.status_code >= 400:
                raise RuntimeError(
                    f"Liljeblads API {r.status_code}: {data.get('error') or data}"
                )
            return data

    def list_properties(self) -> list[dict[str, Any]]:
        data = self._post({"type": "list_properties"})
        return list(data.get("results") or [])

    def list_processed(self, source: str) -> dict[str, Any]:
        """Return processed external ids + filenames for idempotent ingest."""
        data = self._post({"type": "list_processed_files", "source": source, "limit": 5000})
        ids = set(data.get("ids") or [])
        filenames = {
            str(r.get("filename") or "").strip().lower()
            for r in (data.get("results") or [])
            if r.get("filename")
        }
        return {"ids": ids, "filenames": filenames}

    def list_processed_ids(self, source: str) -> set[str]:
        return self.list_processed(source)["ids"]

    def mark_processed(
        self,
        *,
        external_file_id: str,
        filename: str,
        source: str,
        status: str = "processed",
        summary: dict[str, Any] | None = None,
        error_message: str | None = None,
    ) -> dict[str, Any]:
        return self._post(
            {
                "type": "mark_processed",
                "external_file_id": external_file_id,
                "filename": filename,
                "source": source,
                "file_status": status,
                "summary": summary or {},
                "error_message": error_message,
            }
        )

    def mark_processed_keys(
        self,
        *,
        keys: list[str],
        filename: str,
        source: str,
        status: str = "processed",
        summary: dict[str, Any] | None = None,
        error_message: str | None = None,
    ) -> None:
        """Mark multiple idempotency keys (content hash, drive id, …) for one file."""
        seen: set[str] = set()
        for key in keys:
            k = (key or "").strip()
            if not k or k in seen:
                continue
            seen.add(k)
            self.mark_processed(
                external_file_id=k,
                filename=filename,
                source=source,
                status=status,
                summary=summary,
                error_message=error_message,
            )

    def start_run(self, run_type: str = "service_report_ingest") -> str:
        data = self._post({"type": "start_agent_run", "run_type": run_type})
        return str(data["run_id"])

    def finish_run(
        self,
        run_id: str,
        *,
        status: str = "completed",
        stats: dict[str, Any] | None = None,
        error_message: str | None = None,
    ) -> dict[str, Any]:
        return self._post(
            {
                "type": "finish_agent_run",
                "run_id": run_id,
                "run_status": status,
                "stats": stats or {},
                "error_message": error_message,
            }
        )

    def search_components(
        self,
        query: str = "",
        property_name: str | None = None,
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        payload: dict[str, Any] = {
            "type": "search_components",
            "query": query,
            "limit": limit,
        }
        if property_name:
            payload["property_name"] = property_name
        data = self._post(payload)
        return list(data.get("results") or [])

    def log_service(self, **kwargs: Any) -> dict[str, Any]:
        payload = {"type": "log_service", **kwargs}
        return self._post(payload)

    def create_work_order(self, **kwargs: Any) -> dict[str, Any]:
        payload = {"type": "work_order", **kwargs}
        return self._post(payload)

    def suggest_work_order(self, **kwargs: Any) -> dict[str, Any]:
        """HITL: create pending ai_suggested_actions instead of a live WO."""
        payload = {"type": "suggest_work_order", **kwargs}
        return self._post(payload)

    def list_work_orders(
        self,
        *,
        property_name: str | None = None,
        property_id: str | None = None,
        status: str | None = None,
        limit: int = 50,
    ) -> list[dict[str, Any]]:
        payload: dict[str, Any] = {"type": "list_work_orders", "limit": limit}
        if property_name:
            payload["property_name"] = property_name
        if property_id:
            payload["property_id"] = property_id
        if status:
            payload["status"] = status
        data = self._post(payload)
        return list(data.get("results") or [])

    def list_high_risk_components(
        self,
        *,
        property_name: str | None = None,
        min_level: str = "high",
        min_confidence: str = "medium",
        limit: int = 15,
    ) -> list[dict[str, Any]]:
        payload: dict[str, Any] = {
            "type": "list_high_risk_components",
            "min_level": min_level,
            "min_confidence": min_confidence,
            "limit": limit,
        }
        if property_name:
            payload["property_name"] = property_name
        data = self._post(payload)
        return list(data.get("results") or [])

    def get_property_overview(
        self,
        *,
        property_name: str | None = None,
        property_id: str | None = None,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {"type": "get_property_overview"}
        if property_name:
            payload["property_name"] = property_name
        if property_id:
            payload["property_id"] = property_id
        data = self._post(payload)
        return dict(data.get("result") or data)

    def search_property_documents(
        self,
        *,
        query: str,
        property_name: str | None = None,
        limit: int = 20,
    ) -> dict[str, Any]:
        payload: dict[str, Any] = {
            "type": "search_property_documents",
            "query": query,
            "limit": limit,
        }
        if property_name:
            payload["property_name"] = property_name
        return self._post(payload)
