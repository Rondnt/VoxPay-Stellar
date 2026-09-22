# voxpay — contrato Soroban

Fuente de verdad de órdenes y pagos. Ver la tabla de funciones y el modelo de
datos en `VoxPay - Arquitectura del Sistema.pdf` (raíz del repo).

## Build y test

Requiere Rust + target `wasm32-unknown-unknown` y `stellar-cli`.

```bash
rustup target add wasm32-unknown-unknown
cargo test
stellar contract build
```

## Deploy a testnet

```bash
stellar contract deploy \
  --wasm target/wasm32-unknown-unknown/release/voxpay.wasm \
  --source <admin-identity> \
  --network testnet
```

Luego generar los bindings TypeScript que consume `backend/`:

```bash
stellar contract bindings typescript \
  --contract-id <CONTRACT_ID> \
  --network testnet \
  --output-dir ../../backend/src/infrastructure/stellar/bindings
```
