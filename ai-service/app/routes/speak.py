from fastapi import APIRouter, Response
from pydantic import BaseModel, Field

from app.tts.edge_service import synthesize

router = APIRouter(tags=["speak"])


class SpeakRequest(BaseModel):
    text: str = Field(min_length=1, max_length=2000)


@router.post("/speak")
async def speak(body: SpeakRequest) -> Response:
    audio = await synthesize(body.text)
    return Response(content=audio, media_type="audio/mpeg")
