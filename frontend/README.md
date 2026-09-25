# VoxPay — frontend

Next.js App Router + React + TypeScript. Implementación responsive del MVP: login, POS por voz, QR, pago del cliente, pedidos, destinatarios, dashboard y wallet del negocio.

## Ejecutar

Desde `frontend/`, con Node.js 22 y npm:

```powershell
npm ci
Copy-Item .env.example .env.local
npm run dev
```

Abre [localhost:3000](http://localhost:3000). El backend debe estar disponible en 3001 y tener un negocio/usuario creados según el plan. No hay credenciales de demostración en la aplicación.

- `API_URL`: backend accesible desde el servidor Next.js.
- `NEXT_PUBLIC_API_URL`: backend accesible desde el navegador para Socket.IO. En un teléfono no debe apuntar a localhost del teléfono.
- La wallet usa **Stellar Testnet** explícitamente. `NEXT_PUBLIC_NETWORK` documenta esa configuración; cambiarla no habilita otras redes.
- La grabación requiere HTTPS o localhost, permiso de micrófono y MediaRecorder. Para probar desde un teléfono, sirve la aplicación por HTTPS.
- `npm run build` y `npm start` necesitan un servidor Node.js, no exportación estática. En producción la cookie requiere HTTPS. Poppins se descarga durante el build mediante next/font.

## Pantallas

| Ruta          | Implementado                                                                                                           |
| ------------- | ---------------------------------------------------------------------------------------------------------------------- |
| /login        | Validación, mostrar contraseña, error de credenciales y sesión vencida.                                                |
| /pos          | Grabación real de hasta 60 s/12 MB, transcripción por eventos, revisión del reparto, confirmación explícita y QR real. |
| /pos?order=ID | Recuperación del QR y seguimiento de pago/cancelación.                                                                 |
| /pay/ID       | Acceso público, Freighter/xBull, verificación de cuenta/red, revisión, firma, envío y seguimiento.                     |
| /orders       | Búsqueda, filtros, tabla/cards y estados vacíos/error.                                                                 |
| /orders/ID    | Importe, reparto, estado, acceso al QR y enlaces a transacciones.                                                      |
| /recipients   | Crear, editar, eliminar con confirmación, alias duplicados y validación de dirección Stellar.                          |
| /dashboard    | Total y cantidad de pagos del día UTC; conserva el último resumen ante errores.                                        |
| /wallet       | Conectar la cuenta del negocio y firmar la autorización del operador.                                                  |

Textos y componentes compartidos entre desktop y móvil. Botones de acción de 38 px en desktop, ampliados en móvil. Paleta, tipografía y recursos proceden del [archivo Figma](https://www.figma.com/design/RbYkpWZYOauyyjB2g6Oks7/VoxPay-Stellar?node-id=11-140).

## Integración

El navegador llama a `/api/backend/...`. Este Route Handler permite solo las rutas utilizadas, verifica el origen de las escrituras, envía el JWT al backend y guarda una cookie HttpOnly, SameSite=Lax, Secure en producción. No guarda el JWT en localStorage ni lo expone al JavaScript. El backend debe validar JWT y permisos; proxy.ts solo protege la navegación de forma preliminar.

Una respuesta incierta al confirmar un cobro o enviar una transacción no provoca reenvío automático. El QR contiene /pay/ID del origen actual. La interfaz consulta el estado del backend; no considera el clic o la firma como pago confirmado. Nunca solicita claves privadas.

Los tipos usados están en `src/types/domain.ts`, contrastados con backend y plan. `src/types/api.ts` es el scaffold anterior: falta generar OpenAPI cuando los contratos estén completos.

## Pendientes para coordinar con José

No se ha modificado el backend. Estos puntos impiden considerar terminada la integración end-to-end:

1. **Listado:** falta GET /v1/orders. La UI espera Order[] del merchant autenticado (campos en domain.ts). Si responde 404 muestra su ausencia, no datos inventados.
2. **Dashboard:** falta GET /v1/analytics/today con { totalAmount, count, from, to }, según el plan.
3. **Voz:** completar/conectar el processor con Raven y emitir voice:confirmation con { commandId, transcript, intent, status? }. La UI acepta order_ref/recipient_alias y camelCase para mostrar la intención; el backend debe almacenar el formato que espera su confirmación. Para recuperar una interpretación tras desconexión conviene un endpoint de estado por commandId.
4. **WebSocket:** el gateway acepta merchantId sin autenticar. Debe validar la sesión y restringir la sala al tenant. La UI conserva ese contrato actual, pero no lo hace seguro. Antes de producción hay que acordar autenticación compatible con la cookie HttpOnly, por ejemplo una credencial efímera emitida por el servidor; no exponer el JWT permanente.
5. **Aislamiento:** GET /v1/orders/:id debe validar el tenant en el servidor. Las comprobaciones visuales no sustituyen ese control.
6. **Confirmación Stellar:** SorobanService.submit devuelve el hash de sendTransaction sin esperar éxito final. Los servicios pueden marcar PAID/operador autorizado o guardar createTxHash demasiado pronto. El backend debe consultar el resultado final y validar que el XDR firmado corresponde al pedido/operación esperados antes de actualizar estados. También necesita idempotencia en confirmaciones y envíos.
7. **Infraestructura:** completar deploy/configuración del contrato, seed, workers, Redis/Postgres y verificar el flujo con wallets y fondos de prueba reales. Las pruebas del frontend no validan Soroban.

No se añadieron registro, recuperación de contraseña, login Google ni cancelación de pedidos porque la API no ofrece esos contratos. Son ausencias deliberadas, no botones que aparenten funcionar.

## Verificación

```powershell
npm run lint
npm run typecheck
npm run build
npx playwright install chromium
npm run test:e2e
```

Playwright levanta una API **exclusivamente de prueba** en 3101 y Next.js en 3100; ambos puertos deben estar libres. No usa ni modifica datos del backend real. Los fixtures de tests/mock-api.mjs no se importan desde la aplicación.

Las pruebas cubren validación, login/cookie/logout, destinatarios CRUD, filtros/detalle, métricas, voz→confirmación→QR→pago notificado, errores, navegación responsive y protección de la pasarela. Capturas en test-results/ para revisión visual. La voz usa un dispositivo de audio simulado de Chromium; la firma con extensión y el pago on-chain requieren prueba manual en Testnet.

Checklist manual pendiente: Freighter/xBull, red incorrecta, cambio de cuenta, rechazo de firma, saldo insuficiente, RPC caído, confirmación final on-chain y escaneo desde teléfono.

La auditoría de dependencias del 25/09/2026 reportó 19 avisos (13 bajos, 6 moderados; ninguno alto/crítico), principalmente transitivos del kit de wallets. No se aplicó npm audit fix --force, que propone una versión incompatible. Revisarlos antes de publicar.
