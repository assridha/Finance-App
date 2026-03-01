from datetime import datetime
from pathlib import Path
from fastapi import APIRouter, Depends, UploadFile, HTTPException
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
import os
import shutil
import tempfile

from db import get_db
from config import get_database_url

router = APIRouter(prefix="/backup", tags=["backup"])


def _db_path() -> Path:
    url = get_database_url()
    if url.startswith("sqlite+aiosqlite:///"):
        path = url.replace("sqlite+aiosqlite:///", "")
        return Path(path)
    raise HTTPException(500, "Backup only supported for SQLite")


@router.get("/export")
async def export_backup():
    """Download a copy of the SQLite database file."""
    path = _db_path()
    if not path.exists():
        raise HTTPException(404, "No database found")
    filename = f"finance-backup-{datetime.now().strftime('%Y%m%d-%H%M%S')}.db"
    return FileResponse(path, filename=filename, media_type="application/octet-stream")


@router.post("/import")
async def import_backup(
    file: UploadFile,
    confirm: bool = False,
    db: AsyncSession = Depends(get_db),
):
    """Restore from an exported .db file. Requires confirm=true."""
    if not confirm:
        raise HTTPException(400, "Set confirm=true to restore")
    if not file.filename or not file.filename.endswith(".db"):
        raise HTTPException(400, "Upload a .db file")
    path = _db_path()
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=".db") as tmp:
            content = await file.read()
            tmp.write(content)
            tmp_path = tmp.name
        shutil.copy(tmp_path, path)
        os.unlink(tmp_path)
    except Exception as e:
        raise HTTPException(500, str(e))
    return {"status": "ok", "message": "Database restored. Reload the app."}
