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
- **backend/**: NestJS 12 + TS 6, ESM (`.js` en imports relativos, obligatorio por
  `moduleResolution: nodenext` — todo import relativo entre archivos `.ts` propios debe terminar en
  `.js`). `npm run build`/`lint` verdes con **Fase 1 completa** (Etapas 1.1–1.11), pero escrita sobre
  Prisma 7 + PostgreSQL. **Decisión nueva**: la base de datos pasa a **Firebase Firestore** — Prisma no
  soporta Firestore como datasource, así que esto no es un cambio de driver sino un reemplazo completo
  de la capa de datos. El código de Postgres sigue siendo lo que hoy compila y corre; la migración a
  Firestore es trabajo pendiente, ver [Etapa 1.12](#etapa-112--migración-postgresqlprisma--firestore).
  Detalle módulo por módulo: [Fase 1](#fase-1--backend-módulos-de-dominio-y-contratos).

## Restricciones de entorno detectadas

- No hay `cargo`, `rustc` ni `stellar` CLI en este entorno → el contrato no se puede compilar, testear ni
  desplegar a testnet desde aquí (Fase 3 corre en la máquina del usuario o en CI).
- `ai-service` necesita un modelo GGUF real (Qwen 3B afinado) para probar `/interpret` de punta a punta.
- Next.js 16 tiene breaking changes fuertes respecto a versiones anteriores (`proxy.ts` en vez de
  `middleware.ts`).
- El emulador de Firestore (`firebase emulators:start`) corre sobre una JVM → hace falta **Java (JRE
  11+)** instalado en el entorno local además de Node, algo que Postgres/Docker no requerían. Ver
  Etapa 1.12 y Etapa 2.1.

---

## Fase 1 — Backend: módulos de dominio y contratos

Objetivo de la fase: `npm run build` y `npm run lint` verdes en `backend/`, todos los contratos de esta
fase implementados y wireados en `app.module.ts` (proceso API) / `worker.module.ts` (proceso worker,
nuevo), corriendo sobre Firestore. Se divide en 12 etapas, en orden de dependencia (cada etapa asume que
las anteriores ya existen). **Las Etapas 1.1–1.11 ya están completas y compilando, pero escritas sobre
Prisma + PostgreSQL** (decisión original, ver arquitectura). Tras la decisión de mover la base de datos a
Firestore, cada una de esas etapas describe abajo tanto lo que hoy corre (Prisma) como el diseño target en
Firestore que lo reemplaza; la Etapa 1.12 es el checklist concreto de la migración.

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
  Toda consulta a Postgres debe filtrar por el `merchantId` que pertenece a ese `tenantId` (resuelto en
  Etapa 1.10 para `GET /v1/orders/:id`).
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

**Modelo de datos — lo que corre hoy (Prisma + PostgreSQL)**, implementación exacta en
`backend/prisma/schema.prisma`:

```prisma
generator client {
  provider = "prisma-client"      // Prisma 7: reemplaza a "prisma-client-js"
  output   = "../generated/prisma" // obligatorio en v7, ya no es node_modules implícito
}

datasource db {
  provider = "postgresql"
}
```

El cliente generado vive en `backend/generated/prisma/` (gitignored). `PrismaService` importa solo
`PrismaClient`; los repositories (`OrdersRepository`, `RecipientsRepository`, etc.) importan
`type { Prisma }` para los tipos `Prisma.*UncheckedCreateInput`/`UncheckedUpdateInput`. Prisma 7 exige un
**driver adapter** explícito — se usa `@prisma/adapter-pg`:

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

`splitsJson` de `Order` almacena `{ recipientAlias, stellarAddress, amount }[]`. `intentJson` de
`VoiceCommand` almacena la forma cruda que devuelve Raven.

**Verificación (Prisma, ya cumplida)**: `npx prisma generate` corre sin errores; el cliente expone los 9
modelos y `Prisma.RecipientUncheckedCreateInput`/`Prisma.OrderUncheckedCreateInput`.

---

**Modelo de datos — target (Firestore)**: reemplaza por completo lo de arriba (Prisma no tiene datasource
para Firestore; no es un cambio de driver, es otra capa de datos). Diseño por colección, pensado para que
cada `findByX` que hoy es un `WHERE` en Postgres sea un **lookup directo por ID** en Firestore cuando sea
posible, evitando índices compuestos innecesarios:

| Colección | Doc ID | Campos | Por qué ese ID |
| --- | --- | --- | --- |
| `tenants/{id}` | auto-ID | `name, plan, apiKeyHash, createdAt` | sin necesidad de lookup por otro campo que no sea `apiKeyHash` (query) |
| `users/{id}` | auto-ID | `tenantId, email, passwordHash, role, createdAt` | login busca por `email` solo (query global, igual limitación que hoy — primer match, ver Etapa 1.2) |
| `merchants/{id}` | auto-ID | `tenantId, stellarAddress, operatorAuthorized, createdAt` | `findByTenant` es query (`where tenantId ==`), 1 merchant activo por tenant en el MVP |
| `recipients/{merchantId}_{alias}` | **compuesto** | `merchantId, alias, stellarAddress, defaultShare, createdAt` | `findByAlias` pasa de query a `.doc(id).get()` (O(1)); `.create()` sobre un ID existente tira `ALREADY_EXISTS` → uniqueness de `(merchantId, alias)` gratis, sin transacción |
| `voiceCommands/{id}` | auto-ID | `merchantId, transcript, intentJson, status, createdAt` | sin restricción de unicidad |
| `orders/{id}` | **auto-ID, nunca compuesto** | `merchantId, orderRef, amount(string), splitsJson, status, createTxHash, payTxHash, createdAt` | el id es público (`/pay/[orderId]`, QR) — tiene que seguir siendo no adivinable, así que la unicidad de `(merchantId, orderRef)` se valida con una **transacción** (query + write), no con el ID del doc |
| `chainEvents/{txHash}` | **= txHash** | `type, orderId, ledger, payload, createdAt` | idempotencia por tx_hash gratis (mismo hash = mismo doc, no duplica) |
| `indexerState/cursor` | fijo | `lastLedger` | doc único, sin necesidad de colección |
| `idempotencyKeys/{key}` | **= key** | `tenantId, response, expiresAt` | lookup O(1) + **TTL policy nativa de Firestore** sobre `expiresAt` (borra solo, mejor que lo que había planeado con Postgres) |

Convenciones nuevas específicas de Firestore (además de las de la API, que no cambian):

- **Timestamps**: se guardan como `Timestamp` de Firestore, nunca `Date`/string; se convierten a ISO
  string (`.toDate().toISOString()`) recién en el DTO de respuesta — la convención de la API
  (`createdAt` como ISO string en JSON) no cambia.
- **Montos**: siguen siendo `string` (igual que hoy con `Decimal` de Prisma) — Firestore no tiene tipo
  decimal nativo, solo `number` (double IEEE754) o entero; guardar el monto como número reintroduce
  errores de precisión de punto flotante en dinero. Se parsea a número solo en el borde que lo necesita
  (`SorobanService.i128Arg(amount)`, que ya recibía un string).
- **Sin joins**: `GET /v1/orders/:id` con scoping por tenant (Etapa 1.10) deja de ser un `WHERE` con
  relación (`merchant: {tenantId}`) y pasa a ser 2 lecturas: `orders.doc(id).get()` y luego
  `merchants.doc(order.merchantId).get()`, comparando `merchant.tenantId` en código. Aceptable a esta
  escala; si el volumen crece, se puede desnormalizar `tenantId` directo en `orders`.
- **Unicidad sin constraint de DB**: dos mecanismos, elegidos por caso (tabla de arriba): (a) **ID
  determinístico** cuando el documento no se expone públicamente (`recipients`, `chainEvents`,
  `idempotencyKeys`) — `.create()` falla solo si ya existe; (b) **transacción** (`runTransaction`) cuando
  el ID tiene que seguir siendo opaco/auto-generado (`orders`, por la URL pública de pago).
- **Agregación (`sumPaidSince`, Etapa 1.9)**: Firestore Admin SDK soporta `count()`/`sum()`/`average()`
  server-side, pero `sum()` exige un campo `number` — como `amount` se guarda como `string` (punto
  anterior), no aplica directo. Para el volumen de un MVP (pedidos de un comerciante en un día), se
  resuelve leyendo los documentos filtrados (`where merchantId ==, status == 'PAID', createdAt >= since`)
  y sumando en JS; no es una liquidación financiera (esa vive on-chain), es un total de dashboard — la
  imprecisión de punto flotante en la suma para mostrar en UI es aceptable. Optimización futura si crece
  el volumen: agregar un campo espejo numérico (`amountMinorUnits: number`, enteros) solo para poder usar
  `.sum()` nativo.
- **Infra**: `FirestoreService`/`FirestoreModule` (`@Global()`, mismo rol que `PrismaModule` hoy) sobre
  `firebase-admin`, expone `db: Firestore` (`getFirestore()`). Credenciales: `FIREBASE_PROJECT_ID` +
  `FIREBASE_SERVICE_ACCOUNT` (JSON del service account) en producción; en local, el SDK se conecta solo al
  **emulador de Firestore** si `FIRESTORE_EMULATOR_HOST` está seteado (sin credenciales reales) — ver
  Etapa 1.12 y Etapa 2.1.

**Verificación de la etapa (target Firestore)**: ver Etapa 1.12.

### Etapa 1.2 — Auth

**Estado**: Completada.

**Objetivo**: login de comerciante y emisión de JWT.

**Contrato — `POST /v1/auth/login`**
- **Auth**: Public
- **Request body**: `email` (string, `@IsEmail()`) · `password` (string, `@IsString() @MinLength(8)`)
- **Response 200** (fix aplicado en Etapa 1.10): `{ "accessToken": "eyJhbGciOi..." }`
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
  **Migración a Firestore (Etapa 1.12)**: `firestore.db.collection('users').where('email', '==',
  email).limit(1).get()`, tomar `snapshot.docs[0]` — misma limitación de "primer match" que hoy.
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
- **Response 200** (fix aplicado en Etapa 1.10): `{ "xdr": "AAAAAgAAAAA..." }`
- **Errores**: `404 Merchant not found` · `500` si el RPC de Stellar falla.

**Contrato — `POST /v1/merchants/operator/submit`**
- **Auth**: JWT
- **Request body**: `{ "signedXdr": "AAAAAgAAAAA..." }`
- Envía el XDR firmado y marca `operatorAuthorized = true`.
- **Response 200** (fix aplicado en Etapa 1.10): `{ "hash": "3f2a..." }`
- **Errores**: `404 Merchant not found` · `500` tx rechazada por la red.

**Implementación**:

- `backend/src/modules/tenants/tenants.service.ts` — `TenantsService` (sin controller, servicio
  interno): `findByApiKeyHash(apiKeyHash)`, `findById(id)`, `create({name, apiKeyHash, plan?})`, todos
  sobre `PrismaService`.
  **Migración a Firestore**: `tenants.where('apiKeyHash','==',hash).limit(1).get()`,
  `tenants.doc(id).get()`, `tenants.add({...})` (auto-ID).
- `backend/src/modules/merchants/merchants.service.ts` — `MerchantsService`:
  - `findByTenant(tenantId)`: `prisma.merchant.findFirst({where:{tenantId}})`, lanza `NotFoundException`
    si no existe (asume 1 merchant activo por tenant en el MVP).
    **Migración a Firestore**: `merchants.where('tenantId','==',tenantId).limit(1).get()`.
  - `findById(id)`: `findUniqueOrThrow`. **Migración a Firestore**: `merchants.doc(id).get()`, lanzar
    `NotFoundException` si `!snapshot.exists`.
  - `buildOperatorAuthorizationTx(tenantId)`: resuelve el merchant, llama
    `soroban.buildUnsignedInvocation(merchant.stellarAddress, 'set_operator',
    [SorobanService.addressArg(merchant.stellarAddress), SorobanService.addressArg(soroban.getOperatorPublicKey())])`.
    Sin cambios con la migración (no toca Prisma directamente).
  - `submitOperatorAuthorization(tenantId, signedXdr)`: resuelve el merchant, llama
    `soroban.submitSignedXdr(signedXdr)`, actualiza `operatorAuthorized: true`, devuelve `{hash}`.
    **Migración a Firestore**: `merchants.doc(merchant.id).update({operatorAuthorized: true})`.
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
- **Errores**: `400` validación · `409 Alias already exists` (implementado en Etapa 1.10).

**Contrato — `PATCH /v1/recipients/:id`**
- **Auth**: JWT · **Request body**: subconjunto parcial del create (`PartialType(CreateRecipientDto)`).
- **Response 200**: `Recipient` actualizado. **Errores**: `404 Recipient not found`.

**Contrato — `DELETE /v1/recipients/:id`**
- **Auth**: JWT
- **Response 204** (fix aplicado en Etapa 1.10).
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
  **Migración a Firestore**: doc ID = `` `${merchantId}_${alias}` `` (ver modelo de datos, Etapa 1.1).
  `findAllByMerchant` → `recipients.where('merchantId','==',merchantId).get()`. `findByAlias` →
  `recipients.doc(\`${merchantId}_${alias}\`).get()` (ya no es query, es lookup directo). `findOne(id,
  merchantId)` → `recipients.doc(id).get()` + comparar `data.merchantId === merchantId`. `create` →
  `recipients.doc(\`${merchantId}_${alias}\`).create({...})` — **reemplaza la unicidad que daba Postgres**:
  si el doc ya existe, `.create()` tira un error con `code === 'already-exists'` (gRPC status 6), que
  `RecipientsService.create` atrapa igual que hoy atrapa `P2002` (ver Etapa 1.10, fix 4, actualizado).
  `update`/`delete` → `recipients.doc(id).update(data)`/`.delete()`.
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
- Scoping por tenant implementado en Etapa 1.10: `OrdersService.findByIdForTenant` valida que el `Order`
  pertenezca a un merchant del `tenantId` del JWT antes de devolverlo.

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
  **Migración a Firestore**: `orders` usa **auto-ID** (nunca compuesto — el id es público en
  `/pay/[orderId]`, tiene que seguir siendo no adivinable, ver modelo de datos Etapa 1.1). `findById(id)`
  → `orders.doc(id).get()`. `create` deja de poder confiar en una constraint de DB para
  `(merchantId, orderRef)` — se envuelve en `db.runTransaction(async tx => { const dup = await
  tx.get(orders.where('merchantId','==',merchantId).where('orderRef','==',orderRef).limit(1)); if
  (!dup.empty) throw new ConflictException('orderRef already exists'); const ref = orders.doc(); tx.set(ref,
  {...}); return ref; })`. `update(id, data)` → `orders.doc(id).update(data)`. `sumPaidSince` → query
  filtrada (`where merchantId ==, status == 'PAID', createdAt >= since`) + suma en JS de `amount` parseado
  a número (no hay `sum()` nativo sobre un campo string) — ver el punto de agregación en Etapa 1.1.
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
- **Response 200** (fix aplicado en Etapa 1.10): `{ "xdr": "AAAAAgAAAAA..." }`
- **Errores**: `404 Order not found` · `500` RPC/simulación falla.

**Contrato — `POST /v1/public/orders/:id/submit`**
- **Auth**: Public · **Request body**: `{ "signedXdr": "AAAAAgAAAAA..." }`
- Envía el XDR firmado; marca `Order.status = PAID`, `payTxHash`, publica `order:paid` (Etapa 1.8).
- **Response 200** (fix aplicado en Etapa 1.10): `{ "hash": "3f2a..." }`
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

**Estado**: Completada (sobre Prisma). `voice-agent.processor.ts`, `voice-agent.module.ts` y
`voice-agent.worker.module.ts` ya están implementados siguiendo el diseño de abajo.

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
    `merchantId`, `NotFoundException` si no existe — **migración a Firestore**:
    `voiceCommands.doc(commandId).get()` + comparar `data.merchantId === merchant.id` en código, sin
    joins, mismo patrón que `findByIdForTenant` de Orders); castea `command.intentJson` a `StoredIntent { intent,
    order_ref?, amount?, splits?: {recipient_alias, amount}[] }`; si `intent !== 'create_order'` o
    faltan `order_ref`/`amount`, `BadRequestException('Command has no confirmable create_order
    intent')`; mapea `splits` a `CreateOrderDto` (`recipient_alias` → `recipientAlias`); llama
    `orders.createFromIntent(merchant.id, dto)` (Etapa 1.5, que valida alias/montos); marca
    `VoiceCommand.status = 'CONFIRMED'`; devuelve el `Order` creado.
- `voice-agent.controller.ts` — `POST v1/voice/commands` con
  `@UseInterceptors(FileInterceptor('audio'))` + `@UploadedFile()` (requiere `@types/multer`, ya
  instalado); `POST v1/voice/commands/:id/confirm`.

**Implementado**:

1. **`voice-agent.processor.ts`** — mismo patrón que `orders.processor.ts` de la Etapa 1.5:
   `@Processor(QUEUE_NAMES.VOICE_COMMANDS) export class VoiceAgentProcessor extends WorkerHost`,
   constructor con `@Inject(AGENT_PROVIDER) agent: AgentProvider`, `PrismaService`,
   `NotificationsPublisher`. `process(job)`: `prisma.voiceCommand.findUnique({where:{id:
   job.data.commandId}})` (si no existe, `logger.warn` + `return`, igual que `OrdersProcessor`) →
   `Buffer.from(job.data.audioBase64, 'base64')` → `agent.transcribe(audio, filename)` →
   `agent.interpret(transcript)` → `status = confidence < 0.6 || intent === 'unknown' ? 'UNKNOWN' :
   'PENDING'` → `prisma.voiceCommand.update({data: {transcript, intentJson: {...en snake_case, matching
   StoredIntent de voice-agent.service.ts}, status}})` → `notifications.publish(merchantId,
   'voice:confirmation', {commandId, transcript, intent})`.
   **Migración a Firestore**: `voiceCommands.doc(commandId).get()` (equivalente a `findUnique`);
   `voiceCommands.doc(command.id).update({...})`.
   `AgentProvider`/`AGENT_PROVIDER` ya existen en
   `backend/src/infrastructure/agent/agent-provider.interface.ts` (implementado por `RavenClient`,
   `backend/src/infrastructure/agent/raven-client.service.ts`, que llama a `RAVEN_URL` por HTTP).

2. **`voice-agent.module.ts`** — `BullModule.registerQueue({name: QUEUE_NAMES.VOICE_COMMANDS})`, importa
   `MerchantsModule` y `OrdersModule`; `controllers: [VoiceAgentController]`, `providers:
   [VoiceAgentService]`.

3. **`voice-agent.worker.module.ts`** — mismo patrón que `orders.worker.module.ts`: registra la misma
   cola, importa `AgentModule` (de `infrastructure/agent/`) y `NotificationsPublisherModule`; `providers:
   [VoiceAgentProcessor]`. Solo lo importa `worker.module.ts` (Etapa 1.11).

**Verificación de la etapa**: subir un audio de prueba crea el `VoiceCommand` y encola el job; con
`AgentProvider` mockeado (sin Raven real todavía, ej. un `FakeAgentProvider` que devuelve un intent fijo)
el processor actualiza `transcript`/`intentJson` y publica el evento WS; `confirm` sobre un `intentJson`
válido crea la `Order` esperada. **Pendiente de verificar en runtime** (requiere Postgres/Redis locales,
ver Fase 2) — el código compila y pasa `npm run build`/`lint`.

### Etapa 1.8 — Notifications (WebSocket)

**Estado**: Completada (el gap de auth original se cerró en la Etapa 1.10).

**Objetivo**: notificar en tiempo real al POS, desde cualquiera de los dos procesos.

**Contrato**:
- **Namespace**: `/notifications` (Socket.IO, CORS abierto en dev).
- **Conexión**: el cliente manda el JWT en `socket.handshake.auth.token` (fix de Etapa 1.10 — el query
  param `merchantId` que se usaba antes ya no es fuente de verdad); el gateway lo valida y resuelve el
  merchantId real antes de unir el socket a la room.
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
  (async, fix de Etapa 1.10): lee `socket.handshake.auth.token`, si falta hace `socket.disconnect(true)`;
  si está, `jwt.verifyAsync<JwtPayload>(token)` → `merchants.findByTenant(payload.tenantId)` →
  `socket.join(merchant.id)`; cualquier error (token inválido, merchant no existe) desconecta el socket.
  Ya no existe un handler `@SubscribeMessage('join')` manual — aceptaba un `merchantId` arbitrario del
  cliente sin validar, así que se eliminó en vez de intentar validarlo también.
- `notifications.module.ts` — importa `NotificationsPublisherModule`, `MerchantsModule` (para resolver el
  merchant en `handleConnection`) y `JwtModule.registerAsync` (propio, mismo secret que `AuthModule` vía
  `ConfigService` — evita que `NotificationsModule` dependa de `AuthModule` directamente); agrega
  `NotificationsGateway` a `providers`. **Solo lo importa `app.module.ts`** (Etapa 1.11) — nunca el
  worker, porque el gateway necesita el servidor HTTP de la API para levantar Socket.IO.

**Verificación de la etapa**: conectar un cliente Socket.IO de prueba a `/notifications?merchantId=X`,
publicar manualmente vía `redis-cli PUBLISH merchant:X:events '{"event":"order:created","payload":{}}'`
y confirmar que el cliente lo recibe.

### Etapa 1.9 — Analytics

**Estado**: Completada (sobre Prisma).

**Objetivo**: totales del día para el dashboard del comerciante.

**Contrato — `GET /v1/analytics/today`**
- **Auth**: JWT
- **Response 200**:
  ```json
  { "totalAmount": "184.50", "count": 7, "from": "2026-09-22T00:00:00.000Z", "to": "2026-09-22T18:32:00.000Z" }
  ```
- **Errores**: `404 Merchant not found`.

**Implementado**:

1. **`analytics.service.ts`**:
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
   **Estado real**: implementado y funcionando sobre Prisma (`_sum`/`_count` de `aggregate`). Con la
   migración a Firestore (Etapa 1.12), `sumPaidSince` deja de devolver `{_sum, _count}` al estilo Prisma
   y pasa a devolver `{ total: number, count: number }` calculado en JS sobre los docs filtrados (ver
   Etapa 1.5) — `AnalyticsService.today` se ajusta a `totalAmount: total.toString()`, `count`.
2. **`analytics.controller.ts`**: `GET v1/analytics/today` (JWT), delega a `AnalyticsService.today(tenantId)`.
3. **`analytics.module.ts`**: importa `MerchantsModule` y `OrdersModule`; `controllers:
   [AnalyticsController]`, `providers: [AnalyticsService]`.
4. Agregar `AnalyticsModule` a `app.module.ts` (Etapa 1.11).

**Verificación de la etapa**: con órdenes de prueba `PAID` de hoy y de ayer, la respuesta suma solo las
de hoy; con cero órdenes `PAID` hoy, `totalAmount` es `"0"` y no `null`/error (hoy cubre el caso
`_sum.amount === null` de Prisma `aggregate`; en Firestore, el caso equivalente es el array de docs
vacío → `total` arranca en `0`).

### Etapa 1.10 — Deuda técnica y hardening

**Estado**: Completada.

**Objetivo**: cerrar los gaps identificados en las etapas anteriores antes de dar la fase por cerrada.

**Implementado**:

1. **[Crítico] `TenantGuard` respeta `@Public()`**: se agregó `Reflector` al constructor (mismo patrón
   que `JwtAuthGuard`) y, al inicio de `canActivate`, `if
   (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC_KEY, [context.getHandler(),
   context.getClass()])) return true;` antes de exigir `request.user.tenantId`. Sin este fix, registrar
   `TenantGuard` como `APP_GUARD` global (Etapa 1.11) hubiera roto con `401` toda ruta `@Public()`,
   `POST /v1/auth/login` incluido.
2. **Status codes correctos**: `@HttpCode(HttpStatus.OK)` agregado en `AuthController.login`,
   `MerchantsController.buildOperatorTx`/`submitOperatorTx`, `PaymentsController.buildTx`/`submit`.
   `VoiceAgentController.confirm`/`create` y `RecipientsController.create` no se tocaron — devuelven
   `201` por default de Nest, correcto porque crean un recurso (`Order`, `VoiceCommand`, `Recipient`).
   `@HttpCode(HttpStatus.NO_CONTENT)` agregado en `RecipientsController.remove`, que ahora devuelve
   `Promise<void>` en vez del registro borrado.
3. **Scoping de `GET /v1/orders/:id`**: `OrdersRepository.findByIdForTenant(id, tenantId)` nuevo —
   `prisma.order.findFirst({where: {id, merchant: {tenantId}}})` (filtro por relación); `OrdersService`
   expone `findByIdForTenant` (separado de `findById`, que sigue sin scoping y lo usa `findPublic`
   internamente); `OrdersController.findOne` pasa `@CurrentTenant() tenantId`.
   **Migración a Firestore**: sin joins — `findByIdForTenant` pasa a leer el `Order`, después el
   `Merchant` (`orders.doc(id).get()` → `merchants.doc(order.merchantId).get()`) y comparar
   `merchant.tenantId === tenantId` en código; `404` si no matchea, igual que hoy.
4. **Conflicto de alias duplicado**: `RecipientsService.create` envuelve `repository.create` en
   `try/catch`; si `error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002'`,
   lanza `ConflictException('Alias already exists')`.
   **Migración a Firestore**: cambia la condición del catch — con el doc ID determinístico
   `` `${merchantId}_${alias}` `` (Etapa 1.1/1.4), `.create()` tira un error con `code === 6` /
   `error.code === 'already-exists'` (Admin SDK) en vez de `P2002`; el resto de la lógica
   (`ConflictException('Alias already exists')`) no cambia.
5. **Auth del WebSocket**: `NotificationsGateway.handleConnection` lee el JWT de
   `socket.handshake.auth.token` (no del query param `merchantId`, que ya no es fuente de verdad), lo
   valida con `JwtService.verifyAsync` (mismo secret que `JwtStrategy`, vía `JwtModule.registerAsync` en
   `notifications.module.ts`), resuelve el `merchantId` real con `MerchantsService.findByTenant` y recién
   ahí hace `socket.join(merchant.id)`; si el token falta o es inválido, `socket.disconnect(true)`. Se
   eliminó el handler manual `@SubscribeMessage('join')` — aceptaba un `merchantId` arbitrario del
   cliente sin validar, era el mismo agujero que el query param.

**Verificación de la etapa**: `npm run build`/`lint` verdes (confirmado). Pendiente de probar en runtime
contra Postgres/Redis locales (Fase 2): `POST /v1/auth/login` funciona con `TenantGuard` global activo,
crear dos `Recipient` con el mismo alias da `409`, `GET /v1/orders/:id` de un tenant ajeno da `404`,
conectar al WS sin token válido desconecta el socket.

### Etapa 1.11 — Wiring de los dos procesos

**Estado**: Completada.

**Objetivo**: que `main.ts` (API) y `worker.ts` (worker, nuevo) arranquen con todos los módulos de las
etapas anteriores correctamente separados.

**Implementado**:

1. **`src/app.module.ts`** — reemplazó el boilerplate de `nest new`:
   - `ConfigModule.forRoot({ isGlobal: true, validate: validateEnv })` (`src/config/env.validation.ts`,
     con `zod`).
   - `PrismaModule`, `RedisModule`, `StellarModule`, `AgentModule` (`@Global()`, importados una sola vez
     acá). **Migración a Firestore**: `PrismaModule` → `FirestoreModule`.
   - `QueueModule` (config de conexión BullMQ).
   - `NotificationsModule` (con gateway — Etapa 1.8), `HealthModule` (nuevo, ver abajo).
   - Módulos de dominio: `AuthModule, TenantsModule, MerchantsModule, RecipientsModule, OrdersModule,
     PaymentsModule, VoiceAgentModule, AnalyticsModule` (los de controller/service; **no** los
     `*.worker.module.ts`).
   - `providers`: `{ provide: APP_GUARD, useClass: JwtAuthGuard }`, `{ provide: APP_GUARD, useClass:
     TenantGuard }` (en ese orden), `{ provide: APP_FILTER, useClass: AllExceptionsFilter }`. Seguro
     porque `TenantGuard` ya tiene el fix de `@Public()` de la Etapa 1.10.
2. **`src/worker.module.ts`** (nuevo): mismos módulos de infraestructura que `app.module.ts` +
   `NotificationsPublisherModule` (sin gateway) + `OrdersWorkerModule` + `VoiceAgentWorkerModule`. Sin
   `controllers` en ningún nivel — este proceso no expone HTTP.
3. **`src/main.ts`**: `ValidationPipe({whitelist:true, transform:true})` global; Swagger en `/docs`
   (`DocumentBuilder().setTitle('VoxPay API').addBearerAuth()`); CORS con
   `FRONTEND_URL` (`config.get`, no `getOrThrow` — variable opcional, `*` si no está); `pinoHttp()` como
   middleware antes de `app.listen`; `app.listen(config.get('PORT') ?? 3001)`. El `AllExceptionsFilter`
   queda cubierto por `APP_FILTER` en `app.module.ts`, no se duplica en `main.ts`.
4. **`common/health/`** (nuevo): `HealthController` (`GET /health`, `@Public()`, `@HealthCheck()`) usa
   `HealthCheckService.check([() => this.prismaIndicator.pingCheck('database', this.prisma)])` con
   `PrismaHealthIndicator` de `@nestjs/terminus` (confirmado que existe y trae `pingCheck(key,
   prismaClient, options?)` en la versión instalada — no es una clase que haya que escribir a mano).
   `HealthModule` importa `TerminusModule`.
   **Migración a Firestore**: `@nestjs/terminus` no trae un indicador para Firestore. Reemplazar por un
   health check manual usando la API más nueva de Terminus (`HealthIndicatorService.check('firestore').
   attempt(() => firestore.db.collection('_health').limit(1).get())`), o simplemente
   `firestore.db.listCollections()` como ping.
5. **`src/worker.ts`** (nuevo): `NestFactory.createApplicationContext(WorkerModule)` +
   `app.enableShutdownHooks()` — sin `.listen()`.
6. Se borraron `app.controller.ts`, `app.service.ts`, `app.controller.spec.ts` (boilerplate default,
   ya no referenciados).
7. `package.json` de `backend/`: scripts `worker` (`nest start --entryFile worker`), `worker:dev` (`nest
   start --watch --entryFile worker`), `worker:prod` (`node dist/worker`) — confirmado que
   `--entryFile` es un flag real de `@nestjs/cli` en la versión instalada.

**Verificación de la etapa** (y de toda la Fase 1, sobre Prisma): `npm run build`/`npm run lint` sin
errores — **confirmado, ambos verdes**. Pendiente de correr `start:dev`/`worker:dev` contra
Postgres/Redis reales (Fase 2) y confirmar Swagger en `/docs`.

### Etapa 1.12 — Migración PostgreSQL/Prisma → Firestore

**Estado**: Pendiente. Esta etapa reemplaza la Fase 2 original (que asumía Postgres) — hasta que esté
completa, el backend sigue corriendo sobre Prisma tal como está descrito en las Etapas 1.1–1.11.

**Objetivo**: dejar el backend corriendo sobre Firestore, sin Prisma ni PostgreSQL, con el mismo
comportamiento externo (contratos REST/WS/colas sin cambios — ver cada etapa de arriba).

**Tareas**:

1. **Dependencias** (`backend/package.json`): quitar `@prisma/client`, `@prisma/adapter-pg`, `pg`,
   `prisma` (devDep), `@types/pg`; agregar `firebase-admin`.
2. **Borrar**: `backend/prisma/` (`schema.prisma`, migraciones), `backend/prisma7.config.ts`,
   `backend/src/generated/prisma/` (gitignored, se regeneraba con `prisma generate` — ya no aplica),
   `backend/src/infrastructure/prisma/` (`prisma.module.ts`, `prisma.service.ts`).
3. **Crear `backend/src/infrastructure/firestore/`**:
   - `firestore.service.ts` — `FirestoreService implements OnModuleInit`: en `onModuleInit`, si
     `!getApps().length`, `initializeApp({projectId, credential: cert(JSON.parse(serviceAccountJson))})`
     en producción, o solo `initializeApp({projectId})` si `FIRESTORE_EMULATOR_HOST` está seteado (el SDK
     de Admin detecta esa env var solo y se conecta al emulador, sin credenciales); expone `db =
     getFirestore()`.
   - `firestore.module.ts` — `@Global() @Module({providers:[FirestoreService], exports:
     [FirestoreService]})`.
4. **Reescribir cada repositorio** reemplazando las llamadas a `PrismaService` por `FirestoreService.db`,
   siguiendo el diseño de colecciones de la Etapa 1.1 y las notas de "Migración a Firestore" ya escritas
   en cada etapa:
   - `TenantsService` (Etapa 1.3).
   - `MerchantsService` (Etapa 1.3).
   - `RecipientsRepository` (Etapa 1.4) — doc ID compuesto `merchantId_alias`.
   - `OrdersRepository` (Etapa 1.5) — auto-ID + transacción para unicidad de `orderRef`.
   - `AuthService` (Etapa 1.2) — query de `users` por email.
   - `VoiceAgentService`/`VoiceAgentProcessor` (Etapa 1.7) — colección `voiceCommands`.
   - `AnalyticsService` (Etapa 1.9) — suma en JS en vez de `aggregate`.
   - `RecipientsService.create` (Etapa 1.10) — catch de `already-exists` en vez de `P2002`.
5. **`app.module.ts`/`worker.module.ts`** (Etapa 1.11): `PrismaModule` → `FirestoreModule`.
6. **`common/health/health.controller.ts`** (Etapa 1.11): reemplazar `PrismaHealthIndicator` por el
   health check manual de Firestore.
7. **Env**: quitar `DATABASE_URL` de `src/config/env.validation.ts` y de `.env.example`; agregar
   `FIREBASE_PROJECT_ID` (siempre), `FIREBASE_SERVICE_ACCOUNT` (JSON del service account, solo
   producción/staging — nunca en `.env.example` con un valor real), `FIRESTORE_EMULATOR_HOST` (solo
   local, ej. `localhost:8080`).
8. **`docker-compose.yml`**: quitar el servicio `postgres` (Redis se mantiene). El Firestore local ya no
   es un contenedor Docker — ver Etapa 2.1 actualizada (Firebase Emulator Suite vía `firebase-tools`,
   requiere Java).
9. **`.gitignore`** de `backend/`: quitar la entrada de `src/generated/prisma`; no hace falta agregar
   nada nuevo (las credenciales de Firebase van por env var, no por archivo versionado).

**Verificación de la etapa**: `npm run build`/`npm run lint` siguen verdes sin ninguna referencia a
`prisma`/`@prisma` en `backend/src/`; `grep -r "prisma" backend/src` no devuelve nada. El resto de la
verificación (runtime real) se hace en la Fase 2 actualizada, contra el emulador de Firestore.

---

## Fase 2 — Integración local y smoke test

Objetivo de la fase: correr todo el sistema (menos el contrato real y Raven con modelo) contra
infraestructura local, validando los contratos de la Fase 1 con datos reales. Asume que la Etapa 1.12
(migración a Firestore) ya está hecha — esta fase ya no usa Postgres. Se divide en 5 etapas.

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
   `FIREBASE_PROJECT_ID`: cualquier string en local con el emulador (no hace falta que exista el
   proyecto real en Firebase); `FIRESTORE_EMULATOR_HOST=localhost:8080`; no completar
   `FIREBASE_SERVICE_ACCOUNT` en local (el SDK lo ignora cuando detecta el emulador).
2. Instalar `firebase-tools` (`npm i -g firebase-tools` o `npx firebase-tools`) y tener **Java (JRE
   11+)** instalado — el emulador de Firestore corre sobre una JVM (ver Restricciones de entorno).
   `firebase init emulators` una vez (elegir Firestore, puerto default `8080`) si no existe
   `firebase.json` en el repo todavía.
3. `firebase emulators:start --only firestore` en una terminal (reemplaza a
   `docker compose up postgres`); `docker compose up redis` en otra (Redis se mantiene igual, deja
   `raven` fuera del comando hasta la Etapa 2.5).

**Verificación**: el emulador imprime una URL de Emulator UI (`http://localhost:4000` por default)
donde se puede ver la base vacía; `docker compose ps` muestra `redis` healthy.

### Etapa 2.2 — Seed de datos

**Tareas**:
1. Crear `backend/scripts/seed.ts` usando `firebase-admin` directo (sin Prisma): conectar contra el
   emulador (mismas env vars que la app, `FIRESTORE_EMULATOR_HOST` hace que el Admin SDK nunca toque
   Firebase real) y escribir:
   ```
   // 1. tenants.add({ name: "Demo VoxPay", apiKeyHash: "...", plan: "free", createdAt: Timestamp.now() })
   // 2. users.add({ tenantId, email: "demo@voxpay.dev",
   //      passwordHash: await bcrypt.hash("password123", 10), role: "OWNER", createdAt: ... })
   // 3. merchants.add({ tenantId, stellarAddress: "<GABC... testnet>", operatorAuthorized: false, ... })
   // 4. recipients.doc(`${merchantId}_José`).set({ merchantId, alias: "José",
   //      stellarAddress: "<GXYZ...>", createdAt: ... })
   ```
2. Correr con `tsx backend/scripts/seed.ts` (o un script `npm run seed` nuevo en `package.json`) contra
   el emulador ya levantado (Etapa 2.1).

**Verificación**: abrir la Emulator UI (`http://localhost:4000/firestore`) y confirmar que existen los
4 documentos del seed.

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

**Tareas**: `vitest run --config vitest.config.e2e.ts` cubriendo el flujo voice→confirm→order contra el
emulador de Firestore + Redis de test (mismo `docker-compose.yml` para Redis; el emulador de Firestore
se resetea entre corridas con su endpoint REST de limpieza, `DELETE
http://localhost:8080/emulator/v1/projects/<project>/databases/(default)/documents`).

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
