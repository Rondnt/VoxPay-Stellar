# VoxPay

POS inteligente por voz: el comerciante habla, un agente de IA interpreta el cobro y Stellar lo ejecuta,
reparte y deja evidencia verificable en testnet. Participa en Stellar Build Peru, track Open Build.

> **Estado del proyecto**: backend, contrato, ai-service y frontend integrados y probados de punta a
> punta contra Stellar Testnet real (no simulado) — voz → interpretación → orden on-chain →
> autorización del operador → pago con reparto, con dinero de prueba real. El detalle exacto de qué se
> construyó, cómo y en qué orden está en [`plan-desarrollo.md`](plan-desarrollo.md).

## Evidencia on-chain (testnet)

Contrato Soroban desplegado, inicializado y probado en Stellar Testnet con USDC real de testnet
(cobro → autorización del operador → pago con reparto), no solo simulado localmente.

- **Contract ID**: `CBFO53O3IHNMHCPAGJZXZMN2SOHA3BRKAJHAIRVNFKPZZD4E44BNX57Q`
- **Ver contrato en Stellar Expert**:
  https://stellar.expert/explorer/testnet/contract/CBFO53O3IHNMHCPAGJZXZMN2SOHA3BRKAJHAIRVNFKPZZD4E44BNX57Q
- **Ejemplo de ciclo completo real** (cobro de 30 USDC, reparto de 5 USDC a un destinatario, pagado
  por una cuenta distinta del comercio):
  https://stellar.expert/explorer/testnet/tx/cc45a65060bad03d8ab8d307e5c5da519a22b809401f7b76446eb03d366a904d

## Qué hace VoxPay

- **Cobro por voz**: el comerciante graba una instrucción ("Cobra 30 dólares por el pedido 20 y reparte
  5 a José") o la dispara diciendo la palabra de activación **"VoxPay"** sin tocar nada.
- **Interpretación por IA**: transcripción y extracción de intención vía Groq (Whisper + LLM), con
  guardas explícitas contra alucinar montos o destinatarios cuando no hay confianza suficiente.
- **Respuesta hablada**: VoxPay confirma el cobro entendido por voz (texto-a-voz neuronal) antes de que
  el comerciante lo apruebe.
- **Ejecución y reparto en Stellar**: la orden se registra en un contrato Soroban propio; al pagar, el
  contrato reparte el USDC entre el comercio y los destinatarios en una sola transacción atómica.
- **Cobro público por QR**: cada orden genera un link de pago (`/pay/[orderId]`) que cualquier wallet
  Stellar puede firmar — Freighter, xBull, o cualquier wallet mobile vía WalletConnect.
- **Multi-tenant real**: login por email/Google (Firebase Auth), con aprovisionamiento automático de
  negocio al primer ingreso.

## Arquitectura

Cinco componentes desplegables por separado: frontend, API, worker, servicio de IA y contrato Soroban,
más Redis y Firestore como infraestructura. Diagrama y decisiones completas en
[`VoxPay - Arquitectura del Sistema.pdf`](<VoxPay - Arquitectura del Sistema.pdf>).

| Componente | Stack | Carpeta |
| --- | --- | --- |
| Frontend | Next.js 16 (App Router) + TypeScript + Firebase Auth + Stellar Wallets Kit | [`frontend/`](frontend/) |
| API + worker | NestJS 12 + Firebase Admin (Firestore) + BullMQ | [`backend/`](backend/) |
| Servicio de IA (Raven) | FastAPI + Groq (STT + LLM) + edge-tts (voz) | [`ai-service/`](ai-service/) |
| Contrato | Rust + soroban-sdk — desplegado en Testnet (ver evidencia arriba) | [`contracts/voxpay/`](contracts/voxpay/) |
| Infra local | Redis + Firestore Emulator Suite | [`docker-compose.yml`](docker-compose.yml), [`firebase.json`](firebase.json) |

## Requisitos

- Node.js 20+ y npm (frontend y backend)
- Python 3.11+ (ai-service)
- Redis (local, vía Docker o un binario portable — no requiere admin)
- Java 21+ (solo para correr el Firestore/Auth Emulator Suite en local)
- Una API key de [Groq](https://console.groq.com/) (gratis) para `ai-service` — STT, interpretación y
  voz
- Rust + `wasm32v1-none` + [`stellar-cli`](https://developers.stellar.org/docs/tools/developer-tools/cli/)
  (solo para tocar el contrato; ya está desplegado, no hace falta para correr el resto)
- Navegador con una wallet de Stellar instalada — [Freighter](https://www.freighter.app/) o
  [xBull](https://xbull.app/) para probar el frontend en desktop; un Project ID gratis de
  [Reown/WalletConnect Cloud](https://cloud.reown.com) si además querés probar con una wallet mobile

## Cómo correr en local

```bash
# 1. Infraestructura: Redis + Firestore/Auth Emulator Suite
docker compose up redis
npx firebase-tools emulators:start --only firestore,auth   # requiere Java 21+ en PATH

# 2. Backend (API + worker, dos procesos separados)
cd backend
cp .env.example .env   # completar: JWT_SECRET, FIREBASE_PROJECT_ID, STELLAR_*, RAVEN_URL
npm install
npm run seed            # crea un tenant/merchant/recipient de prueba en el emulador
npm run start:dev        # proceso API, puerto 3001
npm run worker:dev       # proceso worker (en otra terminal) — consume las colas de BullMQ

# 3. Servicio de IA (ai-service / Raven)
cd ai-service
cp .env.example .env    # completar GROQ_API_KEY
python -m venv .venv && source .venv/bin/activate   # .venv\Scripts\activate en Windows
pip install -r requirements.txt
uvicorn app.main:app --reload   # puerto 8000

# 4. Frontend
cd frontend
cp .env.example .env.local   # NEXT_PUBLIC_FIREBASE_*, NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID, etc.
npm install
npm run dev              # puerto 3002 (o el que definas)
```

El estado exacto de cada etapa, las decisiones de diseño y los problemas reales encontrados y resueltos
en el camino están documentados con detalle en [`plan-desarrollo.md`](plan-desarrollo.md).

## Documentación

- [`plan-desarrollo.md`](plan-desarrollo.md) — plan de implementación por fases y etapas, con los
  contratos de API/WebSocket/colas y el estado real de cada módulo.
- [`VoxPay - Arquitectura del Sistema.pdf`](<VoxPay - Arquitectura del Sistema.pdf>) — arquitectura
  completa del sistema.
- [`docs/`](docs/) — ADRs, diagramas y la guía de demo.
