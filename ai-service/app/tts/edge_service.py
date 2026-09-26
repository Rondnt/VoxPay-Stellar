import edge_tts

from app.config import get_settings


async def synthesize(text: str, voice_name: str | None = None, rate: str | None = None) -> bytes:
    """Voz neuronal gratuita de Microsoft Edge -- mismo canal sin autenticar que usa el "leer en
    voz alta" del navegador. Sin API key, sin modelo propio que hostear; a cambio, depende de que
    los servidores de Microsoft respondan y de que este acceso no oficial siga funcionando."""
    settings = get_settings()
    communicate = edge_tts.Communicate(
        text,
        voice_name or settings.tts_voice,
        rate=rate or settings.tts_rate,
    )
    chunks = bytearray()
    async for chunk in communicate.stream():
        if chunk["type"] == "audio":
            chunks.extend(chunk["data"])
    return bytes(chunks)
