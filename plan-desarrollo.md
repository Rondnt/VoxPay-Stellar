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
- **ai-service/**: FastAPI completo (`/health /transcribe /interpret`), **los 3 endpoints verificados con
  HTTP real** (Etapa 2.5): `pytest`/`ruff` verdes, y `/transcribe`/`/interpret` corriendo contra la **API
  hospedada de Groq** (`openai/gpt-oss-20b` + `whisper-large-v3-turbo`, decisión temporal del usuario
  mientras no exista el modelo Qwen 3B afinado local) en vez de mockeados o sin probar. El código local
  (`faster-whisper`/`llama-cpp-python`) queda intacto y seleccionable vía `AI_PROVIDER=local`. Contrato:
  [Fase 1 → Etapa 1.7](#etapa-17--módulo-voice-agent-y-cola-voice-commands).
- **backend/**: NestJS 12 + TS 6, ESM (`.js` en imports relativos, obligatorio por
  `moduleResolution: nodenext` — todo import relativo entre archivos `.ts` propios debe terminar en
  `.js`). **Fase 1 completa** (Etapas 1.1–1.12): base de datos **Firebase Firestore** (`firebase-admin`),
  sin Prisma ni PostgreSQL. `npm run build`/`npm run lint`/`npm run test` verdes (10/10 tests unitarios,
  Etapa 5.1). **Fase 2 (Etapas 2.1–2.3) verificada en runtime real**: emulador de Firestore + Redis
  corriendo, seed cargado, API y worker booteando limpio. `SorobanService` migrado a encodear/decodear
  argumentos contra el spec real del contrato (`Spec.funcArgsToScVals`/`funcResToNative`, Etapa 3.4) en
  vez de `xdr.ScVal` armados a mano. **El flujo completo voz→confirmar→orden→pago fue verificado de punta
  a punta contra Stellar Testnet real** (Etapa 3.5): `set_operator`, `create_order` y `pay` los tres
  ejecutados on-chain con éxito (no solo simulados), incluyendo el escalado decimal correcto
  (`SorobanService.toContractAmount()`) y el split de fondos real entre comerciante y destinatario.
  Detalle: [Fase 1](#fase-1--backend-módulos-de-dominio-y-contratos),
  [Fase 2](#fase-2--integración-local-y-smoke-test) y
  [Fase 3](#fase-3--contrato-soroban-build-test-y-deploy).
- **contracts/voxpay/**: **Fase 3 completa (Etapas 3.1–3.5) y verificada contra Stellar Testnet real**:
  `cargo test` (2/2) y el build de producción pasan, contrato desplegado e inicializado —
  `CONTRACT_ID = CBFO53O3IHNMHCPAGJZXZMN2SOHA3BRKAJHAIRVNFKPZZD4E44BNX57Q` — y su ciclo de vida completo
  (`set_operator` → `create_order` → `pay`) ejercitado con cuentas de testnet reales y USDC real de
  testnet (conseguido vía el DEX de testnet, no un faucet). Detalle:
  [Fase 3](#fase-3--contrato-soroban-build-test-y-deploy).

## Restricciones de entorno detectadas

Todos los bloqueos de entorno detectados en este proyecto **terminaron resolviéndose sin permisos de
administrador** — quedan documentados igual porque el camino para resolverlos no es obvio.

- `ai-service` necesita un modelo GGUF real (Qwen 3B afinado) para probar `/interpret` de punta a punta —
  este sigue sin resolverse, es un artefacto a entrenar/conseguir aparte, no un problema de entorno.
- Next.js 16 tiene breaking changes fuertes respecto a versiones anteriores (`proxy.ts` en vez de
  `middleware.ts`).
- **Rust/cargo/stellar-cli, resuelto**: no había nada instalado. `rustup-init.exe` instala Rust entero en
  `%USERPROFILE%` sin admin, pero el toolchain MSVC por default no tiene linker utilizable sin Visual
  Studio Build Tools. Cambiando al toolchain GNU (`rustup default stable-x86_64-pc-windows-gnu`) más un
  mingw-w64 moderno standalone (zip portable, sin instalador — la TDM-GCC vieja que ya estaba en el PATH
  no es compatible) se puede compilar todo, incluido el target `wasm32v1-none` que pide Soroban.
  `stellar-cli` se instala con `winget install --id Stellar.StellarCLI` sin admin tampoco. Ver detalle
  completo en Fase 3, Etapa 3.2.
- **Java, resuelto**: sí había un JDK 21 instalado (`C:\Program Files\Java\jdk-21`), solo que el PATH le
  daba prioridad a un Java 8 viejo de Oracle (`Common Files\Oracle\Java\javapath`). Apuntando `JAVA_HOME`/
  `PATH` a ese JDK 21 para el proceso del emulador, `firebase emulators:start --only firestore` levanta
  sin problema (el emulador de Firestore corre sobre una JVM y `firebase-tools` rechaza Java <21).
- **Docker Desktop, resuelto con workaround**: `docker info` nunca conecta al daemon, y
  `Start-Service com.docker.service` falla por falta de permisos de administrador (no es un problema de
  virtualización, es un problema de permisos en esta sandbox puntual). Workaround sin Docker ni admin:
  correr `redis-server.exe` portable (build de
  [tporadowski/redis](https://github.com/tporadowski/redis), zip sin instalador) directo como proceso
  normal — no es un service, no requiere admin, se puede matar con `Stop-Process` en cualquier momento.
  Advertencia esperada e inofensiva: esa build es Redis 5.0.14, BullMQ pide 6.2+ como mínimo
  recomendado — funciona igual para desarrollo local, pero no usar esta versión en producción.

---

## Fase 1 — Backend: módulos de dominio y contratos

Objetivo de la fase: `npm run build` y `npm run lint` verdes en `backend/`, todos los contratos de esta
fase implementados y wireados en `app.module.ts` (proceso API) / `worker.module.ts` (proceso worker,
nuevo), corriendo sobre Firestore. Se divide en 12 etapas, en orden de dependencia. **Las 12 etapas están
completas** — el backend corre sobre Firebase Firestore (`firebase-admin`), sin Prisma ni PostgreSQL.
Cada etapa de abajo documenta tanto el diseño original en Prisma (contexto histórico) como la
implementación final en Firestore; la Etapa 1.12 tiene el resumen de qué cambió exactamente en la
migración. Falta la verificación en runtime (Fase 2 — requiere Java para el emulador de Firestore y
Docker para Redis, no disponibles en el entorno donde se escribió este plan).

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
  (`SorobanService.toContractAmount(Number(amount))`, ver Etapa 3.5).
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
    `soroban.buildUnsignedInvocation(merchant.stellarAddress, 'set_operator', {merchant:
    merchant.stellarAddress, operator: soroban.getOperatorPublicKey()})` — argumentos nombrados encodeados
    contra el spec real del contrato (Etapa 3.4), no `xdr.ScVal[]` armados a mano. Sin cambios con la
    migración (no toca Prisma directamente).
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
  3. `soroban.invokeAsOperator('create_order', {operator: operatorPublicKey, merchant:
     merchant.stellarAddress, order_id: order.orderRef, amount:
     SorobanService.toContractAmount(Number(order.amount)), splits: splits.map(s => ({recipient:
     s.stellarAddress, amount: SorobanService.toContractAmount(s.amount)}))})` — argumentos nombrados en
     JS plano; `SorobanService` los encodea con `Spec.funcArgsToScVals` contra el spec real del contrato
     (Etapa 3.4), escalando `amount` a la unidad mínima del asset en ambos niveles (orden y cada split,
     Etapa 3.5).
  4. `repository.update(order.id, {createTxHash: hash})`.
  5. `notifications.publish(order.merchantId, 'order:created', {orderId, orderRef, hash})`.
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
    {payer: payerPublicKey, order_id: order.orderRef})` — argumentos nombrados encodeados contra el spec
    real del contrato (Etapa 3.4).
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

**Estado**: Completada. `voice-agent.processor.ts`, `voice-agent.module.ts` y
`voice-agent.worker.module.ts` ya están implementados siguiendo el diseño de abajo (migrados a
Firestore en la Etapa 1.12).

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

**Estado**: Completada (migrada a Firestore en la Etapa 1.12).

**Objetivo**: totales del día para el dashboard del comerciante.

**Contrato — `GET /v1/analytics/today`**
- **Auth**: JWT
- **Response 200**:
  ```json
  { "totalAmount": "184.50", "count": 7, "from": "2026-09-22T00:00:00.000Z", "to": "2026-09-22T18:32:00.000Z" }
  ```
- **Errores**: `404 Merchant not found`.

**Implementado** (sobre Firestore, post Etapa 1.12):

1. **`analytics.service.ts`**:
   ```ts
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

       const { total, count } = await this.orders.sumPaidSince(merchant.id, from);
       return {
         totalAmount: total.toString(),
         count,
         from: from.toISOString(),
         to: to.toISOString(),
       };
     }
   }
   ```
   Reusa `OrdersRepository.sumPaidSince(merchantId, since)` (Etapa 1.5): filtra `orders` por
   `merchantId`/`status='PAID'`/`createdAt >= since` (requiere el índice compuesto de
   `firestore.indexes.json`) y suma `amount` (string) en JS, sin `sum()` nativo — devuelve
   `{ total: number, count: number }`.
2. **`analytics.controller.ts`**: `GET v1/analytics/today` (JWT), delega a `AnalyticsService.today(tenantId)`.
3. **`analytics.module.ts`**: importa `MerchantsModule` y `OrdersModule`; `controllers:
   [AnalyticsController]`, `providers: [AnalyticsService]`.
4. `AnalyticsModule` agregado a `app.module.ts` (Etapa 1.11).

**Verificación de la etapa**: con órdenes de prueba `PAID` de hoy y de ayer, la respuesta suma solo las
de hoy; con cero órdenes `PAID` hoy, `total` arranca en `0` (no hay caso `null` como con Prisma
`aggregate` — el array de docs vacío ya da `0` directo).

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

**Estado**: Completada.

**Objetivo**: dejar el backend corriendo sobre Firestore, sin Prisma ni PostgreSQL, con el mismo
comportamiento externo (contratos REST/WS/colas sin cambios — ver cada etapa de arriba).

**Implementado**:

1. **Dependencias** (`backend/package.json`): sacados `@prisma/client`, `@prisma/adapter-pg`, `pg`,
   `prisma` (devDep), `@types/pg`; agregado `firebase-admin` (`^13.10.0`). `@nestjs/terminus` sigue
   trayendo `@prisma/client` como dependencia opcional propia (para su `PrismaHealthIndicator`, que ya no
   usamos) — queda instalado en `node_modules` sin que nuestro código lo importe; no es un residuo del
   código, es normal.
2. **Borrados**: `backend/prisma/`, `backend/prisma7.config.ts`, `backend/src/generated/prisma/`,
   `backend/src/infrastructure/prisma/`. `grep -r "prisma" backend/src` no devuelve nada.
3. **`backend/src/infrastructure/firestore/`** (nuevo):
   - `firestore.service.ts` — `FirestoreService implements OnModuleInit`: si `!getApps().length`,
     `initializeApp({projectId})` cuando `FIRESTORE_EMULATOR_HOST` está seteado (el Admin SDK se conecta
     solo al emulador, sin credenciales), o `initializeApp({projectId, credential:
     cert(JSON.parse(serviceAccountJson))})` si no; expone `db = getFirestore()`.
   - `firestore.module.ts` — `@Global()`, mismo rol que `PrismaModule` antes.
   - `firestore.utils.ts` — `timestampToIso(timestamp)` compartido por todos los repositorios.
4. **Repositorios/servicios reescritos** (todos siguiendo el diseño de colecciones de la Etapa 1.1):
   - `TenantsService`, `MerchantsService` (Etapa 1.3) — queries `where` + `.doc(id).get()`.
   - `AuthService` (Etapa 1.2) — `users.where('email','==',email).limit(1)`.
   - `RecipientsRepository` (Etapa 1.4) — doc ID `` `${merchantId}_${alias}` ``; `.create()` sobre un ID
     existente tira un error con `code === 6` (gRPC `ALREADY_EXISTS`); `RecipientsService.create` lo
     atrapa y lanza `ConflictException` (reemplaza el chequeo de `P2002` de Prisma).
   - `OrdersRepository` (Etapa 1.5) — auto-ID (el id es público en `/pay/[orderId]`); `create()` corre en
     `db.runTransaction(...)` para validar `(merchantId, orderRef)` único sin constraint de DB;
     `findByIdForTenant` lee la orden y después el merchant por separado (sin joins) y compara
     `tenantId` en código; `sumPaidSince` filtra y suma `amount` (string) en JS, devuelve
     `{total, count}` en vez de `{_sum, _count}`.
   - `VoiceAgentService`/`VoiceAgentProcessor` (Etapa 1.7) — colección `voiceCommands`, mismo patrón de
     `.doc(id).get()`/`.update()`.
   - `AnalyticsService` (Etapa 1.9) — ajustado a `{total, count}` de `OrdersRepository.sumPaidSince`.
5. **`app.module.ts`/`worker.module.ts`** (Etapa 1.11): `PrismaModule` → `FirestoreModule`.
6. **`common/health/health.controller.ts`** (Etapa 1.11): `PrismaHealthIndicator` reemplazado por
   `HealthIndicatorService.check('firestore').attempt(() => firestore.db.listCollections())` — la API
   nueva de Terminus (confirmada contra el código instalado, no es una clase a mano).
7. **Env**: `DATABASE_URL` sacado de `env.validation.ts`/`.env.example`/`.env`; agregados
   `FIREBASE_PROJECT_ID` (requerido), `FIRESTORE_EMULATOR_HOST` (opcional, solo local) y
   `FIREBASE_SERVICE_ACCOUNT` (opcional, solo producción/staging) — los dos últimos con `.optional()` en
   el schema de zod porque son mutuamente excluyentes según el entorno.
8. **`docker-compose.yml`**: servicio `postgres` eliminado (Redis se mantiene); comentario explicando que
   Firestore local corre vía Firebase Emulator Suite, no Docker.
9. **`firebase.json` + `firestore.rules` + `firestore.indexes.json`** (nuevos, raíz del repo):
   - `firebase.json`: config del emulador (Firestore puerto `8080`, UI puerto `4000`).
   - `firestore.rules`: deniega todo acceso de cliente (`allow read, write: if false`) — el Admin SDK del
     backend ignora las reglas por diseño; esto es defensa en profundidad, ningún cliente debería tener
     credenciales de Firebase para hablarle directo a la base.
   - `firestore.indexes.json`: los 2 índices compuestos que las queries de `OrdersRepository` necesitan
     (`merchantId+orderRef` para la unicidad, `merchantId+status+createdAt` para `sumPaidSince`) — sin
     esto, esas queries fallan en runtime con `FAILED_PRECONDITION` hasta crear el índice a mano.
10. **`.gitignore`**: entrada de `src/generated/prisma` sacada de `backend/.gitignore`; agregado
    `.firebase/` (caché local del emulador) en el `.gitignore` raíz.

**Verificación de la etapa**: `npm run build`, `npm run lint` y `npm run test` verdes — **confirmado**
(10/10 tests unitarios pasan, ver Fase 5, Etapa 5.1). No se pudo verificar en runtime contra el emulador
real: se intentó levantar `firebase emulators:start --only firestore` directo (sin Docker) y confirmó el
bloqueo real — `firebase-tools` exige Java 21+, este entorno solo tiene Java 8. Docker Desktop tampoco
arranca acá (ver Restricciones de entorno), así que ni Redis se puede levantar. Eso queda para la Fase 2,
en una máquina con Docker real y Java 21+ — es el siguiente paso pendiente de todo el plan.

---

## Fase 2 — Integración local y smoke test

Objetivo de la fase: correr todo el sistema (menos el contrato real y Raven con modelo) contra
infraestructura local, validando los contratos de la Fase 1 con datos reales. Se divide en 5 etapas.
**Etapas 2.1–2.3 y 2.5 completas y verificadas en runtime real** (backend + worker contra el emulador de
Firestore y Redis; ai-service con `pytest`/`ruff` verdes y el servidor real respondiendo `/health`). Solo
queda 2.4 (frontend), fuera de este alcance — lo lleva otra persona.

### Etapa 2.1 — Configuración de entorno

**Estado**: Completada y verificada en runtime — el emulador de Firestore y Redis (vía el workaround
portable, ver Restricciones de entorno) quedaron corriendo de verdad, no solo documentados.

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
2. Instalar `firebase-tools` (`npm i -g firebase-tools` o `npx firebase-tools`) y tener **Java 21+**
   instalado — el emulador de Firestore corre sobre una JVM y `firebase-tools` rechaza versiones más
   viejas (ver Restricciones de entorno). `firebase.json`/`firestore.rules`/`firestore.indexes.json` ya
   existen en la raíz del repo (Etapa 1.12), no hace falta `firebase init`.
3. `firebase emulators:start --only firestore` en una terminal (reemplaza a
   `docker compose up postgres`); `docker compose up redis` en otra (Redis se mantiene igual, deja
   `raven` fuera del comando hasta la Etapa 2.5).

**Verificación**: el emulador imprime una URL de Emulator UI (`http://localhost:4000` por default)
donde se puede ver la base vacía; `docker compose ps` muestra `redis` healthy (o, con el workaround
portable, `redis-cli.exe ping` responde `PONG`) — **confirmado, ambos corriendo**.

### Etapa 2.2 — Seed de datos

**Estado**: Completada y verificada. `npm run seed` corrió contra el emulador real: creó `Tenant` "Demo
VoxPay", `User` demo@voxpay.dev, `Merchant` con keypair Stellar generada, y `Recipient` "José" con doc ID
`${merchantId}_José`.

**Implementado** — `backend/scripts/seed.ts`: usa `firebase-admin` directo (sin NestJS, sin Prisma),
carga `backend/.env` con `import 'dotenv/config'`, tira un error explícito si `FIRESTORE_EMULATOR_HOST`
no está seteado (para que nunca pueda escribir contra Firebase real por accidente). Genera un
`Keypair.random()` de `@stellar/stellar-sdk` para el merchant y para el recipient "José" (direcciones con
formato válido, sin fondear) y escribe, en orden: `tenants.add({name: "Demo VoxPay", plan: "free",
apiKeyHash: hash("demo-api-key"), createdAt})` → `users.add({tenantId, email: "demo@voxpay.dev",
passwordHash: hash("password123"), role: "OWNER", createdAt})` → `merchants.add({tenantId,
stellarAddress: merchantKeypair.publicKey(), operatorAuthorized: false, createdAt})` →
`recipients.doc(\`${merchantId}_José\`).set({merchantId, alias: "José", stellarAddress:
recipientKeypair.publicKey(), defaultShare: null, createdAt})`; imprime los ids y las secret keys
generadas (para poder fondearlas con friendbot más adelante si hace falta probar contra testnet real).
Script `npm run seed` (`tsx scripts/seed.ts`) agregado a `backend/package.json`; `tsx` y `dotenv`
agregados como devDependencies.

**Verificación**: abrir la Emulator UI (`http://localhost:4000/firestore`) y confirmar que existen los
4 documentos del seed — **confirmado** (y además vía la API: `GET /v1/merchants/me` y
`GET /v1/recipients` devuelven exactamente estos datos, ver Etapa 2.3).

### Etapa 2.3 — Backend local (API + worker)

**Estado**: Completada y verificada — **primera vez que el backend completo corre de punta a punta**.

**Verificado**:
1. `npm run start:dev` (API): boot limpio, los 12 módulos de dominio + infra se inicializan sin error,
   todas las rutas quedan mapeadas (log de `RouterExplorer` por cada endpoint). `npm run worker:dev`:
   boot limpio también, `OrdersWorkerModule`/`VoiceAgentWorkerModule` inicializados.
2. `POST /v1/auth/login` con el `User` del seed → `200` con un JWT válido.
3. Con ese JWT: `GET /v1/merchants/me` → `200`, datos del seed exactos. `GET /v1/recipients` → `200`,
   `[{alias: "José", ...}]` del seed. `GET /v1/analytics/today` → `200`,
   `{totalAmount:"0", count:0, from, to}` — confirma que el caso "cero órdenes hoy" de Firestore (sin
   `sum()` nativo, ver Etapa 1.1) da `"0"` y no rompe. `GET /v1/merchants/me` sin `Authorization` → `401`
   — confirma que `TenantGuard` con el fix de `@Public()` (Etapa 1.10) protege rutas privadas sin romper
   las públicas.
4. `POST /v1/recipients` con alias `"José"` duplicado → `409 {"message":"Alias already exists"}` —
   confirma que la unicidad basada en doc ID de Firestore (Etapa 1.4/1.12) funciona en la práctica, no
   solo en el diseño. (Nota de la prueba: un primer intento con la tilde de "José" pasada inline por
   shell se corrompió por encoding del terminal, no del backend — repetido con el body en un archivo
   UTF-8 y ahí sí dio `409` correctamente.) `DELETE /v1/recipients/:id` → `204` sin body.
5. **Flujo de negocio central probado de punta a punta**: se insertó un `voiceCommand` directo en el
   emulador (simulando lo que dejaría Raven, sin depender de ai-service/GGUF) con intent `create_order`,
   `order_ref`, `amount: 30`, split de `3` para "José". `POST /v1/voice/commands/:id/confirm` → `201`,
   devuelve la `Order` creada (split con el `stellarAddress` de "José" ya resuelto desde `recipients`) —
   confirma que `VoiceAgentService.confirm` → `OrdersService.createFromIntent` → `OrdersRepository.create`
   (transacción de unicidad, Etapa 1.5/1.12) → `ordersQueue.add('create_order', ...)` funciona
   exactamente como está documentado, y que el worker recoge el job de la cola.
   **Primer diagnóstico incorrecto, corregido**: en la primera prueba no se vio ningún log después de
   encolar y se interpretó como que `SorobanService.invokeAsOperator` quedaba colgado sin timeout en el
   RPC. Verificación aislada del SDK (`server.getAccount` contra una cuenta inexistente en testnet real)
   mostró que en realidad **rechaza en ~400ms** (`Account not found: ...`) — no había ningún cuelgue. El
   problema real era otro: **`OrdersProcessor`/`VoiceAgentProcessor` no logueaban nada cuando un job
   fallaba** (`@nestjs/bullmq` no lo hace por default), así que los reintentos con backoff (2s, 4s, 8s...)
   pasaban en silencio y parecía que no pasaba nada. Se agregó `@OnWorkerEvent('failed')` a los dos
   processors (loguea `job.id`, el id de la orden/comando, y `error.message`) — repetida la prueba, el
   log mostró exactamente `create_order job N (order ...) failed: Account not found: G...` en cada
   reintento, con el timing esperado del backoff. De paso se le agregó `timeout: 10_000` a `rpc.Server`
   en el constructor de `SorobanService` (el SDK trae `timeout: 0` — sin límite — por default); no era la
   causa de este síntoma puntual, pero sigue siendo una protección razonable contra un RPC realmente
   lento o caído (a diferencia de "cuenta no encontrada", que sí responde rápido).

**Verificación**: los 15 endpoints de las Etapas 1.2 a 1.9 responden con la forma exacta documentada,
status code incluido — **confirmado en runtime real**, no solo en el diseño.

### Etapa 2.4 — Frontend local + WebSocket

**Tareas**: `npm run dev` en `frontend/`; abrir la consola del navegador y conectar manualmente
(`io('http://localhost:3001/notifications?merchantId=<id-del-seed>')`) para confirmar la conexión;
publicar un evento de prueba con `redis-cli PUBLISH merchant:<id>:events '{"event":"order:created","payload":{}}'`.

**Verificación**: el evento llega al cliente conectado (mismo criterio que la Etapa 1.8, ahora contra el
backend corriendo en modo desarrollo completo).

### Etapa 2.5 — ai-service sin modelo real

**Estado**: Completada y verificada — incluyendo `llama-cpp-python`, que en un primer intento **no
compiló** (sin toolchain de C/C++ en este entorno, igual que con `cargo`/`rustc` de Fase 3).

**Verificado**:
1. `python -m venv .venv` + `pip install -r requirements-dev.txt` → falla al construir
   `llama-cpp-python==0.2.90` desde source (`CMake Error: CMAKE_C_COMPILER not set` — no hay Visual
   Studio Build Tools/nmake en este entorno). Se resolvió sin instalar ningún toolchain: el proyecto
   publica wheels precompiladas para CPU en un índice propio —
   `pip install llama-cpp-python==0.2.90 --extra-index-url
   https://abetlen.github.io/llama-cpp-python/whl/cpu` instala el `.whl` directo, sin compilar nada. Vale
   la pena dejarlo como *fallback* documentado para cualquiera que no tenga el toolchain de C++ instalado
   (no hace falta para producción, ahí normalmente sí conviene compilar contra la CPU/GPU exacta del
   servidor, pero para desarrollo local es la vía más simple).
2. **Hallazgo real, corregido**: con las dependencias instaladas, `pytest` fallaba en la *colección* del
   test (ni llegaba a correr) con `ModuleNotFoundError: No module named 'requests'` — `faster-whisper`
   importa `requests` en su propio código (`faster_whisper/utils.py`, para descargar modelos) pero **no
   lo declara como dependencia** en su metadata (`pip show faster-whisper` confirma `Requires: av,
   ctranslate2, huggingface-hub, onnxruntime, tokenizers`, sin `requests`) — es un gap real de paquetado
   de la librería, no algo mal armado en `ai-service`. Se agregó `requests==2.34.2` explícito a
   `requirements.txt` (no solo `-dev`, porque es una dependencia real en runtime, no solo para testear).
3. `pytest` → `1 passed`. `ruff check .` → `All checks passed!`.
4. `uvicorn app.main:app --port 8000` levanta limpio; `GET http://localhost:8000/health` → `200
   {"status":"ok"}` sobre HTTP real, no solo con el `TestClient` de los tests.

**Actualización — `/transcribe` y `/interpret` verificados con Groq (decisión del usuario, "por
mientras")**: en vez de esperar el modelo GGUF de Qwen 3B afinado (que no existe todavía, es un artefacto
aparte) o descargar pesos de Whisper localmente, se decidió usar la API hospedada de Groq para ambos, de
forma temporal/intercambiable:

- `app/config.py`: nuevo `ai_provider: Literal["groq","local"] = "groq"` + `groq_api_key`,
  `groq_llm_model` (`openai/gpt-oss-20b`), `groq_stt_model` (`whisper-large-v3-turbo`). El valor real de
  `GROQ_API_KEY` vive solo en `ai-service/.env` (gitignored), nunca en el repo.
- `app/llm/interpreter.py` y `app/stt/transcriber.py`: `interpret()`/`transcribe()` ahora eligen entre
  `_interpret_groq`/`_interpret_local` (o `_transcribe_groq`/`_transcribe_local`) según `ai_provider`. Los
  imports de `llama_cpp`/`faster_whisper` se movieron a **dentro** de las funciones `_local` (antes eran
  imports a nivel de módulo) — así el servicio arranca y sirve tráfico real sin que esas librerías pesadas
  necesiten estar instaladas/funcionando cuando el proveedor activo es `groq`. El código local queda
  intacto para cuando haya un modelo propio real (de ahí el "por mientras").
- **`llama-3.3-70b-versatile`** (el modelo Groq inicialmente elegido) ya no existe en el catálogo actual
  de Groq — se verificó en vivo contra `GET /openai/v1/models` en vez de asumir un nombre de memoria, y se
  usó `openai/gpt-oss-20b` (disponible, rápido, sigue instrucciones JSON bien) para el LLM y
  `whisper-large-v3-turbo` para STT.
- **Bug real encontrado y corregido en el camino** (no relacionado con Groq en sí, afecta ambos
  proveedores): `routes/transcribe.py` usaba `tempfile.NamedTemporaryFile(delete=True)` y trataba de
  abrir ese mismo archivo *de nuevo* (dentro de `transcribe()`) mientras el primer handle seguía abierto
  — en Windows eso tira `PermissionError: [Errno 13]` (POSIX lo tolera, por eso nunca se había notado).
  Corregido con `delete=False` + cierre explícito + `Path(tmp_path).unlink()` en un `finally`.
- **Verificado con HTTP real contra la API de Groq** (no mockeado): `POST /transcribe` con un `.wav`
  real → `{"transcript": "Cobra 30 doulas por el pedido 52."}` (la transcripción imperfecta es un artefacto
  de la voz de prueba generada por TTS de Windows sin voz en español instalada, no del servicio); `POST
  /interpret` con "Cobra 30 USDC por el pedido 52 y separa 3 USDC de propina para José" →
  `{"intent":"create_order","amount":30.0,"asset":"USDC","order_ref":"52","splits":[{"recipient_alias":
  "José","amount":3.0,"type":"tip"}],"confidence":0.95}` — correcto en los 6 campos, incluyendo identificar
  "propina" como `type: "tip"`.
- `ruff check .` y `pytest` (`1 passed`) siguen verdes tras el cambio.

---

## Fase 3 — Contrato Soroban: build, test y deploy

**Estado: las 5 etapas completas y verificadas contra Stellar Testnet real** (no un entorno simulado) — el
toolchain que parecía bloqueado (Rust/cargo/stellar-cli) se instaló por completo sin admin, el contrato
está desplegado e inicializado en testnet con un `CONTRACT_ID` real, y su ciclo de vida completo
(`set_operator` → `create_order` → `pay`) fue ejercitado de punta a punta con cuentas de testnet reales.

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

**Eventos** — migrados al macro `#[contractevent]` (soroban-sdk 26; `Events::publish` manual quedó
deprecado, ver Etapa 3.2): `OrderCreated { #[topic] order_id, merchant }` (topics estático
`"order_created"`), `OrderPaid { #[topic] order_id, payer, amount }` (topics estático `"order_paid"`),
`OrderCancelled { #[topic] order_id, caller }` (topics estático `"order_cancelled"`). Los topics finales
publicados son `(Symbol("order_created"), order_id)` etc. — igual forma que antes; el *dato* del evento
ahora es un `Map` con nombres de campo (`merchant`, `payer`+`amount`, `caller`) en vez del valor/tupla
cruda que se publicaba a mano.

**Errores** (`#[contracterror]`, `u32`): `1 AlreadyInitialized · 2 NotAuthorized · 3 OrderAlreadyExists ·
4 OrderNotFound · 5 OrderNotPending · 6 InvalidAmount · 7 SplitsExceedAmount`.

Consumido por: `SorobanService` (backend, `infrastructure/stellar/soroban.service.ts`), `OrdersProcessor`
(`create_order`, Etapa 1.5), `PaymentsService` (`pay`, Etapa 1.6), `MerchantsService` (`set_operator`,
Etapa 1.3) — implementados en Fase 1. **`amount`/`Split.amount` son enteros en la unidad mínima del
asset** (7 decimales para USDC/la mayoría de assets Stellar — 30 USDC = `300000000`). El backend
(`OrdersProcessor`, Etapa 1.5) pasaba el monto **sin escalar** (`order.amount.toString()` tal cual, ej.
`"30"`) — bug real encontrado al revisar la doc oficial de Stellar sobre SAC Tokens, **corregido en la
Etapa 3.5**: `SorobanService.toContractAmount(amount, decimals = 7)` hace
`BigInt(Math.round(amount * 10 ** decimals))`, y `OrdersProcessor` lo aplica tanto al `amount` de la
orden como al de cada `Split` antes de encodearlos.

**Documentación oficial revisada para esta fase**: `developers.stellar.org/docs/build/smart-contracts/getting-started/{setup,hello-world,deploy-to-testnet}`,
`.../guides/{testing,testing/unit-tests,conventions}`. Páginas del resto del sitio (Build Applications,
Agentic Payments x402/MPP, Security Best Practices) revisadas y confirmadas **no relevantes** para el
contrato en sí — son contenido de frontend/wallets/templates de riesgo, no tocan `create_order`/`pay`.
Páginas identificadas como relevantes para cuando se optimice el contrato o se integre más a fondo, pero
no leídas todavía en detalle: Contract Storage (`guides/storage`), Contract Events (`guides/events`), SAC
Tokens (`guides/tokens`), State Archival (`guides/archival`), Type Conversions
(`conversions/scval-conversions`).

### Etapa 3.2 — Build y test local

**Estado**: Completada y verificada — toolchain instalado sin permisos de admin, `cargo test` y el build
de producción pasan.

**Toolchain instalado (sin admin, todo user-scope)**:
1. **Rust**: `rustup-init.exe` (descargado directo del sitio oficial, corre en `%USERPROFILE%\.cargo`/
   `.rustup`, no pide admin) — `rustc 1.98.1`, por encima del mínimo oficial (`1.84.0+`).
2. **Toolchain MSVC de rustup instala pero no compila nada**: sin Visual Studio Build Tools no hay
   `link.exe` funcional — cualquier crate con `build.rs` (`serde`, `proc-macro2`, `thiserror`, ...) falla
   al linkear. Encontré una instalación vieja de `TDM-GCC-64` ya en el PATH, pero es incompatible con el
   target GNU de Rust (`ld.exe: cannot find -lgcc_eh` — mismatch de layout de mingw-w64). Se resolvió
   bajando un mingw-w64 moderno standalone (zip, sin instalador) de
   [winlibs.com/brechtsanders](https://github.com/brechtsanders/winlibs_mingw) (build `msvcrt`, no
   `ucrt` — es lo que el target `x86_64-pc-windows-gnu` de Rust espera) y poniéndolo primero en el PATH.
   `rustup toolchain install stable-x86_64-pc-windows-gnu` + `rustup default
   stable-x86_64-pc-windows-gnu`.
3. **Targets wasm**: `rustup target add wasm32v1-none` — este es el target correcto según la doc oficial
   actual (no `wasm32-unknown-unknown`, que es el que se usaba en versiones viejas de soroban-sdk/docs).
4. **`stellar-cli`**: `winget install --id Stellar.StellarCLI --version 28.0.0` — sin admin (el binario
   queda en `C:\Program Files (x86)\Stellar CLI\stellar.exe`, no en el PATH por default, hay que
   agregarlo a mano en cada sesión de shell).
5. **`soroban-sdk`: `"21.7.4"` → `"26"`** en `contracts/voxpay/Cargo.toml` (`[dependencies]` y
   `[dev-dependencies]`). La 21.x más nueva disponible (21.7.7, ya la que se resolvía) tenía un conflicto
   de dependencias transitivas real dentro del propio SDK: `soroban-env-host` 21.2.1 jala simultáneamente
   `ed25519-dalek` 2.x (vía `soroban-sdk` directo) y 3.x (vía otra ruta), y esas dos versiones son
   incompatibles entre sí para `ChaCha20Rng` en el código de `testutils` — `cargo test` fallaba en
   compilación con `E0277` antes de llegar a correr nada. Confirmado con `cargo tree -i` que **no hay
   patch dentro de 21.x que lo arregle** (21.7.7 ya es el último). Se subió a `"26"` — no la más nueva
   (28.x) sino la que usa el scaffold oficial actual (`stellar contract init` genera `soroban-sdk = "26"`
   como dependencia de workspace) — arregla el conflicto sin el riesgo de saltar 7 versiones mayores.
6. **`[lib] crate-type`**: `["cdylib", "rlib"]` → **`["rlib"]`**. Con `cdylib` en la lista, `cargo test`
   en Windows-GNU intenta linkear un `.dll` para el host (no solo el `.wasm`), y el árbol de dependencias
   cripto de `soroban-env-host` (curve25519-dalek, ark-bn254, ark-bls12-381, k256, p256...) genera más
   símbolos exportados de los que el formato de tabla de exports de una DLL PE puede indexar (`ld.exe:
   error: export ordinal too large: 75347`). Sacar `cdylib` del manifiesto resuelve esto porque
   `stellar contract build` (ver abajo) no depende de lo que declare el `Cargo.toml` para producir el
   `.wasm` — pasa `--crate-type=cdylib` como override explícito en su propio comando `cargo rustc`.
7. **`[profile.release]`**: sin cambios — ya estaba en `contracts/Cargo.toml` (raíz del workspace, Etapa
   1) y coincide *exactamente* con lo que genera el scaffold oficial (`opt-level="z"`, `strip="symbols"`,
   `lto=true`, `panic="abort"`, etc.).
8. **Eventos migrados a `#[contractevent]`** (ver Etapa 3.1) — los `.publish()` manuales estaban
   deprecados en soroban-sdk 26 (warning, no error, pero se corrigió).

**Comandos verificados**:
- `cargo test` (desde `contracts/voxpay/`) → **2/2 tests pasan** (`create_and_pay_order_splits_funds`,
  `cancel_order_marks_cancelled`), sin warnings.
- `stellar contract build --package voxpay` (desde `contracts/`) → **build correcto**. El flag
  `--package voxpay` es obligatorio: sin él, `stellar contract build` auto-descubre paquetes buscando
  `cdylib` en `[lib] crate-type` del `Cargo.toml` — como se sacó en el punto 6, sin `--package` no
  encuentra nada que construir y **termina con éxito silencioso sin generar el `.wasm`** (ni error, ni
  archivo — hay que fijarse en el timestamp del `.wasm` para notar que no se regeneró). Con `--package`
  explícito construye igual, pasando `--crate-type=cdylib` por su cuenta.
- Wasm final: `contracts/target/wasm32v1-none/release/voxpay.wasm`, **7383 bytes**, 6 funciones
  exportadas confirmadas (`cancel_order, create_order, get_order, init, pay, set_operator`).

**Verificación**: `cargo test` y `stellar contract build --package voxpay` verdes — **confirmado**.

### Etapa 3.3 — Deploy a testnet

**Estado**: Completada y verificada contra Stellar Testnet real (no una suposición ni un entorno de
prueba).

**Ejecutado**:
1. `stellar keys generate admin --network testnet --fund` → cuenta fondeada por friendbot. Public key:
   `GCPMTSFY3VZVHF5HP6XPLJ6JQP3O4J3KT2WJL3HYJI7R6TAMMC3PRVYO`.
2. `stellar contract deploy --wasm target/wasm32v1-none/release/voxpay.wasm --source-account admin
   --network testnet --alias voxpay` → **`CONTRACT_ID = CBFO53O3IHNMHCPAGJZXZMN2SOHA3BRKAJHAIRVNFKPZZD4E44BNX57Q`**
   ([tx en stellar.expert](https://stellar.expert/explorer/testnet/tx/ab5390907ee284625668ce12cf626dbb74aa2d3a0fb484585d2e33826dbd3946)).
   Nota: el flag es `--source-account` (no `--source`, que usaba una versión vieja del CLI en el plan
   original).
3. **Token USDC de testnet**: no se adivinó — se buscó el USDC con más actividad real en testnet vía la
   API pública de Stellar Expert (`api.stellar.expert/explorer/testnet/asset?search=USDC&sort=rating`),
   que devuelve el asset con más trustlines/confianza primero. Resultado: issuer
   `GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5`, SAC
   `CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA` (72,650 trustlines, la opción con más
   diferencia sobre el resto — es la que efectivamente se usa como "la" USDC de testnet en el
   ecosistema).
4. `stellar contract invoke --id CBFO53O3IHNMHCPAGJZXZMN2SOHA3BRKAJHAIRVNFKPZZD4E44BNX57Q --source-account
   admin --network testnet --send=yes -- init --admin GCPMTSFY3VZVHF5HP6XPLJ6JQP3O4J3KT2WJL3HYJI7R6TAMMC3PRVYO
   --token CBIELTK6YBZJU5UP2WWQEUCYKLPU6AUNZ2BQ4WWFEIE3USCIHMXQDAMA` → **transacción confirmada**.

**Verificación**: `stellar contract invoke --id <CONTRACT_ID> --source-account admin --network testnet --
get_order --order_id test-123` → responde `HostError: Error(Contract, #4)` = **`Error::OrderNotFound`
exacto del enum del contrato** (no un error de red/RPC) — **confirmado, el contrato está vivo,
inicializado y funcionando en testnet real**.

**Valores reales para `backend/.env`** (reemplazan los inventados de la Etapa 2.1):
```
STELLAR_CONTRACT_ID=CBFO53O3IHNMHCPAGJZXZMN2SOHA3BRKAJHAIRVNFKPZZD4E44BNX57Q
```
`STELLAR_OPERATOR_SECRET` todavía necesita una identidad **autorizada como operator vía `set_operator`**
por algún merchant — el `admin` de arriba no es automáticamente operator de nadie. Eso es trabajo de la
Etapa 3.5.

### Etapa 3.4 — Bindings TypeScript

**Estado**: Completada y verificada contra Stellar Testnet real.

**Ejecutado**:
1. `stellar contract bindings typescript --contract-id ... --network testnet --output-dir ...` falla en
   este entorno Windows con `os error 32` (`El proceso no tiene acceso al archivo porque está siendo
   utilizado por otro proceso`) — determinístico, no transitorio, incluso apuntando a un directorio
   vacío recién creado bajo `AppData/Local/Temp`, tanto con `--contract-id` (descarga el spec desde la
   red) como al primer intento con `--overwrite` sobre un directorio ya existente. Aislado el punto de
   falla: generar hacia un directorio **nunca antes creado** (nunca usado con `--overwrite`) funciona
   siempre; reusar un directorio (incluso vacío) dispara el error de forma consistente — parece un bug
   del CLI en Windows al recrear/limpiar un directorio de salida existente, no un problema de red ni de
   antivirus. Workaround: generar siempre hacia una carpeta nueva (`--wasm
   contracts/target/wasm32v1-none/release/voxpay.wasm` en vez de `--contract-id`, para no depender de
   que la red esté disponible) y mover el resultado a mano.
2. El comando genera un paquete npm standalone completo (`package.json`, `src/index.ts`, `tsconfig.json`)
   pensado para instalarse como dependencia aparte. Como `backend/` no usa un monorepo de paquetes, se
   tomó solo el contenido relevante de `src/index.ts` (el spec del contrato embebido en XDR base64 + la
   clase `Client`) y se adaptó a mano en `backend/src/infrastructure/stellar/bindings/index.ts`: se
   extrajo el array de entradas del spec a una constante exportada `CONTRACT_SPEC_ENTRIES` (en vez de
   quedar hardcodeado solo dentro del constructor de `Client`), para que `SorobanService` (Etapa 1.4)
   pueda construir su propio `Spec` sin instanciar un `Client` completo. El `.gitkeep` original de la
   carpeta se eliminó.
3. **Decisión de integración** (la pregunta que dejaba abierta esta etapa): en vez de migrar
   `OrdersProcessor`/`PaymentsService`/`MerchantsService` a usar la clase `Client` generada completa (que
   asume un flujo propio de simulate→sign→send vía `AssembledTransaction`, distinto del split
   operator-firma/cliente-firma-XDR-sin-firmar que ya tenía `SorobanService`), se refactorizó
   `SorobanService` para usar solo `Spec.funcArgsToScVals(method, args)` /
   `Spec.funcResToNative(method, retval)` — la misma clase que usa el `Client` generado por debajo, pero
   sin cambiar el flujo de firma ya existente. Esto reemplaza los helpers manuales `addressArg`/
   `i128Arg`/`stringArg` (que armaban `xdr.ScVal` a mano) por argumentos nombrados en JS plano (ej.
   `{merchant, operator}`) que el spec real del contrato valida y encodea — si un nombre de campo no
   existe en el contrato, `funcArgsToScVals` tira error inmediato en vez de fallar en silencio o mandar
   el tipo equivocado.
4. **Hallazgo relevante para el bug potencial que motivaba esta etapa**: se confirmó leyendo el código
   fuente de `@stellar/stellar-base` (`lib/scval.js`) que `nativeToScVal` sobre un objeto plano **sí**
   ordena las keys alfabéticamente antes de armar el `ScMap` ("The Soroban runtime expects maps to have
   their keys in sorted order"). Es decir, el encoding manual que tenía `OrdersProcessor` antes de esta
   etapa (`{recipient, amount}`, en ese orden en el código) ya producía el orden correcto
   (`amount` antes de `recipient`, que es el orden alfabético que espera el `Struct` de Soroban) — **no
   era un bug latente**, pero tampoco estaba validado contra el contrato real ni documentado por qué
   funcionaba. El cambio a `funcArgsToScVals` (punto 3) lo vuelve explícito y a prueba de que el
   contrato cambie de forma en el futuro.
5. **Verificación real** (no solo lectura de código): Etapa 3.5 más abajo ejecuta `create_order` de punta
   a punta contra el contrato desplegado usando este nuevo encoding — `get_order` on-chain devuelve el
   `Vec<Split>` decodeado exactamente igual a como se envió (`amount`/`recipient` correctos), confirmando
   el encoding en la práctica, no solo por lectura de código fuente del SDK.

**Verificación**: `npm run build`, `npm run lint` (con una excepción agregada en `.oxlintrc.json` para
`typescript/no-unsafe-declaration-merging` en `bindings/*.ts` — el patrón `interface Client` + `class
Client` es el que genera el propio CLI oficial de Stellar, no un error de diseño propio) y los 10 tests
unitarios, todos verdes tras el refactor. Verificación on-chain real: ver Etapa 3.5.

### Etapa 3.5 — Integración con el backend

**Estado**: Completada y verificada de punta a punta contra Stellar Testnet real — `set_operator`,
`create_order` y `pay` los tres ejecutados on-chain con éxito, no solo simulados.

**Ejecutado**:
1. **Escalar `amount` a la unidad mínima del asset** (bug real encontrado en Fase 3): `OrdersProcessor`
   pasaba el monto *tal cual* (ej. `"30"` para 30 USDC) — el contrato lo interpretaba como `30` unidades
   mínimas (`0.0000030` USDC), no como `30` USDC. Corregido con
   `SorobanService.toContractAmount(amount: number, decimals = 7): bigint`
   (`BigInt(Math.round(amount * 10 ** decimals))`), aplicado tanto al `amount` de la orden como al de
   cada `Split`.
2. `STELLAR_CONTRACT_ID` real cargado en `backend/.env`
   (`CBFO53O3IHNMHCPAGJZXZMN2SOHA3BRKAJHAIRVNFKPZZD4E44BNX57Q`, Etapa 3.3). Se generaron 3 identidades de
   testnet nuevas y fondeadas por friendbot vía `stellar keys generate {merchant,operator,customer}
   --network testnet --fund`: `merchant` (comerciante de prueba), `operator` (pasa a
   `STELLAR_OPERATOR_SECRET`) y `customer` (paga la orden). Ninguna tiene valor real — son cuentas de
   testnet descartables.
3. **`set_operator` real**: `stellar contract invoke ... --source-account merchant -- set_operator
   --merchant <merchant> --operator <operator>` → transacción confirmada on-chain, autorizando a
   `operator` a crear órdenes en nombre de `merchant`.
4. **`create_order` real vía el flujo completo del backend** (no invocado directo por CLI): se apuntó el
   merchant sembrado en Firestore (Etapa 2.2) a la dirección real de `merchant` con
   `operatorAuthorized: true`, se insertó un `voiceCommand` con intent `create_order` (30 USDC, split de
   3 USDC para "José") y se confirmó vía `POST /v1/voice/commands/:id/confirm` — el mismo camino que
   usaría Raven en producción. El worker (`OrdersProcessor`) tomó el job de la cola `orders` y llamó
   `SorobanService.invokeAsOperator('create_order', ...)` con la cuenta `operator` real. Resultado:
   transacción confirmada (`successful: true` en Horizon), y `stellar contract invoke -- get_order
   --order_id <ref>` devuelve exactamente `{"amount":"300000000", "merchant":"GAFKJZ...",
   "splits":[{"amount":"30000000","recipient":"GDBMN..."}], "status":"Pending"}` — confirma en un solo
   paso que el escalado decimal (punto 1) y el encoding de `Vec<Split>` (Etapa 3.4) son correctos contra
   el contrato real, no solo en teoría.
5. **USDC real de testnet, sin depender de un faucet externo**: en vez de un faucet (Circle u otro, que
   requieren UI/CAPTCHA), se creó trustline (`stellar tx new change-trust --line
   "USDC:GBBD47IF6LWK7P7MDEVSCWR7DPUWV3NY3DTQEVFL4NAT4AQH3ZLLFLA5"`) para `customer` y `merchant`, y se
   consultó el order book real del DEX de testnet (`GET /order_book` de Horizon) para ese par — **sí hay
   liquididez real** (mejor bid ~0.108 USDC/XLM, profundidad >60k XLM). Se usó `stellar tx new
   path-payment-strict-send` desde `customer` hacia sí mismo (vendiendo XLM, comprando USDC) para
   convertir parte de su balance de friendbot (solo XLM) en ~418 USDC reales de testnet.
6. **`pay` real vía el flujo completo del backend**: `POST /v1/public/orders/:id/tx` (con
   `payerPublicKey` = `customer`) → firmar el XDR devuelto con la clave de `customer`
   (`@stellar/stellar-sdk`, `Keypair.fromSecret` + `Transaction.sign`) → `POST
   /v1/public/orders/:id/submit`. **Encontrado y corregido en el camino**: el primer intento falló con
   `txTooLate` (el XDR se firma con una ventana de 30s desde que el backend lo arma —
   `TransactionBuilder.setTimeout(30)` — y el paso manual de copiar/pegar entre comandos de shell excedió
   esa ventana; no es un bug de código, es una limitación de probar el flujo a mano en vez de con un
   wallet real firmando al instante). Resuelto armando un script único que hace fetch→firma→submit sin
   pausas intermedias. Resultado: `{"hash": "ada42a07..."}`, transacción confirmada en Horizon
   (`successful: true`), `get_order` on-chain pasa a `"status":"Paid"`, y el balance USDC de `merchant`
   sube a exactamente `27.0000000` (30 menos los 3 de split para José) — el split se ejecutó
   correctamente. `GET /v1/orders/:id` en el backend confirma `status: "PAID"` con `payTxHash` seteado.

**Verificación**: flujo real, no simulado, de punta a punta: `set_operator` → `create_order` (vía
Firestore + BullMQ + worker real) → `pay` (vía los endpoints públicos reales, firmado con una wallet de
verdad) → estado `Paid` on-chain y `PAID` en Firestore → balance del comerciante refleja el split
correcto. Los 3 hashes de transacción (`set_operator`, `create_order`, `pay`) son reales y verificables en
`stellar.expert/explorer/testnet`. Ningún dato de esta verificación (claves, IDs de Firestore de prueba)
quedó en el código — los scripts ad-hoc usados para armarla se descartaron; solo `backend/scripts/seed.ts`
es parte permanente del repo.

---

## Fase 4 — Frontend: conectar con la API real

Cada etapa conecta una parte del frontend con los contratos de la Fase 1. Se divide en 6 etapas.

**Actualización — el frontend real diverge de este plan**: Guillermo implementó el frontend completo
en su propia rama (`guillermo/frontend`, mergeada a `main`) sin seguir estas etapas línea por línea —
las tareas de abajo quedan como referencia histórica del diseño original, no como lo que hay que
ejecutar. Diferencias reales importantes:

- **Auth**: no es `POST /v1/auth/login` + cookie manual (Etapa 4.2) — es **Firebase Auth** (email/password
  y Google, `frontend/src/lib/firebase.ts` + `login-form.tsx`). El ID token de Firebase se manda como
  `voxpay_session` (cookie httpOnly) y se reenvía tal cual al backend vía un proxy interno
  (`frontend/src/app/api/backend/[...path]/route.ts`) que distingue un JWT propio de un Firebase ID token
  decodificando el `iss` del payload.
- **Backend, bridge agregado**: el backend original solo entendía sus propios JWT (`passport-jwt`). Se
  reescribió `AuthService.resolveUser(token)` (`backend/src/modules/auth/auth.service.ts`) para aceptar
  ambos: si es un Firebase ID token, lo verifica con `getAuth().verifyIdToken()` (`firebase-admin/auth`,
  ya usado para Firestore) y, la primera vez que ve un `firebaseUid` nuevo, **auto-provisiona** tenant +
  user + merchant (patrón de onboarding self-serve — el merchant arranca con un keypair de Stellar al
  azar como placeholder, igual que `scripts/seed.ts`, hasta que el dueño conecte su wallet real).
  `JwtAuthGuard` y `NotificationsGateway.handleConnection` pasaron a usar este método único; se sacó
  `passport`/`passport-jwt`/`@nestjs/passport` del todo (quedaron sin uso). Requiere que
  `FIREBASE_PROJECT_ID` (backend) y `NEXT_PUBLIC_FIREBASE_PROJECT_ID` (frontend) sean el mismo valor —
  si no, `verifyIdToken` rechaza el token por `aud` inválido. **Bug real encontrado y corregido en el
  camino**: `FIREBASE_AUTH_EMULATOR_HOST` faltaba en el schema de `env.validation.ts` (zod) — `@nestjs/
  config` igual lo dejaba en `process.env`, pero sin declararlo ahí no había garantía; se agregó como
  opcional junto a `FIRESTORE_EMULATOR_HOST`.
- **Gap conocido, no corregido todavía**: `frontend/src/lib/socket.ts` conecta el WebSocket de
  notificaciones sin mandar ningún token (`connectNotifications` no setea `socket.auth`), así que
  `NotificationsGateway.handleConnection` siempre lo desconecta por falta de credencial — el banner
  "Conectando notificaciones" del POS se queda pegado. El fix es del lado del frontend (pasar
  `auth: { token: await currentUser.getIdToken() }` antes de `socket.connect()` en `pos-view.tsx` /
  `dashboard-view.tsx`), fuera del alcance de "que el backend reconozca Firebase" — pendiente de decisión.
- **Verificado con Playwright real** (no solo el código): registro por Firebase → `/pos` sin el banner de
  "cuenta no vinculada" → `/dashboard` trae datos reales (`0.00 USDC`, `0 pedidos`, merchant recién
  provisionado) → 4/4 tests e2e del backend (login propio, no-Firebase) siguen pasando.

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

**Estado**: Completada para los 3 servicios previstos. `npm run test` (`vitest run`) → **10/10 tests
verdes**, sin necesidad de Firestore/Redis reales (todo mockeado a mano, sin `TestingModule` de Nest —
las clases son constructor-injected simples, se instancian directo con mocks).

**Implementado**:
- `src/modules/orders/orders.service.spec.ts` — `OrdersService.createFromIntent`: alias de recipient
  desconocido → `BadRequestException('Unknown recipient alias: ...')`; splits que superan el monto →
  `BadRequestException('Splits exceed order amount')`; caso feliz → resuelve el alias vía
  `RecipientsRepository.findByAlias` mockeado, llama `OrdersRepository.create` con los splits resueltos
  (`stellarAddress` incluido), encola `create_order` en la queue mockeada con `{orderId}`.
- `src/modules/payments/payments.service.spec.ts` — `PaymentsService.submitPayment`: orden inexistente →
  `NotFoundException`, sin llamar a Soroban ni a notifications; caso feliz → `SorobanService
  .submitSignedXdr` mockeado devuelve `{hash}`, se verifica `OrdersRepository.update(id, {status:'PAID',
  payTxHash:hash})` y `NotificationsPublisher.publish(merchantId, 'order:paid', {...})`.
- `src/modules/voice-agent/voice-agent.service.spec.ts` — `VoiceAgentService.confirm`: comando
  inexistente y comando de otro merchant → ambos `NotFoundException` (mismo mensaje, no filtra
  información); intent no `create_order` o sin `order_ref`/`amount` → `BadRequestException`; caso feliz →
  mapea `intentJson` (snake_case) a `CreateOrderDto`, llama `OrdersService.createFromIntent`, marca el
  comando `CONFIRMED`. El mock de Firestore es un `db.collection().doc()` con `get`/`update` en
  `vi.fn()`, sin instanciar `FirestoreService` real.
- `.oxlintrc.json`: agregado un `overrides` para `*.spec.ts` que apaga `typescript/unbound-method` —
  sin eso, referenciar `mock.metodo` en un `expect(...).toHaveBeenCalledWith(...)` tira warning (patrón
  esperado de testing, no un bug real).
- `backend/package.json`: `tsx` y `dotenv` agregados como devDependencies (los necesita también el seed
  de la Etapa 2.2).

**Pendiente**: cobertura de `RecipientsService` (conflicto de alias) y `MerchantsService`/`AuthService`
si se quiere ampliar más allá de los 3 servicios que pedía el plan original.

### Etapa 5.2 — E2E backend

**Estado**: Completada y verificada — `backend/test/voice-to-order.e2e-spec.ts`, **4/4 tests pasan**
contra el emulador de Firestore y Redis reales (no mocks), levantando la `AppModule` completa vía
`Test.createTestingModule` + `supertest`, igual que haría `main.ts`.

**Implementado**:
1. `beforeAll` siembra directo en Firestore (vía `FirestoreService` resuelto del `TestingModule`, sin
   pasar por la API): un tenant, un user, un merchant, y el recipient "José" — mismo patrón que
   `scripts/seed.ts` (Etapa 2.2) pero acotado a este test.
2. **Caso feliz**: login → inserta un `voiceCommand` con intent ya resuelto (simula lo que dejaría Raven,
   igual que la prueba manual de la Etapa 2.3) → `POST .../confirm` → `201`, verifica que
   `splitsJson` tiene el `stellarAddress` de "José" ya resuelto → `GET /v1/orders/:id` de vuelta → `200`,
   mismo id.
3. **Comando de otro merchant** → `confirm` da `404` (no filtra si existe o no pertenece a otro).
4. **Ruta protegida sin token** → `401`.
5. **Ruta pública sin token** → sigue respondiendo normal (`404` por id inexistente, no `401`) — cubre en
   un test real el fix crítico de `TenantGuard`/`@Public()` de la Etapa 1.10.

**Nota de diseño**: el test comparte el mismo emulador/Redis que cualquier proceso de desarrollo que esté
corriendo en paralelo (API/worker de la Etapa 2.3) — no hay aislamiento de base de datos por corrida
todavía. Para CI (Etapa 5.4) conviene o resetear el emulador entre corridas (`DELETE
http://localhost:8080/emulator/v1/projects/<project>/databases/(default)/documents`) o levantar un
proyecto de emulador distinto por job.

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
