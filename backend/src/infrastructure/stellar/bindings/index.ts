import { Buffer } from 'buffer';
import {
  AssembledTransaction,
  Client as ContractClient,
  type ClientOptions as ContractClientOptions,
  type MethodOptions,
  Spec as ContractSpec,
} from '@stellar/stellar-sdk/contract';
import type { i128, u64 } from '@stellar/stellar-sdk/contract';

export * as contract from '@stellar/stellar-sdk/contract';
export * as rpc from '@stellar/stellar-sdk/rpc';

/**
 * Generado con `stellar contract bindings typescript --wasm
 * contracts/target/wasm32v1-none/release/voxpay.wasm` (Etapa 3.4) contra el wasm desplegado en
 * `CBFO53O3IHNMHCPAGJZXZMN2SOHA3BRKAJHAIRVNFKPZZD4E44BNX57Q`. Regenerar si `contracts/voxpay/src/lib.rs`
 * cambia. `SorobanService` usa `CONTRACT_SPEC_ENTRIES` para encodear/decodear argumentos con el ABI real
 * del contrato en vez de construir `xdr.ScVal` a mano.
 */
export const CONTRACT_SPEC_ENTRIES = [
  'AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAABwAAAAAAAAASQWxyZWFkeUluaXRpYWxpemVkAAAAAAABAAAAAAAAAA1Ob3RBdXRob3JpemVkAAAAAAAAAgAAAAAAAAAST3JkZXJBbHJlYWR5RXhpc3RzAAAAAAADAAAAAAAAAA1PcmRlck5vdEZvdW5kAAAAAAAABAAAAAAAAAAPT3JkZXJOb3RQZW5kaW5nAAAAAAUAAAAAAAAADUludmFsaWRBbW91bnQAAAAAAAAGAAAAAAAAABJTcGxpdHNFeGNlZWRBbW91bnQAAAAAAAc=',
  'AAAAAQAAAAAAAAAAAAAABU9yZGVyAAAAAAAABQAAAAAAAAAGYW1vdW50AAAAAAALAAAAAAAAAApjcmVhdGVkX2F0AAAAAAAGAAAAAAAAAAhtZXJjaGFudAAAABMAAAAAAAAABnNwbGl0cwAAAAAD6gAAB9AAAAAFU3BsaXQAAAAAAAAAAAAABnN0YXR1cwAAAAAH0AAAAAtPcmRlclN0YXR1cwA=',
  'AAAAAQAAAAAAAAAAAAAABVNwbGl0AAAAAAAAAgAAAAAAAAAGYW1vdW50AAAAAAALAAAAAAAAAAlyZWNpcGllbnQAAAAAAAAT',
  'AAAABQAAAAAAAAAAAAAACU9yZGVyUGFpZAAAAAAAAAEAAAAKb3JkZXJfcGFpZAAAAAAAAwAAAAAAAAAIb3JkZXJfaWQAAAAQAAAAAQAAAAAAAAAFcGF5ZXIAAAAAAAATAAAAAAAAAAAAAAAGYW1vdW50AAAAAAALAAAAAAAAAAI=',
  'AAAAAgAAAAAAAAAAAAAAC09yZGVyU3RhdHVzAAAAAAMAAAAAAAAAAAAAAAdQZW5kaW5nAAAAAAAAAAAAAAAABFBhaWQAAAAAAAAAAAAAAAlDYW5jZWxsZWQAAAA=',
  'AAAABQAAAAAAAAAAAAAADE9yZGVyQ3JlYXRlZAAAAAEAAAANb3JkZXJfY3JlYXRlZAAAAAAAAAIAAAAAAAAACG9yZGVyX2lkAAAAEAAAAAEAAAAAAAAACG1lcmNoYW50AAAAEwAAAAAAAAAC',
  'AAAABQAAAAAAAAAAAAAADk9yZGVyQ2FuY2VsbGVkAAAAAAABAAAAD29yZGVyX2NhbmNlbGxlZAAAAAACAAAAAAAAAAhvcmRlcl9pZAAAABAAAAABAAAAAAAAAAZjYWxsZXIAAAAAABMAAAAAAAAAAg==',
  'AAAAAAAAAFVFbCBjbGllbnRlIHBhZ2EgZWwgbW9udG8gZXhhY3RvOyBlbCBjb250cmF0byByZXBhcnRlIFVTREMgeSBtYXJjYSBsYSBvcmRlbiBjb21vIFBhaWQuAAAAAAAAA3BheQAAAAACAAAAAAAAAAVwYXllcgAAAAAAABMAAAAAAAAACG9yZGVyX2lkAAAAEAAAAAA=',
  'AAAAAAAAAFRGaWphIGVsIHRva2VuIFVTREMgKFN0ZWxsYXIgQXNzZXQgQ29udHJhY3QpIHF1ZSBlbCBjb250cmF0byBhY2VwdGFyw6EuIFNvbG8gdW5hIHZlei4AAAAEaW5pdAAAAAIAAAAAAAAABWFkbWluAAAAAAAAEwAAAAAAAAAFdG9rZW4AAAAAAAATAAAAAA==',
  'AAAAAAAAADhMZWN0dXJhIHDDumJsaWNhOiBtb250bywgcmVwYXJ0b3MgeSBlc3RhZG8gZGUgdW5hIG9yZGVuLgAAAAlnZXRfb3JkZXIAAAAAAAABAAAAAAAAAAhvcmRlcl9pZAAAABAAAAABAAAH0AAAAAVPcmRlcgAAAA==',
  'AAAAAAAAAEdFbCBjb21lcmNpYW50ZSBvIHN1IG9wZXJhdG9yIGNhbmNlbGFuIHVuYSBvcmRlbiBxdWUgYcO6biBubyBmdWUgcGFnYWRhLgAAAAAMY2FuY2VsX29yZGVyAAAAAgAAAAAAAAAGY2FsbGVyAAAAAAATAAAAAAAAAAhvcmRlcl9pZAAAABAAAAAA',
  'AAAAAAAAADxFbCBvcGVyYXRvciBhdXRvcml6YWRvIHJlZ2lzdHJhIHVuYSBvcmRlbiBlbiBlc3RhZG8gUGVuZGluZy4AAAAMY3JlYXRlX29yZGVyAAAABQAAAAAAAAAIb3BlcmF0b3IAAAATAAAAAAAAAAhtZXJjaGFudAAAABMAAAAAAAAACG9yZGVyX2lkAAAAEAAAAAAAAAAGYW1vdW50AAAAAAALAAAAAAAAAAZzcGxpdHMAAAAAA+oAAAfQAAAABVNwbGl0AAAAAAAAAA==',
  'AAAAAAAAAExFbCBjb21lcmNpYW50ZSBhdXRvcml6YSBhbCBiYWNrZW5kIChvcGVyYXRvcikgYSBjcmVhciDDs3JkZW5lcyBlbiBzdSBub21icmUuAAAADHNldF9vcGVyYXRvcgAAAAIAAAAAAAAACG1lcmNoYW50AAAAEwAAAAAAAAAIb3BlcmF0b3IAAAATAAAAAA==',
];

export const Errors: Record<number, { message: string }> = {
  1: { message: 'AlreadyInitialized' },
  2: { message: 'NotAuthorized' },
  3: { message: 'OrderAlreadyExists' },
  4: { message: 'OrderNotFound' },
  5: { message: 'OrderNotPending' },
  6: { message: 'InvalidAmount' },
  7: { message: 'SplitsExceedAmount' },
};

export interface Split {
  amount: i128;
  recipient: string;
}

export type OrderStatus =
  | { tag: 'Pending'; values: void }
  | { tag: 'Paid'; values: void }
  | { tag: 'Cancelled'; values: void };

export interface Order {
  amount: i128;
  created_at: u64;
  merchant: string;
  splits: Array<Split>;
  status: OrderStatus;
}

export interface Client {
  pay: (
    args: { payer: string; order_id: string },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<null>>;
  init: (
    args: { admin: string; token: string },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<null>>;
  get_order: (
    args: { order_id: string },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Order>>;
  cancel_order: (
    args: { caller: string; order_id: string },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<null>>;
  create_order: (
    args: { operator: string; merchant: string; order_id: string; amount: i128; splits: Array<Split> },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<null>>;
  set_operator: (
    args: { merchant: string; operator: string },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<null>>;
}

export class Client extends ContractClient {
  static async deploy<T = Client>(
    options: MethodOptions &
      Omit<ContractClientOptions, 'contractId'> & {
        wasmHash: Buffer | string;
        salt?: Buffer | Uint8Array;
        format?: 'hex' | 'base64';
      },
  ): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy(null, options);
  }

  constructor(public readonly options: ContractClientOptions) {
    super(new ContractSpec(CONTRACT_SPEC_ENTRIES), options);
  }
}
