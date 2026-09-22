# Guía de demo — Stellar Build Peru

## Preparación

- [ ] Contrato desplegado en Stellar Testnet, `operator` autorizado para el comerciante de demo.
- [ ] Comerciante de demo con al menos un destinatario en la agenda (`recipients`).
- [ ] Wallet del cliente (Freighter/xBull) fondeada con USDC de testnet.
- [ ] Backend, worker y Raven corriendo (`docker compose up` + `npm run start:dev` en cada proyecto).

## Guion

1. Abrir el POS en `/pos` y grabar: "Cobra 30 USDC por el pedido 52 y separa 3 USDC de propina para José".
2. Mostrar la confirmación que arma Raven (intención + montos) antes de crear la orden.
3. Confirmar → se crea la orden on-chain (`create_order`) y aparece el QR con el link de pago.
4. Escanear el QR desde otro dispositivo, conectar wallet y firmar `pay()`.
5. Mostrar en el POS la notificación en tiempo real de `order_paid` y el link al hash en stellar.expert.
6. Preguntar por voz en el dashboard: "¿Ya pagaron el pedido 52?" y "¿Cuánto cobré hoy?".

## Plan B

- Laptop de respaldo con túnel hacia Railway si falla la red del venue (ver tabla de despliegue en la
  arquitectura del sistema).
- Video corto pregrabado del flujo completo por si falla la demo en vivo.
