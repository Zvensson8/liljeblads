from __future__ import annotations

import argparse
import json
import sys

from jarvis_worker.config import get_settings
from jarvis_worker.graph import run_ingest


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Jarvis LangGraph worker for Liljeblads")
    sub = parser.add_subparsers(dest="cmd", required=True)

    p_run = sub.add_parser("ingest", help="Run service-report ingest from INBOX_DIR (+ optional Drive)")
    p_run.add_argument(
        "--dry-run",
        action="store_true",
        help="Extract only; do not write work orders / service",
    )
    p_run.add_argument("--inbox", type=str, default=None, help="Override INBOX_DIR")
    p_run.add_argument(
        "--sync-drive",
        action="store_true",
        help="Force Google Drive sync before local discover",
    )

    sub.add_parser("chat", help="Interactive Jarvis chat v0 (tools against Liljeblads)")

    p_ask = sub.add_parser("ask", help="One-shot Jarvis question")
    p_ask.add_argument("question", nargs="+", help="Question in Swedish")

    args = parser.parse_args(argv)
    settings = get_settings()

    if args.cmd == "ingest":
        if args.dry_run:
            settings.mode = "dry_run"
        if args.inbox:
            from pathlib import Path

            settings.inbox_dir = Path(args.inbox)
        if args.sync_drive:
            settings.drive_sync_enabled = True
        try:
            result = run_ingest(settings)
        except Exception as exc:  # noqa: BLE001
            print(json.dumps({"ok": False, "error": str(exc)}, ensure_ascii=False, indent=2))
            return 1
        print(json.dumps({"ok": True, **result}, ensure_ascii=False, indent=2, default=str))
        return 0

    if args.cmd == "chat":
        from jarvis_worker.chat import chat_repl

        chat_repl(settings)
        return 0

    if args.cmd == "ask":
        from jarvis_worker.chat import chat_once

        q = " ".join(args.question)
        try:
            print(chat_once(q, settings))
        except Exception as exc:  # noqa: BLE001
            print(f"Fel: {exc}")
            return 1
        return 0

    return 2


if __name__ == "__main__":
    sys.exit(main())
