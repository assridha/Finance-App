import os
from pathlib import Path

from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    data_dir: str = "./data"
    database_url: str | None = None

    class Config:
        env_file = ".env"
        extra = "ignore"


def get_database_url() -> str:
    settings = Settings()
    if settings.database_url:
        return settings.database_url
    data_dir = os.environ.get("DATA_DIR", settings.data_dir)
    path = Path(data_dir)
    path.mkdir(parents=True, exist_ok=True)
    db_path = path / "finance.db"
    return f"sqlite+aiosqlite:///{db_path}"
