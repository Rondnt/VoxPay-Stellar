from functools import lru_cache

import requests

from app.config import get_settings

GROQ_TRANSCRIPTION_URL = "https://api.groq.com/openai/v1/audio/transcriptions"


def _transcribe_groq(audio_path: str, language: str) -> str:
    settings = get_settings()
    with open(audio_path, "rb") as audio_file:
        response = requests.post(
            GROQ_TRANSCRIPTION_URL,
            headers={"Authorization": f"Bearer {settings.groq_api_key}"},
            data={
                "model": settings.groq_stt_model,
                "language": language,
                "response_format": "text",
            },
            files={"file": audio_file},
            timeout=30,
        )
    response.raise_for_status()
    return response.text.strip()


@lru_cache
def _get_local_model():
    from faster_whisper import WhisperModel

    settings = get_settings()
    return WhisperModel(
        settings.whisper_model,
        device=settings.whisper_device,
        compute_type=settings.whisper_compute_type,
    )


def _transcribe_local(audio_path: str, language: str) -> str:
    model = _get_local_model()
    segments, _info = model.transcribe(audio_path, language=language)
    return " ".join(segment.text.strip() for segment in segments)


def transcribe(audio_path: str, language: str = "es") -> str:
    settings = get_settings()
    if settings.ai_provider == "groq":
        return _transcribe_groq(audio_path, language)
    return _transcribe_local(audio_path, language)
