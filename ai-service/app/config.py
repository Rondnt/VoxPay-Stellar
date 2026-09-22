from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    host: str = "0.0.0.0"
    port: int = 8000

    whisper_model: str = "small"
    whisper_device: str = "cpu"
    whisper_compute_type: str = "int8"

    llm_model_path: str = "models/qwen3b-voxpay.gguf"
    llm_context_size: int = 2048


@lru_cache
def get_settings() -> Settings:
    return Settings()
