from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    host: str = "0.0.0.0"
    port: int = 8000

    # "groq" usa la API hospedada (sin modelo local); "local" usa faster-whisper/llama-cpp-python.
    ai_provider: Literal["groq", "local"] = "groq"

    groq_api_key: str = ""
    groq_llm_model: str = "openai/gpt-oss-20b"
    groq_stt_model: str = "whisper-large-v3-turbo"

    whisper_model: str = "small"
    whisper_device: str = "cpu"
    whisper_compute_type: str = "int8"

    llm_model_path: str = "models/qwen3b-voxpay.gguf"
    llm_context_size: int = 2048

    # Voz neuronal gratuita de Microsoft Edge (sin API key, mismo canal que "leer en voz alta" del
    # navegador). es-AR-ElenaNeural elegida a pedido del usuario tras comparar voces en el proyecto
    # Raven (D:\Projects\Raven\tests\fixtures\voice_compare_edge_*.mp3).
    tts_voice: str = "es-AR-ElenaNeural"
    tts_rate: str = "+0%"


@lru_cache
def get_settings() -> Settings:
    return Settings()
