# VoxPay — Plan de desarrollo

## Índice

1. [Contexto](#contexto)
2. [Estado actual](#estado-actual)
3. [Restricciones de entorno](#restricciones-de-entorno-detectadas)
4. [Fase 1 — Backend: módulos de dominio y contratos](#fase-1--backend-módulos-de-dominio-y-contratos)
5. [Fase 2 — Integración local y smoke test](#fase-2--integración-local-y-smoke-test)
6. [Fase 3 — Contrato Soroban: build, test y deploy](#fase-3--contrato-soroban-build-test-y-deploy)
7. [Fase 4 — Frontend: conectar con la API real](#fase-4--frontend-conectar-con-la-api-real)
8. [Fase 5 — Testing y CI verde](#fase-5--testing-y-ci-verde)
9. [Fase 6 — Pulido para la demo](#fase-6--pulido-para-la-demo)
10. [Verificación general](#verificación-general)

Cada fase se divide en **etapas**: unidades de trabajo más chicas, con objetivo, contrato (si aplica),
implementación (detallada a nivel de archivo/clase/método) y verificación propias. Las etapas dentro de
una fase son secuenciales salvo que se indique lo contrario. Las etapas ya completadas documentan
**qué se implementó exactamente**, no solo un checklist — sirven como referencia para las etapas
siguientes que dependen de ellas. Las etapas pendientes traen **pasos numerados** con archivos, firmas de
método y lógica exacta a seguir.

## Contexto

VoxPay es un POS SaaS por voz sobre Stellar (ver `VoxPay - Arquitectura del Sistema.pdf`). Se clonó el
repo y se armó el andamiaje de los cinco componentes. Este documento es la fuente de verdad de qué se
construye, con qué forma exacta (contratos), en qué etapas y con qué nivel de implementación. Se
actualiza a medida que avanza cada etapa.

## Estado actual

- **Repo**: `frontend/ backend/ ai-service/ contracts/voxpay/ docs/` + `docker-compose.yml` +
  `.github/workflows/*.yml` (uno por proyecto) + `.gitignore` raíz.
- **frontend/**: Next.js 16 scaffolded, compila (`npm run build`/`lint` verdes). Rutas creadas pero
  estáticas (sin fetch real). Detalle: [Fase 4](#fase-4--frontend-conectar-con-la-api-real).
- **contracts/voxpay/**: contrato Soroban en Rust completo. No verificado (sin `cargo`/`rustc`/`stellar`
  CLI en este entorno). Detalle: [Fase 3](#fase-3--contrato-soroban-build-test-y-deploy).
- **ai-service/**: FastAPI completo (`/health /transcribe /interpret`). No verificado en runtime (falta
  modelo GGUF real). Contrato: [Fase 1 → Etapa 1.7](#etapa-17--módulo-voice-agent-y-cola-voice-commands).
- **backend/**: NestJS 12 + Prisma 7 + TS 6, ESM (`.js` en imports relativos, obligatorio por
  `moduleResolution: nodenext` — todo import relativo entre archivos `.ts` propios debe terminar en
  `.js`). Detalle módulo por módulo: [Fase 1](#fase-1--backend-módulos-de-dominio-y-contratos).

## Restricciones de entorno detectadas

- No hay `cargo`, `rustc` ni `stellar` CLI en este entorno → el contrato no se puede compilar, testear ni
  desplegar a testnet desde aquí (Fase 3 corre en la máquina del usuario o en CI).
- `ai-service` necesita un modelo GGUF real (Qwen 3B afinado) para probar `/interpret` de punta a punta.
- Next.js 16 y Prisma 7 tienen breaking changes fuertes respecto a versiones anteriores (`proxy.ts` en
  vez de `middleware.ts`; generator/config/adapter nuevos en Prisma 7 con driver adapter obligatorio —
  ver Etapa 1.1).

---

## Fase 1 — Backend: módulos de dominio y contratos

Objetivo de la fase: `npm run build` y `npm run lint` verdes en `backend/`, todos los contratos de esta
fase implementados y wireados en `app.module.ts` (proceso API) / `worker.module.ts` (proceso worker,
nuevo). Se divide en 11 etapas, en orden de dependencia (cada etapa asume que las anteriores ya existen).

### Etapa 1.1 — Convenciones generales y modelo de datos

**Estado**: Completada.

**Objetivo**: fijar las reglas que valen para todos los endpoints antes de construirlos, y tener el
schema de datos listo.

**Convenciones generales de la API** (aplican a todas las etapas siguientes):

- **Base URL**: `http://localhost:3001` en desarrollo (`PORT` en `.env`). Prefijo `/v1` en rutas de
  negocio.
- **Auth**: header `Authorization: Bearer <JWT>`. El JWT lo emite `POST /v1/auth/login`, payload
  `{ sub: userId, tenantId, role }` (`JwtStrategy`). Rutas `Public` (decorador `@Public()`,
  `backend/src/common/decorators/public.decorator.ts`) no requieren header.
- **Multi-tenancy**: `TenantGuard` (`backend/src/common/guards/tenant.guard.ts`) resuelve
  `request.tenantId` desde `request.user.tenantId` (seteado por `JwtStrategy.validate`); los
  controllers lo leen con `@CurrentTenant()` (`backend/src/common/decorators/current-tenant.decorator.ts`).
  Toda consulta a Postgres debe filtrar por el `merchantId` que pertenece a ese `tenantId` (gap
  pendiente, ver Etapa 1.10).
  **Bug detectado en esta revisión**: `TenantGuard.canActivate` hoy no chequea `@Public()` (a diferencia
  de `JwtAuthGuard`, que sí lo hace vía `Reflector`) — si se registra como `APP_GUARD` global en la
  Etapa 1.11 tal como estaba planeado, rompe con `401 Missing tenant context` **todas** las rutas
  públicas, incluido `POST /v1/auth/login` (nadie podría loguearse, porque en ese request todavía no
  existe `request.user`). Fix obligatorio antes de la Etapa 1.11, ver Etapa 1.10.
- **Content-Type**: `application/json` salvo `POST /v1/voice/commands` (`multipart/form-data`, campo
  `audio`).
- **Formato de error** (`AllExceptionsFilter`, `backend/src/common/filters/all-exceptions.filter.ts`):
  ```json
  { "statusCode": 404, "message": "Order not found", "timestamp": "2026-09-22T18:00:00.000Z" }
  ```
  Errores de validación (`class-validator` vía `ValidationPipe` global) devuelven `message` como array
  de strings.
- **Montos**: campos `Decimal` de Prisma (`amount`, `defaultShare`) serializan como **string** (ej.
  `"30"`).
- **IDs**: `cuid()` strings. **Paginación**: ninguna todavía.

**Modelo de datos** — implementación exacta en `backend/prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client"      // Prisma 7: reemplaza a "prisma-client-js"
  output   = "../generated/prisma" // obligatorio en v7, ya no es node_modules implícito
}

datasource db {
  provider = "postgresql"
}
```

El cliente generado vive en `backend/generated/prisma/` (gitignored). Dos puntos de import distintos, con
la misma profundidad relativa (`../../../generated/prisma/client.js`) porque tanto
`src/infrastructure/prisma/` como `src/modules/<módulo>/` están 3 niveles debajo de `backend/`:
`PrismaService` importa solo `PrismaClient`; los repositories (`OrdersRepository`,
`RecipientsRepository`, etc.) importan `type { Prisma }` para los tipos `Prisma.*UncheckedCreateInput`/
`UncheckedUpdateInput`. Prisma 7 exige un **driver adapter** explícito — se usa `@prisma/adapter-pg`:

```ts
// backend/src/infrastructure/prisma/prisma.service.ts
const adapter = new PrismaPg({ connectionString: config.getOrThrow<string>('DATABASE_URL') });
super({ adapter });
```

La config de CLI vive en `backend/prisma7.config.ts` (nombre versionado que genera `prisma init` en esta
instalación de Prisma 7.10 — el CLI lo detecta automáticamente, confirmado con `prisma generate`).

| Modelo | Campos clave | Notas |
| --- | --- | --- |
| `Tenant` | `id, name, plan, apiKeyHash, createdAt` | Negocio SaaS |
| `User` | `id, tenantId, email, passwordHash, role(OWNER\|CASHIER)` | único por `(tenantId, email)` |
| `Merchant` | `id, tenantId, stellarAddress, operatorAuthorized` | 1 merchant activo por tenant en el MVP |
| `Recipient` | `id, merchantId, alias, stellarAddress, defaultShare?` | único por `(merchantId, alias)` → clave compuesta Prisma `merchantId_alias` |
| `VoiceCommand` | `id, merchantId, transcript, intentJson, status(PENDING\|CONFIRMED\|REJECTED\|UNKNOWN)` | auditoría de IA |
| `Order` | `id, merchantId, orderRef, amount, splitsJson, status(PENDING\|PAID\|CANCELLED), createTxHash?, payTxHash?` | único por `(merchantId, orderRef)` → clave compuesta `merchantId_orderRef` |
| `ChainEvent` | `id, type, orderId, ledger(BigInt), txHash, payload` | para el indexador (no implementado) |
| `IndexerCursor` | `id="default", lastLedger(BigInt)` | punto de reanudación del indexador |
| `IdempotencyKey` | `key, tenantId, response, expiresAt` | no usado todavía por ningún endpoint |

`splitsJson` de `Order` almacena `{ recipientAlias, stellarAddress, amount }[]` (resuelto al crear la
orden, ver Etapa 1.5). `intentJson` de `VoiceCommand` almacena la forma cruda que devuelve Raven (ver
Etapa 1.7).

**Verificación de la etapa**: `npx prisma generate` corre sin errores; `generated/prisma/client.ts`
expone los 9 modelos y `Prisma.RecipientUncheckedCreateInput`/`Prisma.OrderUncheckedCreateInput` (usados
en las Etapas 1.4/1.5).

### Etapa 1.2 — Auth

**Estado**: Completada.

**Objetivo**: login de comerciante y emisión de JWT.

**Contrato — `POST /v1/auth/login`**
- **Auth**: Public
- **Request body**: `email` (string, `@IsEmail()`) · `password` (string, `@IsString() @MinLength(8)`)
- **Response 200** *(hoy 201 por default de Nest — pendiente en Etapa 1.10)*: `{ "accessToken": "eyJhbGciOi..." }`
- **Errores**: `401 Invalid credentials` · `400` validación.

**Implementación** (`backend/src/modules/auth/`):

- `dto/login.dto.ts` — `LoginDto { email: string; password: string }` con los validadores de arriba.
- `strategies/jwt.strategy.ts` — `JwtStrategy extends PassportStrategy(Strategy)`; constructor configura
  `jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken()`, `secretOrKey:
  config.getOrThrow('JWT_SECRET')`; `validate(payload: JwtPayload)` devuelve el payload tal cual (queda
  en `request.user`).
- `auth.service.ts` — `AuthService.login(email, password)`: busca `User` con
  `prisma.user.findFirst({ where: { email } })` (nota: `email` es único solo por `(tenantId, email)`, no
  globalmente — el primer match alcanza para el MVP, ver limitación documentada en el código), compara
  con `bcrypt.compare` (paquete `bcryptjs`), firma `{ sub: user.id, tenantId: user.tenantId, role:
  user.role }` con `JwtService.signAsync`.
- `auth.controller.ts` — `POST v1/auth/login`, decorado `@Public()`, delega a `AuthService.login`.
- `auth.module.ts` — `PassportModule`, `JwtModule.registerAsync` con `secret` desde `ConfigService` y
  `signOptions: { expiresIn: '12h' }`; exporta `JwtModule` (lo necesita `JwtAuthGuard` global en la
  Etapa 1.11).

**Verificación de la etapa**: con un `User` de prueba en la base, `POST /v1/auth/login` devuelve un JWT
válido que `JwtStrategy.validate()` acepta; un `Authorization: Bearer <token>` inválido en cualquier ruta
protegida responde `401`.

### Etapa 1.3 — Tenants y Merchants

**Estado**: Completada.

**Objetivo**: resolver el tenant del negocio y exponer el perfil/autorización on-chain del comerciante.

**Contrato — `GET /v1/merchants/me`**
- **Auth**: JWT
- **Response 200**: `Merchant` completo (`id, tenantId, stellarAddress, operatorAuthorized, createdAt`).
- **Errores**: `404 Merchant not found`.

**Contrato — `POST /v1/merchants/operator/tx`**
- **Auth**: JWT · sin body
- Arma el XDR sin firmar de `set_operator(merchant, operator)` (firma completa del contrato en
  [Fase 3, Etapa 3.1](#etapa-31--contrato-soroban-especificación)); el comerciante lo firma con su
  wallet.
- **Response 200** *(hoy 201 por default de Nest — pendiente en Etapa 1.10)*: `{ "xdr": "AAAAAgAAAAA..." }`
- **Errores**: `404 Merchant not found` · `500` si el RPC de Stellar falla.

**Contrato — `POST /v1/merchants/operator/submit`**
- **Auth**: JWT
- **Request body**: `{ "signedXdr": "AAAAAgAAAAA..." }`
- Envía el XDR firmado y marca `operatorAuthorized = true`.
- **Response 200** *(hoy 201 por default de Nest — pendiente en Etapa 1.10)*: `{ "hash": "3f2a..." }`
- **Errores**: `404 Merchant not found` · `500` tx rechazada por la red.

**Implementación**:

- `backend/src/modules/tenants/tenants.service.ts` — `TenantsService` (sin controller, servicio
  interno): `findByApiKeyHash(apiKeyHash)`, `findById(id)`, `create({name, apiKeyHash, plan?})`, todos
  sobre `PrismaService`.
- `backend/src/modules/merchants/merchants.service.ts` — `MerchantsService`:
  - `findByTenant(tenantId)`: `prisma.merchant.findFirst({where:{tenantId}})`, lanza `NotFoundException`
    si no existe (asume 1 merchant activo por tenant en el MVP).
  - `findById(id)`: `findUniqueOrThrow`.
  - `buildOperatorAuthorizationTx(tenantId)`: resuelve el merchant, llama
    `soroban.buildUnsignedInvocation(merchant.stellarAddress, 'set_operator',
    [SorobanService.addressArg(merchant.stellarAddress), SorobanService.addressArg(soroban.getOperatorPublicKey())])`.
  - `submitOperatorAuthorization(tenantId, signedXdr)`: resuelve el merchant, llama
    `soroban.submitSignedXdr(signedXdr)`, actualiza `operatorAuthorized: true`, devuelve `{hash}`.
- `backend/src/modules/merchants/merchants.controller.ts` — `GET me`, `POST operator/tx`,
  `POST operator/submit` (`dto/submit-operator-auth.dto.ts` con `signedXdr: string`).
- `backend/src/modules/merchants/merchants.module.ts` / `tenants.module.ts` — wiring estándar.

**Verificación de la etapa**: con un `Merchant` de prueba, `GET /v1/merchants/me` devuelve el registro;
`POST /v1/merchants/operator/tx` devuelve un XDR bien formado (decodificable con `stellar-sdk`
`TransactionBuilder.fromXDR`).

### Etapa 1.4 — Recipients (CRUD)

**Estado**: Completada.

**Objetivo**: agenda de destinatarios (alias → wallet) para armar los repartos.

**Contrato — `GET /v1/recipients`**
- **Auth**: JWT · **Response 200**: `Recipient[]` del merchant del tenant actual.

**Contrato — `POST /v1/recipients`**
- **Auth**: JWT
- **Request body**: `alias` (string) · `stellarAddress` (string) · `defaultShare` (number, opcional,
  `@Min(0)`)
- **Response 201**: `Recipient` creado.
- **Errores**: `400` validación · `409 Alias already exists` *(pendiente, ver Etapa 1.10 — hoy Prisma
  tira `P2002` sin capturar → 500)*.

**Contrato — `PATCH /v1/recipients/:id`**
- **Auth**: JWT · **Request body**: subconjunto parcial del create (`PartialType(CreateRecipientDto)`).
- **Response 200**: `Recipient` actualizado. **Errores**: `404 Recipient not found`.

**Contrato — `DELETE /v1/recipients/:id`**
- **Auth**: JWT
- **Response 204** *(hoy 200 con el registro borrado — pendiente en Etapa 1.10)*.
- **Errores**: `404 Recipient not found`.

**Implementación** (`backend/src/modules/recipients/`):

- `dto/create-recipient.dto.ts` — `CreateRecipientDto` con los validadores de arriba.
- `dto/update-recipient.dto.ts` — `UpdateRecipientDto extends PartialType(CreateRecipientDto)` (de
  `@nestjs/swagger`).
- `recipients.repository.ts` — `RecipientsRepository`: `findAllByMerchant(merchantId)`,
  `findOne(id, merchantId)` (scoping por merchant), `findByAlias(merchantId, alias)` (usa la clave
  compuesta `merchantId_alias` — la reutiliza `OrdersService` en la Etapa 1.5 para resolver splits por
  alias), `create(data: Prisma.RecipientUncheckedCreateInput)`, `update(id, data:
  Prisma.RecipientUncheckedUpdateInput)`, `delete(id)`.
- `recipients.service.ts` — `RecipientsService`: cada método resuelve primero `merchants.findByTenant`
  para no confiar en un `merchantId` recibido del cliente; `update`/`remove` verifican con
  `repository.findOne(id, merchant.id)` antes de mutar, lanzando `NotFoundException` si no matchea.
- `recipients.controller.ts` — `GET/POST/PATCH/DELETE` sobre `v1/recipients`, todos leen
  `@CurrentTenant() tenantId`.
- `recipients.module.ts` — importa `MerchantsModule` (para `MerchantsService`).

**Verificación de la etapa**: CRUD completo contra un `Merchant` de prueba, incluyendo que `PATCH`/
`DELETE` sobre un id de otro merchant devuelvan `404`.

### Etapa 1.5 — Orders y cola `orders`

**Estado**: Completada.

**Objetivo**: crear/consultar órdenes y disparar su creación on-chain de forma asíncrona.

**Contrato — `GET /v1/orders/:id`**
- **Auth**: JWT
- **Response 200**: `Order` completo (`id, merchantId, orderRef, amount, splitsJson, status,
  createTxHash, payTxHash, createdAt`).
- **Errores**: `404 Order not found`.
- **Gap conocido**: no valida que el `Order` pertenezca al merchant del `tenantId` del JWT — cualquier
  usuario autenticado puede leer cualquier orden por id. Pendiente en Etapa 1.10.

**Contrato — `GET /v1/public/orders/:id`**
- **Auth**: Public
- **Response 200**: `{ "id": "cl...", "orderRef": "52", "amount": "30", "status": "PENDING", "payTxHash": null }`
- **Errores**: `404 Order not found`.

**Contrato — Cola `orders` (BullMQ)**
- **Job** `create_order` — payload `{ "orderId": "cl..." }`
- **Productor**: `OrdersService.createFromIntent` (proceso API, disparado desde Etapa 1.7 al confirmar
  una intención de voz).
- **Consumidor**: `OrdersProcessor` (proceso worker, ver abajo).
- **Retries**: `attempts: 5`, backoff exponencial `2000ms` (`QueueModule.forRootAsync`, config global
  para todas las colas).

**Implementación**:

- `backend/src/modules/orders/orders.repository.ts` — `OrdersRepository`: `findById(id)`,
  `findByMerchantAndRef(merchantId, orderRef)` (clave compuesta `merchantId_orderRef`),
  `create(data: Prisma.OrderUncheckedCreateInput)`, `update(id, data:
  Prisma.OrderUncheckedUpdateInput)`, `sumPaidSince(merchantId, since: Date)` (usa
  `prisma.order.aggregate({where:{merchantId, status:'PAID', createdAt:{gte:since}}, _sum:{amount:true},
  _count:true})` — la reutiliza `AnalyticsService` en la Etapa 1.9).
- `backend/src/modules/orders/orders.service.ts` — `OrdersService.createFromIntent(merchantId, dto:
  CreateOrderDto)`:
  1. Por cada `split` del dto, `recipients.findByAlias(merchantId, split.recipientAlias)`; si no existe,
     `BadRequestException('Unknown recipient alias: <alias>')`.
  2. Acumula `splitsTotal`; si supera `dto.amount`, `BadRequestException('Splits exceed order amount')`.
  3. `repository.create({merchantId, orderRef: dto.orderRef, amount: dto.amount, splitsJson:
     resolvedSplits, status: 'PENDING'})` donde `resolvedSplits` es
     `{recipientAlias, stellarAddress, amount}[]`.
  4. `ordersQueue.add('create_order', {orderId: order.id})` (cola inyectada con
     `@InjectQueue(QUEUE_NAMES.ORDERS)`).
  - `findById(id)`: `NotFoundException` si no existe.
  - `findPublic(id)`: proyecta solo `{id, orderRef, amount, status, payTxHash}`.
- `backend/src/modules/orders/dto/create-order.dto.ts` — `CreateOrderDto { orderRef: string; amount:
  number; splits: OrderSplitDto[] }`, `OrderSplitDto { recipientAlias: string; amount: number }` (uso
  interno, lo arma `VoiceAgentService.confirm` en la Etapa 1.7 — no es el body de un endpoint público).
- `backend/src/modules/orders/orders.controller.ts` — `GET v1/orders/:id` (JWT), `GET
  v1/public/orders/:id` (`@Public()`).
- `backend/src/modules/orders/orders.processor.ts` — `OrdersProcessor extends WorkerHost`, decorado
  `@Processor(QUEUE_NAMES.ORDERS)`. `process(job: Job<{orderId: string}>)`:
  1. `repository.findById(job.data.orderId)`; si no existe, `logger.warn` y `return` (no reintenta un
     job sobre una orden que ya no existe).
  2. `merchants.findById(order.merchantId)`.
  3. Arma `splitsArg` con `nativeToScVal(splits.map(s => ({recipient: new
     Address(s.stellarAddress), amount: BigInt(Math.trunc(s.amount))})))` — **nota de integración**: sin
     el spec del contrato (no hay bindings generados todavía) el encoding exacto de `Vec<Split>` no está
     validado contra el contrato real; primer punto a probar en Fase 3.
  4. `soroban.invokeAsOperator('create_order', [addressArg(operatorPublicKey), addressArg(merchant.
     stellarAddress), stringArg(order.orderRef), i128Arg(order.amount.toString()), splitsArg])`.
  5. `repository.update(order.id, {createTxHash: hash})`.
  6. `notifications.publish(order.merchantId, 'order:created', {orderId, orderRef, hash})`.
- `backend/src/modules/orders/orders.module.ts` — `BullModule.registerQueue({name:
  QUEUE_NAMES.ORDERS})`, importa `RecipientsModule`; controllers `[OrdersController]`, providers
  `[OrdersService, OrdersRepository]`, exports ambos.
- `backend/src/modules/orders/orders.worker.module.ts` — importa `OrdersModule` (reusa
  `OrdersRepository`), `MerchantsModule`, `NotificationsPublisherModule`, registra la misma cola;
  providers `[OrdersProcessor]`. Solo lo importa `worker.module.ts` (Etapa 1.11) — así la API nunca
  arranca un `Worker` de BullMQ consumiendo jobs.

**Verificación de la etapa**: `GET /v1/orders/:id` y `GET /v1/public/orders/:id` devuelven las formas
documentadas contra un `Order` de prueba insertado directo en la base (sin pasar todavía por la cola).

### Etapa 1.6 — Payments

**Estado**: Completada.

**Objetivo**: armar y enviar el pago del cliente final (`pay()`), sin autenticación (página pública).

**Contrato — `POST /v1/public/orders/:id/tx`**
- **Auth**: Public · **Request body**: `{ "payerPublicKey": "GABC..." }`
- Arma el XDR sin firmar de `pay(payer, order_id)`.
- **Response 200** *(hoy 201 por default de Nest — pendiente en Etapa 1.10)*: `{ "xdr": "AAAAAgAAAAA..." }`
- **Errores**: `404 Order not found` · `500` RPC/simulación falla.

**Contrato — `POST /v1/public/orders/:id/submit`**
- **Auth**: Public · **Request body**: `{ "signedXdr": "AAAAAgAAAAA..." }`
- Envía el XDR firmado; marca `Order.status = PAID`, `payTxHash`, publica `order:paid` (Etapa 1.8).
- **Response 200** *(hoy 201 por default de Nest — pendiente en Etapa 1.10)*: `{ "hash": "3f2a..." }`
- **Errores**: `404 Order not found` · `500` tx rechazada.

**Implementación** (`backend/src/modules/payments/`):

- `payments.service.ts` — `PaymentsService`:
  - `buildPaymentTx(orderId, payerPublicKey)`: resuelve `order` con `OrdersRepository.findById` (
    `NotFoundException` si no existe), llama `soroban.buildUnsignedInvocation(payerPublicKey, 'pay',
    [addressArg(payerPublicKey), stringArg(order.orderRef)])`.
  - `submitPayment(orderId, signedXdr)`: `soroban.submitSignedXdr(signedXdr)`, `orders.update(order.id,
    {status:'PAID', payTxHash: result.hash})`, `notifications.publish(order.merchantId, 'order:paid',
    {orderId, orderRef, hash})`, devuelve `{hash}`.
- `dto/build-payment-tx.dto.ts` — `{ payerPublicKey: string }`. `dto/submit-payment.dto.ts` — `{
  signedXdr: string }`.
- `payments.controller.ts` — controlador entero decorado `@Public()` a nivel de clase (`@Controller('v1/
  public/orders/:id')`), rutas `POST tx` y `POST submit`.
- `payments.module.ts` — importa `OrdersModule` (repository) y `NotificationsPublisherModule`.

**Verificación de la etapa**: contra un `Order` de prueba en `PENDING`, `POST .../tx` devuelve un XDR
bien formado; `POST .../submit` (con un XDR simulado/mock si todavía no hay contrato real) deja trazado
el flujo de actualización de estado.

### Etapa 1.7 — Módulo Voice Agent y cola `voice-commands`

**Estado**: Parcial — `voice-agent.controller.ts` y `voice-agent.service.ts` ya existen; falta
`voice-agent.processor.ts` y los dos módulos de wiring.

**Objetivo**: subir audio, interpretarlo con Raven de forma asíncrona, y confirmar la intención para
crear la orden.

**Contrato — `POST /v1/voice/commands`**
- **Auth**: JWT · `Content-Type: multipart/form-data`, campo `audio`.
- Crea un `VoiceCommand` en `PENDING` y encola `interpret` en la cola `voice-commands`; el resultado
  llega async por WebSocket (`voice:confirmation`, Etapa 1.8).
- **Response 201**: `{ "commandId": "cl..." }`
- **Errores**: `400 audio file is required` · `404 Merchant not found`.

**Contrato — `POST /v1/voice/commands/:id/confirm`**
- **Auth**: JWT · sin body
- **Response 201**: `Order` creado.
- **Errores**: `404 Voice command not found` · `400 Command has no confirmable create_order intent` ·
  `400 Unknown recipient alias: <alias>` · `400 Splits exceed order amount`.

**Contrato — Cola `voice-commands` (BullMQ)**
- **Job** `interpret` — payload `{ "commandId": "cl...", "audioBase64": "...", "filename": "audio.webm" }`
- **Productor**: `VoiceAgentService.createCommand` (proceso API).
- **Consumidor**: `VoiceAgentProcessor` *(pendiente)*.

**Contrato ai-service (Raven)** — consumido por `AgentProvider`/`VoiceAgentProcessor`, ya implementado en
`ai-service/`, sin verificar en runtime (falta modelo GGUF):

- `GET /health` → `{ "status": "ok" }`
- `POST /transcribe` (`multipart/form-data`, campo `audio`) → `{ "transcript": "cobra 30 usdc..." }`
- `POST /interpret` body `{ "transcript": "string" }` → (forzado por `llm/grammar.gbnf`):
  ```json
  {
    "intent": "create_order",
    "amount": 30,
    "asset": "USDC",
    "order_ref": "52",
    "splits": [{ "recipient_alias": "José", "amount": 3, "type": "tip" }],
    "confidence": 0.93
  }
  ```
  `intent` ∈ `create_order | get_order_status | get_sales_summary | unknown`; `splits[].type` ∈
  `tip | share`.

**Ya implementado** — `backend/src/modules/voice-agent/`:

- `voice-agent.service.ts` — `VoiceAgentService`:
  - `createCommand(tenantId, audio?: Express.Multer.File)`: si no hay `audio`,
    `BadRequestException('audio file is required')`; resuelve `merchant`; crea `VoiceCommand` vacío
    (`transcript: '', intentJson: {}, status: 'PENDING'`); encola `voiceQueue.add('interpret',
    {commandId, audioBase64: audio.buffer.toString('base64'), filename: audio.originalname})`; devuelve
    `{commandId}`.
  - `confirm(tenantId, commandId)`: resuelve `merchant` y `command` (`findFirst` scoped por
    `merchantId`, `NotFoundException` si no existe); castea `command.intentJson` a `StoredIntent { intent,
    order_ref?, amount?, splits?: {recipient_alias, amount}[] }`; si `intent !== 'create_order'` o
    faltan `order_ref`/`amount`, `BadRequestException('Command has no confirmable create_order
    intent')`; mapea `splits` a `CreateOrderDto` (`recipient_alias` → `recipientAlias`); llama
    `orders.createFromIntent(merchant.id, dto)` (Etapa 1.5, que valida alias/montos); marca
    `VoiceCommand.status = 'CONFIRMED'`; devuelve el `Order` creado.
- `voice-agent.controller.ts` — `POST v1/voice/commands` con
  `@UseInterceptors(FileInterceptor('audio'))` + `@UploadedFile()` (requiere `@types/multer`, ya
  instalado); `POST v1/voice/commands/:id/confirm`.

**Pendiente — pasos a implementar**:

1. **`voice-agent.processor.ts`** (nuevo archivo, mismo patrón que `orders.processor.ts` de la Etapa
   1.5):
   ```
   @Processor(QUEUE_NAMES.VOICE_COMMANDS)
   export class VoiceAgentProcessor extends WorkerHost {
     constructor(
       @Inject(AGENT_PROVIDER) private readonly agent: AgentProvider,
       private readonly prisma: PrismaService,
       private readonly notifications: NotificationsPublisher,
     ) { super(); }

     async process(job: Job<{commandId; audioBase64; filename}>) {
       // 1. command = prisma.voiceCommand.findUnique({where:{id: job.data.commandId}})
       //    si no existe: logger.warn + return (igual que OrdersProcessor)
       // 2. audio = Buffer.from(job.data.audioBase64, 'base64')
       // 3. transcript = await agent.transcribe(audio, job.data.filename)
       // 4. intent = await agent.interpret(transcript)   // VoiceIntent: {intent, amount?, asset?,
       //    orderRef?, splits: {recipientAlias, amount, type}[], confidence}
       // 5. status = (intent.confidence < 0.6 || intent.intent === 'unknown') ? 'UNKNOWN' : 'PENDING'
       // 6. prisma.voiceCommand.update({where:{id: command.id}, data: {
       //      transcript,
       //      intentJson: { intent: intent.intent, amount: intent.amount ?? null,
       //                     asset: intent.asset ?? null, order_ref: intent.orderRef ?? null,
       //                     splits: intent.splits.map(s => ({recipient_alias: s.recipientAlias,
       //                     amount: s.amount, type: s.type})), confidence: intent.confidence },
       //      status,
       //    }})
       //    (nota: la forma de intentJson en snake_case debe matchear StoredIntent de voice-agent.service.ts)
       // 7. notifications.publish(command.merchantId, 'voice:confirmation', {commandId: command.id,
       //    transcript, intent})
     }
   }
   ```
   `AgentProvider`/`AGENT_PROVIDER` ya existen en
   `backend/src/infrastructure/agent/agent-provider.interface.ts` (implementado por `RavenClient`,
   `backend/src/infrastructure/agent/raven-client.service.ts`, que llama a `RAVEN_URL` por HTTP).

2. **`voice-agent.module.ts`** (nuevo): `BullModule.registerQueue({name:
   QUEUE_NAMES.VOICE_COMMANDS})`, importa `MerchantsModule` y `OrdersModule`; `controllers:
   [VoiceAgentController]`, `providers: [VoiceAgentService]`.

3. **`voice-agent.worker.module.ts`** (nuevo, mismo patrón que `orders.worker.module.ts`): registra la
   misma cola, importa `AgentModule` (de `infrastructure/agent/`) y `NotificationsPublisherModule`;
   `providers: [VoiceAgentProcessor]`. Solo lo importa `worker.module.ts` (Etapa 1.11).

**Verificación de la etapa**: subir un audio de prueba crea el `VoiceCommand` y encola el job; con
`AgentProvider` mockeado (sin Raven real todavía, ej. un `FakeAgentProvider` que devuelve un intent fijo)
el processor actualiza `transcript`/`intentJson` y publica el evento WS; `confirm` sobre un `intentJson`
válido crea la `Order` esperada.

### Etapa 1.8 — Notifications (WebSocket)

**Estado**: Completada (con un gap de seguridad pendiente).

**Objetivo**: notificar en tiempo real al POS, desde cualquiera de los dos procesos.

**Contrato**:
- **Namespace**: `/notifications` (Socket.IO, CORS abierto en dev).
- **Conexión**: el cliente pasa `?merchantId=<id>` en el handshake; el gateway hace
  `socket.join(merchantId)` automáticamente.
  **Gap conocido**: no valida el `merchantId` contra un JWT — cualquiera que conozca el id puede
  suscribirse. Pendiente en Etapa 1.10.
- **Evento cliente→servidor** `join`: payload `merchantId: string` (redundante con el query param, útil
  en reconexiones).
- **Evento servidor→cliente** `event`: payload envolvente `{ "event": string, "payload": unknown }`.

  | event | payload | quién lo publica |
  | --- | --- | --- |
  | `order:created` | `{ orderId, orderRef, hash }` | `OrdersProcessor` (worker, Etapa 1.5) |
  | `order:paid` | `{ orderId, orderRef, hash }` | `PaymentsService` (API, Etapa 1.6) |
  | `voice:confirmation` | `{ commandId, transcript, intent: {...} }` | `VoiceAgentProcessor` (worker, Etapa 1.7) |

**Implementación** (`backend/src/modules/notifications/`):

- `notifications.publisher.ts` — `NotificationsPublisher.publish(merchantId, event, payload)`:
  `redis.client.publish('merchant:' + merchantId + ':events', JSON.stringify({event, payload}))` (usa
  `RedisService.client` de `infrastructure/redis/`).
- `notifications-publisher.module.ts` — solo expone `NotificationsPublisher`; lo importan `OrdersModule`
  (vía `orders.worker.module.ts`), `VoiceAgentModule` (vía su worker module), y `PaymentsModule`
  directamente (porque publica desde la API, no desde un processor).
- `notifications.gateway.ts` — `NotificationsGateway` (`@WebSocketGateway({namespace: 'notifications',
  cors: {origin: '*'}})`): en `onModuleInit` abre una segunda conexión Redis (`ioredis`) y hace
  `subscriber.psubscribe('merchant:*:events')`; en el handler `pmessage` parsea el canal para sacar el
  `merchantId` y hace `server.to(merchantId).emit('event', JSON.parse(message))`. `handleConnection`
  hace `socket.join(merchantId)` leyendo `socket.handshake.query.merchantId`. `@SubscribeMessage('join')`
  repite el `join` manual.
- `notifications.module.ts` — importa `NotificationsPublisherModule`, agrega `NotificationsGateway` a
  `providers`. **Solo lo importa `app.module.ts`** (Etapa 1.11) — nunca el worker, porque el gateway
  necesita el servidor HTTP de la API para levantar Socket.IO.

**Verificación de la etapa**: conectar un cliente Socket.IO de prueba a `/notifications?merchantId=X`,
publicar manualmente vía `redis-cli PUBLISH merchant:X:events '{"event":"order:created","payload":{}}'`
y confirmar que el cliente lo recibe.

### Etapa 1.9 — Analytics

**Estado**: Pendiente.

**Objetivo**: totales del día para el dashboard del comerciante.

**Contrato — `GET /v1/analytics/today`**
- **Auth**: JWT
- **Response 200**:
  ```json
  { "totalAmount": "184.50", "count": 7, "from": "2026-09-22T00:00:00.000Z", "to": "2026-09-22T18:32:00.000Z" }
  ```
- **Errores**: `404 Merchant not found`.

**Pasos a implementar**:

1. **`analytics.service.ts`** (nuevo):
   ```
   @Injectable()
   export class AnalyticsService {
     constructor(
       private readonly merchants: MerchantsService,
       private readonly orders: OrdersRepository,
     ) {}

     async today(tenantId: string) {
       const merchant = await this.merchants.findByTenant(tenantId);
       const from = new Date();
       from.setUTCHours(0, 0, 0, 0);
       const to = new Date();

       const { _sum, _count } = await this.orders.sumPaidSince(merchant.id, from);
       // _sum.amount es Decimal | null (null si no hay ninguna orden PAID hoy) — normalizar a "0"
       return {
         totalAmount: (_sum.amount ?? 0).toString(),
         count: _count,
         from: from.toISOString(),
         to: to.toISOString(),
       };
     }
   }
   ```
   Reusa `OrdersRepository.sumPaidSince(merchantId, since)`, ya implementado en la Etapa 1.5.
2. **`analytics.controller.ts`**: `GET v1/analytics/today` (JWT), delega a `AnalyticsService.today(tenantId)`.
3. **`analytics.module.ts`**: importa `MerchantsModule` y `OrdersModule`; `controllers:
   [AnalyticsController]`, `providers: [AnalyticsService]`.
4. Agregar `AnalyticsModule` a `app.module.ts` (Etapa 1.11).

**Verificación de la etapa**: con órdenes de prueba `PAID` de hoy y de ayer, la respuesta suma solo las
de hoy; con cero órdenes `PAID` hoy, `totalAmount` es `"0"` y no `null`/error (cubre el caso `_sum.amount
=== null` de Prisma `aggregate`).

### Etapa 1.10 — Deuda técnica y hardening

**Estado**: Pendiente.

**Objetivo**: cerrar los gaps identificados en las etapas anteriores antes de dar la fase por cerrada.

**Pasos a implementar**:

1. **[Crítico] `TenantGuard` debe respetar `@Public()`**: agregar `Reflector` al constructor (mismo
   patrón que `JwtAuthGuard`) y, al inicio de `canActivate`, `if
   (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(),
   context.getClass()])) return true;` antes de exigir `request.user.tenantId`. Sin este fix, la
   Etapa 1.11 (que registra `TenantGuard` como `APP_GUARD` global) rompe con `401` toda ruta `@Public()`,
   `POST /v1/auth/login` incluido — hacer este fix **antes** de la Etapa 1.11, no después.
2. **Status codes correctos**: agregar `@HttpCode(HttpStatus.OK)` (import de `@nestjs/common`) en:
   `AuthController.login`, `MerchantsController.buildOperatorTx`/`submitOperatorTx`,
   `PaymentsController.buildTx`/`submit`. `VoiceAgentController.confirm` y
   `VoiceAgentController.create`/`RecipientsController.create` **no** se tocan — ya devuelven `201` por
   default de Nest, que es lo correcto porque crean un recurso (`Order`, `VoiceCommand`, `Recipient`).
   Agregar `@HttpCode(HttpStatus.NO_CONTENT)` en `RecipientsController.remove`, que además debe devolver
   `void` en vez del registro borrado.
3. **Scoping de `GET /v1/orders/:id`**: cambiar `OrdersService.findById` para recibir también
   `tenantId`, y filtrar con un `where` que joinee `merchant: { tenantId }` (Prisma permite filtrar por
   relación: `prisma.order.findFirst({where: {id, merchant: {tenantId}}})`); actualizar
   `OrdersController.findOne` para pasar `@CurrentTenant() tenantId`.
4. **Conflicto de alias duplicado**: en `RecipientsService.create`, envolver la llamada a
   `repository.create` en un `try/catch`; si el error es `instanceof Prisma.PrismaClientKnownRequestError
   && error.code === 'P2002'`, lanzar `ConflictException('Alias already exists')`.
5. **Auth del WebSocket**: `NotificationsGateway.handleConnection` debe leer un JWT de
   `socket.handshake.auth.token` (no del query param `merchantId`, que queda solo como dato, no como
   fuente de verdad), validarlo con el mismo `JwtService`/`secret` que usa `JwtStrategy`, resolver el
   `merchantId` real del tenant del token (vía `MerchantsService.findByTenant`) y solo entonces hacer
   `socket.join(merchantId)`; si el JWT falta o es inválido, `socket.disconnect()`.

**Verificación de la etapa**: repetir las pruebas de las Etapas 1.2/1.4/1.5/1.8 confirmando los nuevos
status codes y que los casos de error/seguridad ahora se comportan como se documenta arriba; probar
específicamente que `POST /v1/auth/login` sigue funcionando después de registrar `TenantGuard` como
global (Etapa 1.11), que crear dos `Recipient` con el mismo alias da `409`, que `GET /v1/orders/:id` de
un tenant ajeno da `404`, y que conectar al WS sin token válido desconecta el socket.

### Etapa 1.11 — Wiring de los dos procesos

**Estado**: Pendiente.

**Objetivo**: que `main.ts` (API) y `worker.ts` (worker, nuevo) arranquen con todos los módulos de las
etapas anteriores correctamente separados.

**Pasos a implementar**:

1. **`src/app.module.ts`** — reemplazar el boilerplate de `nest new` por:
   - `ConfigModule.forRoot({ isGlobal: true, validate: validateEnv })` (usa
     `src/config/env.validation.ts`, ya implementado con `zod`).
   - `PrismaModule`, `RedisModule`, `StellarModule`, `AgentModule` (los cuatro son `@Global()`, se
     importan una sola vez acá).
   - `QueueModule` (config de conexión BullMQ, `@Global()`-friendly por `forRootAsync`).
   - `NotificationsModule` (con gateway — Etapa 1.8).
   - Módulos de dominio: `AuthModule, TenantsModule, MerchantsModule, RecipientsModule, OrdersModule,
     PaymentsModule, VoiceAgentModule, AnalyticsModule` (los de controller/service; **no** los
     `*.worker.module.ts`).
   - `providers`: `{ provide: APP_GUARD, useClass: JwtAuthGuard }`, `{ provide: APP_GUARD, useClass:
     TenantGuard }` (en ese orden — `TenantGuard` corre después de que `JwtAuthGuard` puso
     `request.user`), `{ provide: APP_FILTER, useClass: AllExceptionsFilter }`. **Requisito previo**:
     `TenantGuard` debe tener el fix de `@Public()` de la Etapa 1.10 (paso 1) aplicado antes de este
     paso — si no, registrar esto rompe con `401` todas las rutas públicas apenas se despliega.
2. **`src/worker.module.ts`** (nuevo): `ConfigModule.forRoot({isGlobal:true, validate: validateEnv})`,
   `PrismaModule`, `RedisModule`, `StellarModule`, `AgentModule`, `QueueModule`,
   `NotificationsPublisherModule` (sin gateway), `OrdersWorkerModule`, `VoiceAgentWorkerModule`. Sin
   `controllers` en ningún nivel — este proceso no expone HTTP.
3. **`src/main.ts`** — reemplazar boilerplate:
   - `app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }))`.
   - `app.useGlobalFilters(new AllExceptionsFilter())` *(si no quedó cubierto por `APP_FILTER` en el
     módulo)*.
   - Swagger: `SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app,
     new DocumentBuilder().setTitle('VoxPay API').addBearerAuth().build()))`.
   - Health: módulo `TerminusModule` con un `HealthController` (`GET /health` usando
     `HealthCheckService` + `PrismaHealthIndicator`/`ping` simple) — puede vivir en `common/health/`.
   - `app.enableCors({ origin: process.env.FRONTEND_URL ?? '*' })`.
   - Logging: `app.use(pinoHttp())` (paquete `pino-http`, ya instalado) antes de `app.listen`.
   - `await app.listen(config.get('PORT') ?? 3001)`.
4. **`src/worker.ts`** (nuevo): `const app = await NestFactory.createApplicationContext(WorkerModule);
   app.enableShutdownHooks();` — sin `.listen()`, mantiene vivo el proceso porque los `Processor` de
   BullMQ abren su propia conexión de long-polling a Redis.
5. Borrar `app.controller.ts`, `app.service.ts`, `app.controller.spec.ts` (boilerplate default de `nest
   new`, ya no referenciados).
6. Actualizar `package.json` de `backend/`: script `worker` (`nest start --entryFile worker` o
   `node dist/worker.js` en prod) y `worker:dev` (`nest start --watch --entryFile worker`).

**Verificación de la etapa** (y de toda la Fase 1): `npm run build`/`lint` sin errores; `npm run
start:dev` levanta la API en `:3001` y responde `GET /health`; `npm run worker:dev` arranca sin
crashear contra Postgres/Redis locales (se prueba de punta a punta en Fase 2); Swagger en `/docs` lista
todos los endpoints de las Etapas 1.2 a 1.9 con la forma documentada.

---

## Fase 2 — Integración local y smoke test

Objetivo de la fase: correr todo el sistema (menos el contrato real y Raven con modelo) contra
infraestructura local, validando los contratos de la Fase 1 con datos reales. Se divide en 5 etapas.

### Etapa 2.1 — Configuración de entorno

**Tareas**:
1. `cp backend/.env.example backend/.env`; completar `JWT_SECRET` con un valor random
   (`openssl rand -hex 32`). `STELLAR_CONTRACT_ID`/`STELLAR_OPERATOR_SECRET` **no pueden quedar
   vacíos**: `SorobanService` los usa en su constructor (`new Contract(id)` y
   `Keypair.fromSecret(secret)`), y ambos tiran excepción de forma síncrona con un valor vacío — la API
   no levanta ni para probar endpoints que no tocan Stellar. Generar un address/keypair con formato
   válido pero inventado (no hace falta que el contrato exista todavía):
   ```
   node -e "const {Address}=require('@stellar/stellar-sdk'); const c=require('crypto');
   console.log(Address.contract(c.randomBytes(32)).toString())"   // → STELLAR_CONTRACT_ID
   node -e "const {Keypair}=require('@stellar/stellar-sdk'); const k=Keypair.random();
   console.log(k.secret())"                                       // → STELLAR_OPERATOR_SECRET
   ```
   Ninguna llamada on-chain real funciona con estos valores — quedan mockeados/fallan en runtime hasta
   la Fase 3 (contrato desplegado + operator real), pero al menos no rompen el boot del proceso.
2. `docker compose up postgres redis` desde la raíz del repo (deja `raven` fuera del comando hasta la
   Etapa 2.5).

**Verificación**: `docker compose ps` muestra `postgres`/`redis` healthy; `psql`/`redis-cli PING` desde
el host confirman los puertos `5432`/`6379` expuestos.

### Etapa 2.2 — Migraciones y seed

**Tareas**:
1. `cd backend && npx prisma migrate dev --name init` — genera la primera migración desde
   `schema.prisma` (Etapa 1.1) y la aplica.
2. Crear `backend/prisma/seed.ts`:
   ```
   // 1. crear Tenant { name: "Demo VoxPay", apiKeyHash: "..." }
   // 2. crear User { tenantId, email: "demo@voxpay.dev", passwordHash: bcrypt.hash("password123", 10), role: "OWNER" }
   // 3. crear Merchant { tenantId, stellarAddress: "<GABC... testnet>", operatorAuthorized: false }
   // 4. crear 1-2 Recipient { merchantId, alias: "José", stellarAddress: "<GXYZ...>" }
   ```
3. Registrar el seed en `backend/package.json` (`"prisma": {"seed": "tsx prisma/seed.ts"}` o el
   mecanismo que use `prisma7.config.ts`, ver Etapa 1.1) y correr `npx prisma db seed`.

**Verificación**: `npx prisma studio` (o una query directa) muestra el tenant/user/merchant/recipients
del seed.

### Etapa 2.3 — Backend local (API + worker)

**Tareas**:
1. `npm run start:dev` (API) y `npm run worker:dev` (worker, Etapa 1.11) en dos terminales.
2. Con el `User` del seed, `POST /v1/auth/login` para obtener un JWT.
3. Probar con ese JWT, en orden, cada endpoint de las Etapas 1.2 a 1.9: `GET /v1/merchants/me`, CRUD de
   `/v1/recipients`, `GET /v1/orders/:id` (con un `Order` insertado a mano si todavía no hay flujo de
   voz), `GET /v1/analytics/today`.

**Verificación**: los 15 endpoints de las Etapas 1.2 a 1.9 (1 auth + 3 merchants + 4 recipients +
2 orders + 2 payments + 2 voice-agent + 1 analytics) responden con la forma exacta documentada (status
code incluido, ya corregido en la Etapa 1.10).

### Etapa 2.4 — Frontend local + WebSocket

**Tareas**: `npm run dev` en `frontend/`; abrir la consola del navegador y conectar manualmente
(`io('http://localhost:3001/notifications?merchantId=<id-del-seed>')`) para confirmar la conexión;
publicar un evento de prueba con `redis-cli PUBLISH merchant:<id>:events '{"event":"order:created","payload":{}}'`.

**Verificación**: el evento llega al cliente conectado (mismo criterio que la Etapa 1.8, ahora contra el
backend corriendo en modo desarrollo completo).

### Etapa 2.5 — ai-service sin modelo real

**Tareas**: `cd ai-service && python -m venv .venv && .venv\Scripts\activate` (Windows) `&& pip install
-r requirements-dev.txt`; `pytest`; `ruff check .`.

**Verificación**: `pytest` pasa (solo cubre `/health`, `test_health.py`); se documenta explícitamente que
`/transcribe` y `/interpret` quedan sin probar hasta tener el modelo GGUF real.

---

## Fase 3 — Contrato Soroban: build, test y deploy

Requiere Rust + `wasm32-unknown-unknown` + `stellar-cli` (no disponibles en este entorno) — corre en la
máquina del usuario o en `.github/workflows/contracts.yml` (ya creado). Se divide en 5 etapas.

### Etapa 3.1 — Contrato Soroban: especificación

Fuente: [`contracts/voxpay/src/lib.rs`](contracts/voxpay/src/lib.rs), ya implementado en Rust.

| Función | Firma | Quién invoca / `require_auth` | Efecto |
| --- | --- | --- | --- |
| `init` | `(admin: Address, token: Address)` | `admin`, una vez | fija el token USDC; falla si ya se llamó (`AlreadyInitialized`) |
| `set_operator` | `(merchant: Address, operator: Address)` | `merchant` | autoriza al operator a crear órdenes en su nombre |
| `create_order` | `(operator: Address, merchant: Address, order_id: String, amount: i128, splits: Vec<Split>)` | `operator` (debe matchear el autorizado por `merchant`) | crea `Order{status: Pending}`; falla si `amount<=0`, si la suma de `splits` supera `amount`, o si `order_id` ya existe |
| `pay` | `(payer: Address, order_id: String)` | `payer` | exige `status=Pending`; transfiere cada `split.amount` y el resto al `merchant`; marca `Paid` |
| `cancel_order` | `(caller: Address, order_id: String)` | `caller` (= `merchant` o su `operator`) | pasa a `Cancelled` si aún `Pending` |
| `get_order` | `(order_id: String) -> Order` | cualquiera (lectura) | devuelve `{ merchant, amount, splits, status, created_at }` |

`Split { recipient: Address, amount: i128 }`. `OrderStatus = Pending \| Paid \| Cancelled`.

**Eventos**: `order_created(topics=[Symbol("order_created"), order_id], data=merchant)` ·
`order_paid(topics=[Symbol("order_paid"), order_id], data=(payer, amount))` ·
`order_cancelled(topics=[Symbol("order_cancelled"), order_id], data=caller)`.

**Errores** (`#[contracterror]`, `u32`): `1 AlreadyInitialized · 2 NotAuthorized · 3 OrderAlreadyExists ·
4 OrderNotFound · 5 OrderNotPending · 6 InvalidAmount · 7 SplitsExceedAmount`.

Consumido por: `SorobanService` (backend, `infrastructure/stellar/soroban.service.ts`), `OrdersProcessor`
(`create_order`, Etapa 1.5), `PaymentsService` (`pay`, Etapa 1.6), `MerchantsService` (`set_operator`,
Etapa 1.3) — implementados en Fase 1, nunca probados contra un contrato real.

### Etapa 3.2 — Build y test local

**Tareas**:
1. `rustup target add wasm32-unknown-unknown`.
2. `cd contracts/voxpay && cargo test` — valida `src/test.rs` (tests: `create_and_pay_order_splits_funds`,
   `cancel_order_marks_cancelled`).
3. `stellar contract build`.

**Verificación**: `cargo test` verde; se genera el `.wasm` en
`target/wasm32-unknown-unknown/release/voxpay.wasm`.

### Etapa 3.3 — Deploy a testnet

**Tareas**:
1. `stellar keys generate admin --network testnet --fund` (si no existe una identidad de admin).
2. `stellar contract deploy --wasm target/wasm32-unknown-unknown/release/voxpay.wasm --source admin
   --network testnet` → guardar el `CONTRACT_ID` impreso.
3. `stellar contract invoke --id <CONTRACT_ID> --source admin --network testnet -- init --admin
   <admin_pubkey> --token <USDC_testnet_contract_id>`.

**Verificación**: `stellar contract invoke --id <CONTRACT_ID> ... -- get_order --order_id x` responde
(con `OrderNotFound`, no con un error de red), confirmando que el contrato está vivo en testnet.

### Etapa 3.4 — Bindings TypeScript

**Tareas**:
1. `stellar contract bindings typescript --contract-id <CONTRACT_ID> --network testnet --output-dir
   ../../backend/src/infrastructure/stellar/bindings` (carpeta ya creada con `.gitkeep`, Etapa previa de
   scaffolding).
2. Escribir un script de prueba manual (`backend/scripts/test-create-order.ts` o similar) que invoque
   `create_order` con los bindings generados en vez del `nativeToScVal` manual de
   `OrdersProcessor` (Etapa 1.5), para validar el encoding real de `Vec<Split>`.
3. Si el encoding manual de `OrdersProcessor` resulta incorrecto, decidir entre (a) migrar
   `OrdersProcessor` a usar los bindings generados directamente, o (b) corregir el `nativeToScVal` con la
   forma exacta que revelen los bindings.

**Verificación**: el script de prueba manual invoca `create_order` y el `hash` de la transacción aparece
en `stellar.expert/explorer/testnet/tx/<hash>` sin errores de `InvalidAction`/parsing.

### Etapa 3.5 — Integración con el backend

**Tareas**:
1. Cargar `STELLAR_CONTRACT_ID` y `STELLAR_OPERATOR_SECRET` reales en `backend/.env`.
2. Ejecutar el flujo completo contra testnet usando los endpoints de la Fase 1: `POST
   /v1/merchants/operator/tx` → firmar con la wallet del merchant de prueba → `POST
   /v1/merchants/operator/submit` → confirmar `operatorAuthorized: true` → crear una orden (vía Etapa 1.7
   o insertada directo) → dejar que `OrdersProcessor` la lleve on-chain → `POST
   /v1/public/orders/:id/tx` con una wallet de cliente → firmar → `POST .../submit`.

**Verificación**: `OrdersProcessor` y `PaymentsService` completan sus llamadas y devuelven un `hash` real
verificable en `stellar.expert`; el gap de la Etapa 1.5 sobre `Vec<Split>` queda resuelto o documentado
con su fix (Etapa 3.4).

---

## Fase 4 — Frontend: conectar con la API real

Cada etapa conecta una parte del frontend con los contratos de la Fase 1. Se divide en 6 etapas.

### Etapa 4.1 — Cliente tipado y socket

**Tareas**:
1. Con el backend corriendo (Fase 2), `cd frontend && npx openapi-typescript
   http://localhost:3001/docs-json -o src/types/api.ts` (reemplaza el placeholder de
   `src/types/api.ts`).
2. Crear `src/lib/socket.ts` (mismo estilo que `src/lib/wallet.ts`): función `connectNotifications
   (merchantId: string)` que hace `io(`${NEXT_PUBLIC_API_URL}/notifications`, {query: {merchantId}})` y
   devuelve el socket; función `onEvent(socket, handler: (event: string, payload: unknown) => void)`
   que suscribe al evento `'event'` del contrato de la Etapa 1.8.

**Verificación**: `src/types/api.ts` compila y refleja los DTOs reales del backend (`LoginDto`,
`CreateRecipientDto`, `OrderResponseDto`, etc.).

### Etapa 4.2 — Login y sesión

**Tareas**: en `login/page.tsx`, formulario controlado (`email`, `password`) → `apiClient.post('/v1/auth/
login', {...})` (Etapa 1.2) → en éxito, `document.cookie = 'voxpay_session=' + accessToken + ...` (la
cookie que ya espera `src/proxy.ts`) → `router.push('/pos')`.

**Verificación**: login exitoso redirige a `/pos`; `src/proxy.ts` bloquea rutas de comerciante sin
cookie (ya lo hace, solo falta que la cookie se setee de verdad).

### Etapa 4.3 — POS por voz

**Tareas**: en `pos/page.tsx`:
1. Botón de grabar → `MediaRecorder` sobre el stream de `getUserMedia({audio: true})`; al detener,
   arma un `FormData` con el blob (`audio`) → `POST /v1/voice/commands` (Etapa 1.7) → guarda
   `commandId`.
2. `useEffect` que conecta el socket (Etapa 4.1) con el `merchantId` del usuario logueado y escucha
   `voice:confirmation` — cuando `payload.commandId === commandId`, muestra el `intent` interpretado
   para confirmación visual.
3. Botón "Confirmar" → `POST /v1/voice/commands/:id/confirm` (Etapa 1.7).
4. El mismo socket sigue escuchando `order:created` — cuando llega, renderiza el QR (link a
   `/pay/[orderId]`, con una librería tipo `qrcode.react`).

**Verificación**: flujo completo contra el backend de la Fase 2 (con `AgentProvider` mockeado si Raven
real no está listo).

### Etapa 4.4 — Página pública de pago

**Tareas**: en `pay/[orderId]/page.tsx`:
1. `GET /v1/public/orders/:id` (Etapa 1.5) al montar, para mostrar el monto/estado.
2. Botón "Conectar wallet" → `connectWallet()` de `src/lib/wallet.ts` (ya implementado).
3. Botón "Pagar" → `POST /v1/public/orders/:id/tx` con `{payerPublicKey: address}` (Etapa 1.6) → recibe
   `xdr` → `signXdr(xdr)` de `src/lib/wallet.ts` → `POST /v1/public/orders/:id/submit` con
   `{signedXdr}` → muestra confirmación.

**Verificación**: con la wallet de un segundo usuario, el pago se firma y confirma; el POS del
comerciante recibe `order:paid` en vivo (mismo socket de la Etapa 4.3).

### Etapa 4.5 — Pedidos y dashboard

**Tareas**:
- `orders/page.tsx`: `GET /v1/orders/:id` por cada orden conocida (evaluar si conviene agregar
  `GET /v1/orders` al backend para listar por merchant — no está en el contrato actual de la Etapa 1.5,
  se agregaría ahí si se decide) + link a `stellar.expert/explorer/testnet/tx/<hash>` usando
  `createTxHash`/`payTxHash`.
- `dashboard/page.tsx`: `GET /v1/analytics/today` (Etapa 1.9) al montar, refrescar cada N segundos o al
  recibir `order:paid` por WS.

**Verificación**: ambas páginas muestran datos reales del seed/contrato.

### Etapa 4.6 — Destinatarios

**Tareas**: `recipients/page.tsx` → tabla + formulario contra `GET/POST/PATCH/DELETE /v1/recipients`
(Etapa 1.4), con manejo del `409` de alias duplicado (Etapa 1.10) mostrando un mensaje inline.

**Verificación**: alta/edición/baja de un recipient se refleja sin recargar la página.

---

## Fase 5 — Testing y CI verde

Se divide en 4 etapas.

### Etapa 5.1 — Unit tests backend

**Tareas**: con `vitest` (ya configurado por `nest new`), tests de:
- `OrdersService.createFromIntent` — casos: alias inexistente (`400`), splits que exceden el monto
  (`400`), caso feliz (crea `Order` y encola el job — mockear `Queue.add`).
- `PaymentsService.submitPayment` — mockear `SorobanService.submitSignedXdr` y
  `NotificationsPublisher.publish`, verificar que `Order.status` pasa a `PAID`.
- `VoiceAgentService.confirm` — mockear `OrdersService.createFromIntent`, casos de intent no
  confirmable.

### Etapa 5.2 — E2E backend

**Tareas**: `vitest run --config vitest.config.e2e.ts` cubriendo el flujo voice→confirm→order contra un
Postgres/Redis de test (mismo `docker-compose.yml`, base de datos separada).

### Etapa 5.3 — Frontend

**Tareas**: confirmar `lint`/`build` verdes (ya lo están); smoke test con Playwright si el tiempo lo
permite (login → grabar → confirmar → ver QR, con mocks de audio/wallet).

### Etapa 5.4 — CI

**Tareas**: confirmar los 4 workflows de `.github/workflows/` en GitHub Actions con un push/PR real;
revisar que `contracts.yml` y `ai-service.yml` (bloqueados en este entorno) corran bien en el runner de
GitHub, que sí tiene Rust y Python completos.

**Verificación de la fase**: los 4 workflows pasan en un push/PR real.

---

## Fase 6 — Pulido para la demo

Se divide en 3 etapas.

### Etapa 6.1 — Guía de demo

**Tareas**: completar `docs/demo-guide.md` con los pasos reales (capturas o video corto) una vez el
flujo end-to-end funcione.

### Etapa 6.2 — Observabilidad

**Tareas**: confirmar que `pino-http` (Etapa 1.11) loguea `tenantId`/`orderId` cuando estén disponibles
en el contexto de la request; `/health` responde en API, worker (si aplica un healthcheck de proceso) y
Raven.

### Etapa 6.3 — Manejo de errores de UX

**Tareas**: confidence bajo de Raven → "repetir" en el POS (usar el `status: UNKNOWN` de la Etapa 1.7);
wallet no conectada → deshabilitar botón "Pagar"; RPC de Stellar caído → mostrar el reintento en curso
(retries ya definidos en `QueueModule`, Etapa 1.5); confirmar que el gap de auth del WebSocket quedó
cerrado (Etapa 1.10).

**Verificación de la fase**: guion de `docs/demo-guide.md` reproducible sin intervención manual fuera de
lo esperado.

---

## Verificación general

El hito final es reproducir `docs/demo-guide.md` de punta a punta: grabar un cobro por voz, confirmarlo,
pagar desde otra wallet vía QR, y ver la notificación en tiempo real con el hash en stellar.expert — cada
paso debe matchear exactamente el endpoint/evento/job documentado en su etapa correspondiente, sin
sorpresas de forma (status code, shape del body, nombre del evento).
