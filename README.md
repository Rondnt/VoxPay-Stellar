# VoxPay

POS inteligente por voz: el comerciante habla, un agente de IA interpreta el cobro y Stellar lo ejecuta,
reparte y deja evidencia verificable en testnet. Participa en Stellar Build Peru, track Open Build.

**App en vivo**: https://voxpay--voxpay-gj.us-central1.hosted.app

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
- **Ejemplo de reparto entre varios destinatarios** (cobro de 40 USDC repartido en una sola transacción
  entre dos destinatarios distintos — 5 USDC y 8 USDC — y el resto, 27 USDC, al comercio):
  https://stellar.expert/explorer/testnet/tx/b85bc50bc52bfd3ddf830442997f1170011b3fef8e844b1ae6ea20464e857528

## Qué hace VoxPay

VoxPay tiene dos partes que conviene evaluar por separado. La **voz** es la capa de experiencia: la
forma en que el comerciante entra un cobro, sin teclear ni tocar una pantalla. El **reparto atómico en
Stellar** es la infraestructura financiera de fondo: un contrato que divide un cobro entre el comercio y
sus destinatarios en una sola transacción, sin que VoxPay custodie el dinero de nadie. Si mañana
desapareciera la interfaz de voz, ese reparto seguiría siendo un producto de pagos programables con
valor propio.

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

## Flujo de la demo y roles del contrato

El contrato Soroban ([`contracts/voxpay/src/lib.rs`](contracts/voxpay/src/lib.rs)) distingue tres roles,
cada uno con su propia firma — nadie puede mover fondos en nombre de otro:

- **Comercio (`merchant`)**: la cuenta de Stellar del negocio. Autoriza una sola vez al operador
  (`set_operator`) para que pueda crear cobros en su nombre; nunca entrega custodia de sus fondos.
- **Operador (`operator`)**: el backend de VoxPay. Una vez autorizado, firma `create_order` por el
  comercio — puede crear y cancelar órdenes, pero no puede mover el dinero de nadie.
- **Cliente (`payer`)**: quien paga. Firma su propia transacción `pay`; es el contrato, no VoxPay, quien
  reparte el USDC entre el comercio y los destinatarios dentro de esa misma transacción.

Flujo completo de un cobro:

1. **Autorización única**: el comercio firma `set_operator(merchant, operator)` desde su wallet (una
   sola vez, al conectar su cuenta en "Wallet del negocio").
2. **Cobro por voz**: el comerciante dicta el monto y el reparto; el agente de IA lo interpreta y
   VoxPay confirma por voz antes de que el comerciante apruebe.
3. **Orden on-chain**: el operador registra la orden con `create_order(operator, merchant, order_id,
   amount, splits)` — el contrato valida que el operador esté autorizado para ese comercio, que el
   monto sea válido y que los repartos no superen el total.
4. **Cobro público por QR**: se genera un link de pago (`/pay/[orderId]`) con ese `order_id`.
5. **Pago y reparto atómico**: el cliente conecta su wallet y firma `pay(payer, order_id)` — el
   contrato transfiere cada reparto a su destinatario y el resto al comercio en la misma transacción, y
   marca la orden como pagada.
6. **Cancelación** (opcional): el comercio o el operador pueden cancelar una orden mientras siga
   pendiente con `cancel_order(caller, order_id)`.

## Limitaciones y próximos pasos

Honestamente, esto es lo que la demo todavía no resuelve:

- **Testnet y USDC de prueba, no producción**: el contrato y las transacciones de evidencia corren en
  Stellar Testnet con dinero sin valor real.
- **El cliente necesita wallet y USDC**: hoy quien paga tiene que tener ya una wallet de Stellar
  (Freighter, xBull, o una mobile vía WalletConnect) fondeada con USDC. Esto es, con diferencia, lo más
  repetido en el feedback del hackathon: para que un comercio real lo adopte, falta una rampa desde
  moneda local — aceptar algo como Yape/Plin y liquidar en Stellar por detrás, o un socio de
  liquidación en soles. "Sin hardware ni banco" describe al comercio (no necesita un POS físico ni
  cuenta bancaria para cobrar), pero no resuelve todavía esa entrada/salida de dinero del ecosistema
  para el cliente final — es el siguiente paso más importante antes de un piloto real.
- **Sin validación con comerciantes reales todavía**: el producto no pasó por entrevistas ni por un
  turno real de trabajo con dueños de negocio; es el paso que sigue antes de iterar la UX de voz.
- **Reconocimiento de voz depende del navegador**: la palabra de activación usa la Web Speech API
  (Chrome/Edge), que envía el audio a los servidores de reconocimiento del navegador mientras está
  escuchando en segundo plano — no pasa por los servidores de VoxPay, pero tampoco es un modelo propio.
- **Sin modelo de monetización todavía**: no hay comisión ni cobro por uso implementado.

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
| Infra local | Docker Compose orquesta los 6 servicios (Redis, emulador de Firestore/Auth, backend API + worker, ai-service, frontend) | [`docker-compose.yml`](docker-compose.yml), [`firebase.json`](firebase.json) |

## Requisitos

- [Docker](https://www.docker.com/) (Desktop en Windows/Mac, Engine + Compose en Linux) — es lo único
  que hace falta instalar para correr todo el stack local; Node, Python, Redis y Java 21 quedan dentro
  de las imágenes, no hace falta instalarlos en el host.
- Una API key de [Groq](https://console.groq.com/) (gratis) para `ai-service` — STT, interpretación y
  voz
- Rust + `wasm32v1-none` + [`stellar-cli`](https://developers.stellar.org/docs/tools/developer-tools/cli/)
  (solo para tocar el contrato; ya está desplegado, no hace falta para correr el resto)
- Navegador con una wallet de Stellar instalada — [Freighter](https://www.freighter.app/) o
  [xBull](https://xbull.app/) para probar el frontend en desktop; un Project ID gratis de
  [Reown/WalletConnect Cloud](https://cloud.reown.com) si además querés probar con una wallet mobile

## Cómo correr en local

Un solo comando levanta todo (Redis, emulador de Firestore/Auth, backend API + worker, ai-service y
frontend), cada uno en su contenedor con hot-reload activado — no hace falta Java, Python ni nada
instalado en el host más que Docker:

```bash
# completar antes una vez: backend/.env, ai-service/.env, frontend/.env.local
# (copiar desde los .env.example de cada carpeta)
docker compose up
```

- Frontend: http://localhost:3000
- Backend API: http://localhost:3001 (docs en `/docs`, health en `/health`)
- ai-service: http://localhost:8000
- Emulador de Firebase (UI): http://localhost:4000

La primera vez que el emulador arranca, la base está vacía — registrate desde `/register` en el
frontend para disparar el auto-aprovisionamiento de tenant/merchant, o corré `npm run seed` dentro del
contenedor del backend (`docker compose exec backend-api npm run seed`) para tener datos de prueba.

Si preferís correr los procesos nativos sin Docker (por ejemplo para depurar con más control), el
detalle de cada comando por separado — incluyendo los requisitos de Java 21 para el emulador — sigue
documentado en [`plan-desarrollo.md`](plan-desarrollo.md); `start-all.ps1` en la raíz del repo automatiza
esa alternativa (Redis en Docker, el resto nativo) con un solo script de PowerShell.

El estado exacto de cada etapa, las decisiones de diseño y los problemas reales encontrados y resueltos
en el camino están documentados con detalle en [`plan-desarrollo.md`](plan-desarrollo.md).

## Documentación

- [`plan-desarrollo.md`](plan-desarrollo.md) — plan de implementación por fases y etapas, con los
  contratos de API/WebSocket/colas y el estado real de cada módulo.
- [`VoxPay - Arquitectura del Sistema.pdf`](<VoxPay - Arquitectura del Sistema.pdf>) — arquitectura
  completa del sistema.
- [`docs/`](docs/) — ADRs, diagramas y la guía de demo.

## Licencia

[MIT](LICENSE).
