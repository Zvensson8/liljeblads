from functools import lru_cache
from pathlib import Path

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        extra="ignore",
    )

    liljeblads_webhook_url: str = (
        "https://ojiswgqntenvbwtopxbu.supabase.co/functions/v1/crewai-webhook"
    )
    liljeblads_api_key: str = ""

    google_api_key: str = ""
    gemini_model: str = "gemini-flash-latest"

    inbox_dir: Path = Path("./inbox")
    archive_dir: Path = Path("./inbox/processed")
    failed_dir: Path = Path("./inbox/failed")

    # dry_run = no writes
    # live | suggest = create WO + service (default production)
    # hitl = log service optional; WO → pending ai_suggested_actions for review
    mode: str = "live"
    auto_log_service: bool = True
    auto_create_work_orders: bool = True
    source_label: str = "jarvis_inbox"

    # Optional email summary after ingest
    resend_api_key: str = ""
    resend_from: str = "Liljeblads <onboarding@resend.dev>"
    notify_email: str = ""

    # Google Drive inbox (optional)
    google_drive_folder_id: str = ""
    google_application_credentials: str = ""  # path to service account JSON
    google_drive_access_token: str = ""  # optional short-lived token
    drive_sync_enabled: bool = False


@lru_cache
def get_settings() -> Settings:
    return Settings()
