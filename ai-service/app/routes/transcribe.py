import tempfile
from pathlib import Path

from fastapi import APIRouter, UploadFile
from pydantic import BaseModel

from app.stt.transcriber import transcribe

router = APIRouter(tags=["transcribe"])


class TranscribeResponse(BaseModel):
    transcript: str


@router.post("/transcribe", response_model=TranscribeResponse)
async def transcribe_audio(audio: UploadFile) -> TranscribeResponse:
    suffix = Path(audio.filename or "audio.wav").suffix
    # `delete=True` mantiene el handle abierto durante el `with`; en Windows un segundo `open()`
    # sobre ese mismo path (acá o en `transcribe()`) falla con `PermissionError` mientras el primer
    # handle sigue vivo. Se cierra explícito y se borra en `finally` para andar en ambos OS.
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
        tmp.write(await audio.read())
        tmp_path = tmp.name
    try:
        transcript = transcribe(tmp_path)
    finally:
        Path(tmp_path).unlink(missing_ok=True)
    return TranscribeResponse(transcript=transcript)
