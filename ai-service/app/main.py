from fastapi import FastAPI

from app.routes import health, interpret, transcribe

app = FastAPI(title="Raven — VoxPay AI service")

app.include_router(health.router)
app.include_router(transcribe.router)
app.include_router(interpret.router)
