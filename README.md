# VoxPay

POS inteligente por voz: el comerciante habla, un agente de IA interpreta el cobro y Stellar lo ejecuta,
reparte y deja evidencia verificable en testnet. Participa en Stellar Build Peru, track Open Build.

> **Estado del proyecto**: en desarrollo activo (scaffolding completo, integración en curso). El detalle
> exacto de qué está implementado, qué falta y en qué orden se construye está en
> [`plan-desarrollo.md`](plan-desarrollo.md) — leerlo antes de tocar código.

## Arquitectura

Cinco componentes desplegables por separado: frontend, API, worker, servicio de IA y contrato Soroban,
más PostgreSQL y Redis como infraestructura. Diagrama y decisiones completas en
[`VoxPay - Arquitectura del Sistema.pdf`](<VoxPay - Arquitectura del Sistema.pdf>).

| Componente | Stack | Carpeta |
| --- | --- | --- |
| Frontend | Next.js 16 (App Router) + TypeScript + Tailwind | [`frontend/`](frontend/) |
| API + worker | NestJS 12 + Prisma 7 + BullMQ | [`backend/`](backend/) |
| Servicio de IA (Raven) | FastAPI + faster-whisper + Qwen 3B (llama.cpp) | [`ai-service/`](ai-service/) |
| Contrato | Rust + soroban-sdk | [`contracts/voxpay/`](contracts/voxpay/) |
| Infra local | PostgreSQL + Redis | [`docker-compose.yml`](docker-compose.yml) |

## Requisitos

- Node.js 20+ y npm (frontend y backend)
- Python 3.11+ (ai-service)
- Docker (PostgreSQL/Redis locales)
- Rust + `wasm32-unknown-unknown` + [`stellar-cli`](https://developers.stellar.org/docs/tools/developer-tools/cli/) (solo para tocar el contrato)
- Navegador con una wallet de Stellar instalada — [Freighter](https://www.freighter.app/) o
  [xBull](https://xbull.app/) (solo para probar el frontend: conectar wallet y firmar pagos en
  `/pay/[orderId]`, vía `@creit.tech/stellar-wallets-kit`)

## Cómo correr en local

```bash
# 1. Infraestructura
docker compose up postgres redis

# 2. Backend (API)
cd backend
cp .env.example .env   # completar según plan-desarrollo.md, Fase 2 → Etapa 2.1
npm install
npx prisma migrate dev
npm run start:dev

# 3. Frontend
cd frontend
cp .env.example .env   # NEXT_PUBLIC_API_URL, NEXT_PUBLIC_NETWORK
npm install
npm run dev

# 4. Servicio de IA (opcional sin modelo GGUF real — ver restricciones en plan-desarrollo.md)
cd ai-service
cp .env.example .env
python -m venv .venv && source .venv/bin/activate  # .venv\Scripts\activate en Windows
pip install -r requirements-dev.txt
uvicorn app.main:app --reload
```

El proceso worker del backend (`npm run worker:dev`) y el contrato desplegado en testnet todavía no
están wireados/probados — ver el estado exacto por etapa en `plan-desarrollo.md`.

## Documentación

- [`plan-desarrollo.md`](plan-desarrollo.md) — plan de implementación por fases y etapas, con los
  contratos de API/WebSocket/colas y el estado real de cada módulo.
- [`VoxPay - Arquitectura del Sistema.pdf`](<VoxPay - Arquitectura del Sistema.pdf>) — arquitectura
  completa del sistema.
- [`docs/`](docs/) — ADRs, diagramas y la guía de demo.
