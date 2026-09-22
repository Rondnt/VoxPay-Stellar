# 1. Registrar las decisiones de arquitectura con ADRs

Fecha: 2026-09-22

## Estado

Aceptado

## Contexto

VoxPay tiene cinco componentes desplegables por separado (frontend, backend/API,
worker, ai-service, contrato Soroban) construidos por varias personas en paralelo
durante Stellar Build Peru. Se necesita un registro liviano de por qué se tomó
cada decisión técnica relevante, para no repetir discusiones ni perder contexto
cuando cambie el equipo.

## Decisión

Usar Architecture Decision Records (ADR) en `docs/adr/`, uno por decisión,
numerados secuencialmente, siguiendo el formato de Michael Nygard
(Contexto / Decisión / Consecuencias). Ver `template.md` en esta misma carpeta.

## Consecuencias

- Toda decisión con impacto entre componentes (contratos de API, esquema de
  eventos on-chain, elección de infraestructura) se documenta antes o justo
  después de implementarse.
- Los ADRs son inmutables una vez aceptados; una decisión que cambia se
  documenta en un ADR nuevo que referencia al anterior.
