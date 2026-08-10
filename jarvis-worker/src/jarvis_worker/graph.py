"""
LangGraph service-report ingest pipeline.

Nodes:
  start_run → discover_files → parse_pdfs → extract → apply → finish_run

Inside apply (logical sub-nodes):
  match(property, component + quality)
  → failed_match | hitl_queue | create_work_order
  → mark_processed → archive/failed
"""

from __future__ import annotations

import hashlib
import shutil
from pathlib import Path
from typing import Any, TypedDict

from langgraph.graph import END, START, StateGraph

from jarvis_worker.config import Settings, get_settings
from jarvis_worker.drive_inbox import sync_drive_to_inbox
from jarvis_worker.extract import extract_reports_with_gemini, fallback_empty_report
from jarvis_worker.liljeblads_client import LiljebladsClient
from jarvis_worker.matching import (
    match_component_scored,
    match_property_name_scored,
    should_force_hitl,
)
from jarvis_worker.notify import send_ingest_summary
from jarvis_worker.pdf_text import extract_text_from_pdf
from jarvis_worker.schemas import ExtractBatch, ExtractedReport, InboxFile


class GraphState(TypedDict, total=False):
    run_id: str
    property_names: list[str]
    properties: list[dict[str, Any]]
    processed_ids: list[str]
    processed_filenames: list[str]
    inbox_files: list[dict[str, Any]]
    extracted: dict[str, Any]
    results: list[dict[str, Any]]
    stats: dict[str, Any]
    error: str | None


def content_hash_id(path: Path) -> str:
    """
    Stable content-based id so the same PDF is never ingested twice
    (even if re-downloaded or renamed).
    """
    h = hashlib.sha256()
    try:
        with path.open("rb") as fh:
            while True:
                chunk = fh.read(1024 * 256)
                if not chunk:
                    break
                h.update(chunk)
    except OSError:
        h.update(path.name.encode("utf-8"))
    return f"sha256:{h.hexdigest()[:40]}"


def _file_id_for_path(path: Path) -> str:
    """Backward-compatible alias."""
    return content_hash_id(path)


def build_graph(settings: Settings | None = None):
    settings = settings or get_settings()
    client = LiljebladsClient(settings)

    def start_run(state: GraphState) -> GraphState:
        run_id = client.start_run("service_report_ingest")
        props = client.list_properties()
        names = [p["name"] for p in props if p.get("name")]
        processed_meta = client.list_processed(settings.source_label)
        processed = sorted(processed_meta["ids"])
        return {
            "run_id": run_id,
            "properties": props,
            "property_names": names,
            "processed_ids": processed,
            "processed_filenames": sorted(processed_meta["filenames"]),
            "stats": {
                "properties": len(props),
                "already_processed": len(processed),
            },
            "error": None,
        }

    def discover_files(state: GraphState) -> GraphState:
        inbox = Path(settings.inbox_dir)
        inbox.mkdir(parents=True, exist_ok=True)
        settings.archive_dir.mkdir(parents=True, exist_ok=True)
        settings.failed_dir.mkdir(parents=True, exist_ok=True)

        processed = set(state.get("processed_ids") or [])
        processed_names = {
            n.strip().lower()
            for n in (state.get("processed_filenames") or [])
            if n
        }

        drive_stats: dict[str, Any] = {"enabled": False}
        drive_id_by_name: dict[str, str] = {}
        if settings.drive_sync_enabled and settings.google_drive_folder_id:
            drive_stats = sync_drive_to_inbox(
                settings,
                processed_ids=processed,
                processed_filenames=processed_names,
            )
            for meta in drive_stats.get("files") or []:
                fn = (meta.get("filename") or "").lower()
                did = meta.get("drive_id") or ""
                if fn and did:
                    drive_id_by_name[fn] = did
            # Don't dump large file lists into logs
            log_drive = {
                k: v
                for k, v in drive_stats.items()
                if k != "files"
            }
            print(f"[drive] sync: {log_drive}")

        found: list[dict[str, Any]] = []
        for path in sorted(inbox.glob("**/*")):
            if not path.is_file():
                continue
            if path.suffix.lower() not in {".pdf", ".txt", ".md"}:
                continue
            # skip archive/failed subdirs
            if settings.archive_dir in path.parents or settings.failed_dir in path.parents:
                continue
            if path.parent in (settings.archive_dir, settings.failed_dir):
                continue
            name_l = path.name.lower()
            name_key = f"name:{name_l}"
            if name_l in processed_names or name_key in processed:
                print(f"[skip] already processed by filename: {path.name}")
                continue
            fid = content_hash_id(path)
            if fid in processed:
                print(f"[skip] already processed by content: {path.name}")
                continue
            drive_id = drive_id_by_name.get(name_l, "")
            drive_key = f"drive:{drive_id}" if drive_id else ""
            if drive_key and drive_key in processed:
                print(f"[skip] already processed by drive id: {path.name}")
                continue
            found.append(
                {
                    "file_id": fid,
                    "path": str(path.resolve()),
                    "filename": path.name,
                    "drive_id": drive_id,
                }
            )
        stats = dict(state.get("stats") or {})
        stats["new_files"] = len(found)
        stats["drive"] = {k: v for k, v in drive_stats.items() if k != "files"}
        return {"inbox_files": found, "stats": stats}

    def parse_pdfs(state: GraphState) -> GraphState:
        files: list[dict[str, Any]] = []
        for f in state.get("inbox_files") or []:
            path = Path(f["path"])
            if path.suffix.lower() == ".pdf":
                text = extract_text_from_pdf(path)
            else:
                try:
                    text = path.read_text(encoding="utf-8", errors="replace")
                except OSError as exc:
                    text = f"[READ_ERROR] {exc}"
            files.append({**f, "raw_text": text})
        return {"inbox_files": files}

    def extract(state: GraphState) -> GraphState:
        files = state.get("inbox_files") or []
        if not files:
            return {"extracted": {"files": []}}

        payload_files = [
            {
                "file_id": f["file_id"],
                "filename": f["filename"],
                "raw_text": (f.get("raw_text") or "")[: 40_000],
            }
            for f in files
            if not str(f.get("raw_text") or "").startswith("[PDF_READ_ERROR]")
            and not str(f.get("raw_text") or "").startswith("[READ_ERROR]")
        ]

        if not payload_files:
            batch = ExtractBatch(
                files=[
                    fallback_empty_report(f["file_id"], f["filename"], "unreadable")
                    for f in files
                ]
            )
            return {"extracted": batch.model_dump()}

        batch = extract_reports_with_gemini(
            settings,
            files=payload_files,
            property_names=state.get("property_names") or [],
        )
        return {"extracted": batch.model_dump()}

    def apply(state: GraphState) -> GraphState:
        mode = settings.mode.strip().lower()
        dry = mode == "dry_run"
        # suggest is a legacy alias for hitl (pending AI proposals)
        hitl = mode in ("hitl", "suggest")
        extracted = ExtractBatch.model_validate(state.get("extracted") or {"files": []})
        path_by_id = {f["file_id"]: f for f in (state.get("inbox_files") or [])}
        property_names = state.get("property_names") or []
        results: list[dict[str, Any]] = []

        wo_ok = 0
        suggestions_ok = 0
        service_ok = 0
        failed = 0
        failed_match = 0

        for report in extracted.files:
            file_meta = path_by_id.get(report.file_id, {})
            path = Path(file_meta["path"]) if file_meta.get("path") else None
            summary: dict[str, Any] = {
                "actions": len(report.actions),
                "property_name": report.property_name,
                "graph_node": "apply",
            }
            try:
                # Node: match property + component with quality scores
                prop, prop_q = match_property_name_scored(
                    report.property_name, property_names
                )
                if prop:
                    report.property_name = prop
                summary["property_match_quality"] = prop_q

                components: list[dict[str, Any]] = []
                if report.property_name and not dry:
                    components = client.search_components(
                        query="",
                        property_name=report.property_name,
                        limit=50,
                    )
                matched, comp_q = match_component_scored(
                    report.components_mentioned, components
                )
                summary["matched_component_id"] = matched.get("id") if matched else None
                summary["matched_component_name"] = matched.get("name") if matched else None
                summary["component_match_quality"] = comp_q

                # Node: failed_match — no property → archive as failed, no silent WO
                if not dry and prop_q == "none":
                    failed_match += 1
                    failed += 1
                    summary["graph_node"] = "failed_match"
                    summary["error"] = "no_property_match"
                    keys = [report.file_id]
                    if report.filename:
                        keys.append(f"name:{(report.filename or '').strip().lower()}")
                    drive_id = file_meta.get("drive_id") or ""
                    if drive_id:
                        keys.append(f"drive:{drive_id}")
                    client.mark_processed_keys(
                        keys=keys,
                        filename=report.filename,
                        source=settings.source_label,
                        status="failed",
                        summary=summary,
                        error_message="Kunde inte matcha fastighet — granska manuellt",
                    )
                    if path and path.exists():
                        dest = settings.failed_dir
                        dest.mkdir(parents=True, exist_ok=True)
                        shutil.move(str(path), str(dest / path.name))
                    results.append(
                        {
                            "file_id": report.file_id,
                            "filename": report.filename,
                            "ok": False,
                            "summary": summary,
                            "error": "no_property_match",
                        }
                    )
                    continue

                force_hitl = should_force_hitl(prop_q, comp_q, mode_hitl=hitl)
                summary["force_hitl"] = force_hitl
                summary["graph_node"] = "hitl_queue" if force_hitl else "create_work_order"

                if not dry and settings.auto_log_service and matched and report.report_date:
                    notes = "; ".join(a.action_text for a in report.actions)[:500]
                    client.log_service(
                        component_id=matched["id"],
                        action_type=f"Service {report.filename}"[:120],
                        performed_date=report.report_date,
                        supplier=report.supplier or "",
                        category="planned",
                        notes=notes,
                    )
                    service_ok += 1
                    summary["service_logged"] = True

                work_orders: list[Any] = []
                suggestions: list[Any] = []
                if (
                    not dry
                    and settings.auto_create_work_orders
                    and report.property_name
                ):
                    for action in report.actions:
                        if not (action.action_text or "").strip():
                            continue
                        wo_kwargs: dict[str, Any] = {
                            "action_text": action.action_text,
                            "property_name": report.property_name,
                            "component_system": action.component_system
                            or (matched.get("name") if matched else ""),
                            "priority": action.priority,
                            "price_estimate": str(action.price_estimate or ""),
                            "raw_context": action.raw_context,
                            "report_filename": report.filename,
                            "source": settings.source_label,
                        }
                        if matched:
                            wo_kwargs["component_id"] = matched["id"]
                            if matched.get("serial_number"):
                                wo_kwargs["serial_number"] = matched["serial_number"]
                        # Uncertain match always goes to HITL queue (suggest), never silent live WO
                        if force_hitl:
                            res = client.suggest_work_order(**wo_kwargs)
                            suggestions.append(res)
                            suggestions_ok += 1
                        else:
                            res = client.create_work_order(**wo_kwargs)
                            work_orders.append(res)
                            wo_ok += 1
                summary["work_orders"] = len(work_orders)
                summary["suggestions"] = len(suggestions)
                summary["hitl"] = force_hitl

                if not dry:
                    keys = [report.file_id]
                    if report.filename:
                        keys.append(f"name:{(report.filename or '').strip().lower()}")
                    drive_id = file_meta.get("drive_id") or ""
                    if drive_id:
                        keys.append(f"drive:{drive_id}")
                    client.mark_processed_keys(
                        keys=keys,
                        filename=report.filename,
                        source=settings.source_label,
                        status="failed" if report.error else "processed",
                        summary=summary,
                        error_message=report.error,
                    )

                if path and path.exists() and not dry:
                    dest = settings.failed_dir if report.error else settings.archive_dir
                    dest.mkdir(parents=True, exist_ok=True)
                    shutil.move(str(path), str(dest / path.name))

                results.append(
                    {
                        "file_id": report.file_id,
                        "filename": report.filename,
                        "ok": not bool(report.error),
                        "summary": summary,
                        "error": report.error,
                    }
                )
            except Exception as exc:  # noqa: BLE001
                failed += 1
                if not dry:
                    try:
                        keys = [report.file_id]
                        if report.filename:
                            keys.append(f"name:{(report.filename or '').strip().lower()}")
                        drive_id = file_meta.get("drive_id") or ""
                        if drive_id:
                            keys.append(f"drive:{drive_id}")
                        client.mark_processed_keys(
                            keys=keys,
                            filename=report.filename,
                            source=settings.source_label,
                            status="failed",
                            error_message=str(exc),
                        )
                    except Exception:
                        pass
                if path and path.exists() and not dry:
                    settings.failed_dir.mkdir(parents=True, exist_ok=True)
                    shutil.move(str(path), str(settings.failed_dir / path.name))
                results.append(
                    {
                        "file_id": report.file_id,
                        "filename": report.filename,
                        "ok": False,
                        "error": str(exc),
                    }
                )

        stats = dict(state.get("stats") or {})
        stats.update(
            {
                "work_orders_created": wo_ok,
                "suggestions_created": suggestions_ok,
                "services_logged": service_ok,
                "files_failed": failed,
                "failed_match": failed_match,
                "files_done": len(results),
                "dry_run": dry,
                "hitl": hitl,
                "mode": mode,
            }
        )
        return {"results": results, "stats": stats}

    def finish_run(state: GraphState) -> GraphState:
        run_id = state.get("run_id")
        if not run_id:
            return {}
        stats = state.get("stats") or {}
        status = "completed"
        if state.get("error"):
            status = "failed"
        elif (stats.get("files_failed") or 0) > 0:
            status = "partial"
        try:
            client.finish_run(
                run_id,
                status=status,
                stats=stats,
                error_message=state.get("error"),
            )
        except Exception as exc:  # noqa: BLE001
            return {"error": str(exc)}
        return {}

    g = StateGraph(GraphState)
    g.add_node("start_run", start_run)
    g.add_node("discover_files", discover_files)
    g.add_node("parse_pdfs", parse_pdfs)
    g.add_node("extract", extract)
    g.add_node("apply", apply)
    g.add_node("finish_run", finish_run)

    g.add_edge(START, "start_run")
    g.add_edge("start_run", "discover_files")
    g.add_edge("discover_files", "parse_pdfs")
    g.add_edge("parse_pdfs", "extract")
    g.add_edge("extract", "apply")
    g.add_edge("apply", "finish_run")
    g.add_edge("finish_run", END)

    return g.compile()


def run_ingest(settings: Settings | None = None) -> dict[str, Any]:
    settings = settings or get_settings()
    app = build_graph(settings)
    final = app.invoke({})
    stats = final.get("stats") or {}
    results = final.get("results") or []
    try:
        client = LiljebladsClient(settings)
        send_ingest_summary(settings, stats=stats, results=results, client=client)
    except Exception as exc:  # noqa: BLE001
        print(f"[notify] skipped: {exc}")
    return {
        "run_id": final.get("run_id"),
        "stats": stats,
        "results": final.get("results") or results,
        "error": final.get("error"),
    }
