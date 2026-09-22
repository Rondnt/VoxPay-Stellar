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
    with tempfile.NamedTemporaryFile(suffix=suffix, delete=True) as tmp:
        tmp.write(await audio.read())
        tmp.flush()
        transcript = transcribe(tmp.name)
    return TranscribeResponse(transcript=transcript)
