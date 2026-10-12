# VoxPay — frontend v2

Next.js App Router, React y TypeScript. Nueva interfaz basada en el [diseño aprobado de VoxPay](https://www.figma.com/design/RbYkpWZYOauyyjB2g6Oks7/VoxPay-Stellar), con el logotipo cacao/turquesa, Voxi y versiones desktop/móvil.

## Ejecutar

Desde esta carpeta, con Node.js 22 y npm:

```powershell
npm ci
# Solo si todavía no existe .env.local:
Copy-Item .env.example .env.local
npm run dev
```

Abre [localhost:3000](http://localhost:3000). Configura las variables de tu proyecto en .env.local; no reemplaces una configuración existente.

- API_URL: backend accesible desde el servidor Next.js.
- NEXT_PUBLIC_API_URL: URL del backend para Socket.IO en el navegador. Desde un teléfono debe ser una dirección accesible, no localhost del teléfono.
- NEXT*PUBLIC_FIREBASE*\*: configuración web del proyecto Firebase, necesaria para correo/contraseña, registro, Google y recuperación de acceso. La cookie de sesión se valida con Firebase Admin en el servidor.
- Para usar Firebase Auth Emulator, configura las dos variables de emulador de .env.example. Déjalas sin definir para usar Firebase real.
- NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: proyecto Reown para wallets móviles. Freighter y xBull conservan su selector existente.
- La wallet usa Stellar Testnet. Cambiar NEXT_PUBLIC_NETWORK por sí solo no habilita otra red.
- El micrófono requiere HTTPS o localhost y un navegador con MediaRecorder.
- La compilación utiliza next/font para Poppins. El despliegue requiere un servidor Node.js; la sesión usa HTTPS en producción.

El acceso requiere la configuración Firebase y una API de VoxPay disponible. Firebase se inicializa al usar sus funciones, por lo que la comprobación de compilación en GitHub no necesita tu archivo .env.local. Para desplegar, configura NEXT_PUBLIC_* antes de npm run build y API_URL en el servidor.

## Diseño y comportamiento

| Ruta                 | Interfaz y funcionalidad existente                                                                |
| -------------------- | ------------------------------------------------------------------------------------------------- |
| /login               | Bienvenida con Voxi, acceso Firebase por correo o Google, recordarme y mostrar contraseña.        |
| /register            | Registro Firebase por correo o Google y validación de contraseñas.                                |
| /forgot-password     | Envío del enlace de recuperación mediante Firebase.                                               |
| /pos                 | Voxi según el estado, ejemplos, grabación real, interpretación, reparto y confirmación explícita. |
| /pos?order=ID        | QR real, copiar enlace y seguimiento del estado del pedido.                                       |
| /pay/ID              | Acceso público, conexión de wallet, revisión, firma y envío del pago.                             |
| /orders y /orders/ID | Búsqueda, filtros, detalle, reparto y acceso al QR. Voxi acompaña estados vacíos y errores.       |
| /dashboard           | Total y cantidad de pagos del día UTC; conserva el último resumen ante errores.                   |
| /recipients          | Crear, editar y eliminar contactos, validar alias y direcciones Stellar.                          |
| /wallet              | Registrar o cambiar la wallet del negocio, autorizar al operador, configurar el % de reserva automática para SUNAT, ver el saldo reservado, retirarlo y consultar el historial de retiros. |

Desktop utiliza navegación lateral; móvil, menú desplegable. Los componentes y estados comparten los mismos tokens de color. El micrófono conserva su control visible junto a Voxi. La transcripción se muestra cuando llega la interpretación del servicio, sin simular texto en tiempo real.

Nuevo cobro utiliza un contenedor centrado de hasta 1120 px y cards sin altura mínima forzada. Voxi, los títulos y los espacios se ajustan al tamaño de pantalla; en desktop bajo, los pasos comparten la fila del encabezado. La revisión móvil utiliza una ilustración pequeña junto al título y mantiene confirmar y editar juntos. Los avisos, ejemplos y repartos largos pueden aumentar la altura de la página sin recortar información ni controles.

La paleta está centralizada en src/app/globals.css: turquesa primario #2C8A9D, fondos blancos #FFFFFF, paneles y cabeceras celestes #E8F3F6, bordes #CCE3E9 y títulos cacao #3E2B24. Las cards, formularios y paneles interiores comparten el radio de 12 px definido por --radius; los indicadores circulares conservan su forma. Las imágenes originales aprobadas están en public/brand/v2 y las poses se asignan en src/components/voxi.tsx. Next Image entrega versiones optimizadas; no se utilizan URLs temporales de Figma en la aplicación.

El logotipo actual es public/brand/v2/voxpay-logo-transparent.png, copia del PNG transparente entregado por el equipo. El componente Brand lo comparte entre login, registro, recuperación, pantallas del negocio y pago del cliente. Las poses de Voxi y los fondos decorativos siguen en la misma carpeta de assets.

El favicon usa el isotipo circular proporcionado por el equipo: public/brand/v2/voxpay-icon.png (512 × 512) y src/app/favicon.ico (16–256 px). El manifest comparte este icono y el enlace del navegador incluye su versión para actualizar la caché.

## Compatibilidad con la API

Esta versión cambia el frontend y conserva los contratos de la versión existente. El navegador llama a /api/backend; la pasarela de Next permite las rutas utilizadas, verifica el origen de las escrituras y envía la cookie HttpOnly al backend. El registro y el cambio posterior de wallet usan el mismo PATCH /v1/merchants/wallet. Si la API responde explícitamente que esa ruta PATCH no existe, la pasarela utiliza POST en la misma ruta, compatible con la API publicada. Conserva la autenticación y el cuerpo stellarAddress; no reintenta errores de validación, permisos ni operaciones fallidas. La reserva automática para SUNAT usa PATCH /v1/merchants/reserve (configurar %), GET /v1/merchants/reserve/balance, POST /v1/merchants/reserve/withdraw/(tx|submit) y GET /v1/merchants/reserve/withdrawals (historial).

No se modificaron servicios, contratos Stellar ni datos del backend. La UI toma importes, repartos y estados de la API. No incorpora cobros locales, liquidación en soles, gráficos nuevos ni un chatbot sin un servicio que los respalde.

Los endpoints de pedidos y métricas ya están presentes en esta versión del repositorio. Si el entorno desplegado todavía no los ofrece, la UI muestra el error y permite reintentar. Una respuesta incierta al confirmar o enviar una transacción no provoca reenvío automático.

La cuenta Firebase debe estar vinculada a un negocio de la API. Las autorizaciones y los pagos siguen dependiendo de la validación y confirmación que haga el backend. Mostrar PAID o una autorización en esta interfaz no verifica de forma independiente la finalidad de la transacción en Stellar.

## Verificación

```powershell
npm run lint
npm run typecheck
npm run build
npx playwright install chromium
npm run test:e2e
```

Playwright levanta una API exclusivamente de prueba en 3201 y Next.js en 3200. Ambos puertos deben estar libres. Los fixtures no se importan desde la aplicación y no modifican el backend real.

Las pruebas de flujos comerciales obtienen una cookie HttpOnly mediante la pasarela de compatibilidad existente. La validación y los errores del formulario Firebase usan respuestas de red simuladas; no necesitan usuarios reales ni hacen un login Google. Se comprueban voz → confirmación → QR → notificación de pago, CRUD, filtros, métricas, estados de error, navegación móvil, carga de imágenes y ausencia de desbordamiento. Las capturas quedan en test-results.

La firma con una extensión real, Google OAuth, cuentas Firebase vinculadas al negocio y los pagos on-chain deben validarse con el equipo de integración y fondos Testnet. Estas pruebas no certifican los contratos ni el backend.
