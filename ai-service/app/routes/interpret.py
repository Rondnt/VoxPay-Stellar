from fastapi import APIRouter
from pydantic import BaseModel

from app.llm.interpreter import interpret
from app.schemas.intent import Intent

router = APIRouter(tags=["interpret"])


class InterpretRequest(BaseModel):
    transcript: str


@router.post("/interpret", response_model=Intent)
async def interpret_transcript(body: InterpretRequest) -> Intent:
    return interpret(body.transcript)
