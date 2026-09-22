import json
from functools import lru_cache
from pathlib import Path

from llama_cpp import Llama, LlamaGrammar

from app.config import get_settings
from app.schemas.intent import Intent

GRAMMAR_PATH = Path(__file__).parent / "grammar.gbnf"

SYSTEM_PROMPT = """Eres el interpretador de comandos de voz de VoxPay, un POS por voz.
Convierte la transcripción del comerciante en un JSON de intención.
Intenciones válidas: create_order, get_order_status, get_sales_summary, unknown.
Si no puedes determinar la intención con seguridad, responde intent="unknown"
con confidence baja en lugar de adivinar montos o destinatarios."""


@lru_cache
def get_grammar() -> LlamaGrammar:
    return LlamaGrammar.from_file(str(GRAMMAR_PATH))


@lru_cache
def get_model() -> Llama:
    settings = get_settings()
    return Llama(
        model_path=settings.llm_model_path,
        n_ctx=settings.llm_context_size,
        verbose=False,
    )


def interpret(transcript: str) -> Intent:
    model = get_model()
    completion = model.create_chat_completion(
        messages=[
            {"role": "system", "content": SYSTEM_PROMPT},
            {"role": "user", "content": transcript},
        ],
        grammar=get_grammar(),
        temperature=0.1,
    )
    raw = completion["choices"][0]["message"]["content"]
    return Intent.model_validate(json.loads(raw))
