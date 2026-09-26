import json
from functools import lru_cache
from pathlib import Path

import requests

from app.config import get_settings
from app.schemas.intent import Intent

GRAMMAR_PATH = Path(__file__).parent / "grammar.gbnf"

SYSTEM_PROMPT = """Eres el interpretador de comandos de voz de VoxPay, un POS por voz.
Convierte la transcripción del comerciante en un JSON de intención con este esquema exacto,
sin texto adicional fuera del JSON:
{"intent": "create_order" | "get_order_status" | "get_sales_summary" | "unknown",
 "amount": number|null, "asset": string|null, "order_ref": string|null,
 "splits": [{"recipient_alias": string, "amount": number, "type": "tip"|"share"}],
 "confidence": number entre 0 y 1}
VoxPay solo opera en USDC — es el único asset que el negocio puede cobrar. Si el comerciante dice
"dólares", "USD", "plata", "soles" o cualquier palabra genérica para dinero, poné siempre
"asset": "USDC" (nunca "USD" ni ninguna otra variante); no le pidas al comerciante que diga "USDC"
explícitamente, nadie habla así en la vida real.
Si no podés determinar la intención con seguridad, respondé intent="unknown" con confidence baja en
lugar de adivinar montos o destinatarios."""

GROQ_CHAT_URL = "https://api.groq.com/openai/v1/chat/completions"


def _interpret_groq(transcript: str) -> Intent:
    settings = get_settings()
    response = requests.post(
        GROQ_CHAT_URL,
        headers={"Authorization": f"Bearer {settings.groq_api_key}"},
        json={
            "model": settings.groq_llm_model,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {"role": "user", "content": transcript},
            ],
            "temperature": 0.1,
            "response_format": {"type": "json_object"},
        },
        timeout=15,
    )
    response.raise_for_status()
    raw = response.json()["choices"][0]["message"]["content"]
    return Intent.model_validate(json.loads(raw))


@lru_cache
def _get_grammar():
    from llama_cpp import LlamaGrammar

    return LlamaGrammar.from_file(str(GRAMMAR_PATH))


@lru_cache
def _get_local_model():
    from llama_cpp import Llama

    settings = get_settings()
    return Llama(
        model_path=settings.llm_model_path,
        n_ctx=settings.llm_context_size,
        verbose=False,
    )


def _interpret_local(transcript: str) -> Intent:
    model = _get_local_model()
    completion = model.create_chat_completion(
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": transcript},
        ],
        grammar=_get_grammar(),
        temperature=0.1,
    )
    raw = completion["choices"][0]["message"]["content"]
    return Intent.model_validate(json.loads(raw))


def interpret(transcript: str) -> Intent:
    settings = get_settings()
    if settings.ai_provider == "groq":
        return _interpret_groq(transcript)
    return _interpret_local(transcript)
