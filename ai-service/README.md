# Raven — ai-service

Servicio de IA de VoxPay: convierte audio en una intención de cobro estructurada.
Nunca firma transacciones ni mueve fondos; solo propone, el comerciante confirma.

## Desarrollo local

```bash
python -m venv .venv
source .venv/bin/activate  # .venv\Scripts\activate en Windows
pip install -r requirements-dev.txt
cp .env.example .env
uvicorn app.main:app --reload
```

## Endpoints

| Método | Ruta | Uso |
| --- | --- | --- |
| GET | `/health` | Liveness check |
| POST | `/transcribe` | Audio → texto (faster-whisper) |
| POST | `/interpret` | Texto → intención JSON (Qwen 3B + grammar) |

## Modelo

El modelo GGUF (`models/qwen3b-voxpay.gguf`) no se versiona en git; se descarga aparte
y se monta en `models/` (ver `docker-compose.yml` en la raíz del repo).
