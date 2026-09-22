from functools import lru_cache

from faster_whisper import WhisperModel

from app.config import get_settings


@lru_cache
def get_model() -> WhisperModel:
    settings = get_settings()
    return WhisperModel(
        settings.whisper_model,
        device=settings.whisper_device,
        compute_type=settings.whisper_compute_type,
    )


def transcribe(audio_path: str, language: str = "es") -> str:
    model = get_model()
    segments, _info = model.transcribe(audio_path, language=language)
    return " ".join(segment.text.strip() for segment in segments)
