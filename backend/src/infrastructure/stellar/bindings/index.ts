import { Buffer } from "buffer";
import {
  AssembledTransaction,
  Client as ContractClient,
  ClientOptions as ContractClientOptions,
  MethodOptions,
  Spec as ContractSpec,
} from "@stellar/stellar-sdk/contract";
import type { i128, u64 } from "@stellar/stellar-sdk/contract";

if (typeof window !== "undefined") {
  //@ts-ignore Buffer exists
  window.Buffer = window.Buffer || Buffer;
}

export const networks = {
  testnet: {
    networkPassphrase: "Test SDF Network ; September 2015",
    contractId: "CDB4ODRPLWFHJ5VYPDMUPVAT5FBMAS7WRNAJTG66C26M2XIWRQP4M6NI",
  },
} as const;

export const Errors = {
  1: { message: "AlreadyInitialized" },
  2: { message: "NotAuthorized" },
  3: { message: "OrderAlreadyExists" },
  4: { message: "OrderNotFound" },
  5: { message: "OrderNotPending" },
  6: { message: "InvalidAmount" },
  7: { message: "SplitsExceedAmount" },
  8: { message: "InsufficientReserve" },
};

export interface Order {
  amount: i128;
  created_at: u64;
  merchant: string;
  reserve: i128;
  splits: Array<Split>;
  status: OrderStatus;
}

export interface Split {
  amount: i128;
  recipient: string;
}

export type OrderStatus =
  | { tag: "Pending"; values: void }
  | { tag: "Paid"; values: void }
  | { tag: "Cancelled"; values: void };

/**
 * Entradas del spec del contrato (XDR base64), descargadas con `stellar contract bindings
 * typescript`. Se exponen aparte (en vez de solo adentro del constructor de `Client`) porque
 * `SorobanService` arma su propio `Spec` con esto -- no usa la clase `Client` generada, que asume
 * un flujo simulate->sign->send propio (`AssembledTransaction`) distinto del split
 * operator-firma/cliente-firma-XDR-sin-firmar que ya usa el backend.
 */
export const CONTRACT_SPEC_ENTRIES: string[] = [
  "AAAABAAAAAAAAAAAAAAABUVycm9yAAAAAAAACAAAAAAAAAASQWxyZWFkeUluaXRpYWxpemVkAAAAAAABAAAAAAAAAA1Ob3RBdXRob3JpemVkAAAAAAAAAgAAAAAAAAAST3JkZXJBbHJlYWR5RXhpc3RzAAAAAAADAAAAAAAAAA1PcmRlck5vdEZvdW5kAAAAAAAABAAAAAAAAAAPT3JkZXJOb3RQZW5kaW5nAAAAAAUAAAAAAAAADUludmFsaWRBbW91bnQAAAAAAAAGAAAAAAAAABJTcGxpdHNFeGNlZWRBbW91bnQAAAAAAAcAAAAAAAAAE0luc3VmZmljaWVudFJlc2VydmUAAAAACA==",
  "AAAAAQAAAAAAAAAAAAAABU9yZGVyAAAAAAAABgAAAAAAAAAGYW1vdW50AAAAAAALAAAAAAAAAApjcmVhdGVkX2F0AAAAAAAGAAAAAAAAAAhtZXJjaGFudAAAABMAAAAAAAAAB3Jlc2VydmUAAAAACwAAAAAAAAAGc3BsaXRzAAAAAAPqAAAH0AAAAAVTcGxpdAAAAAAAAAAAAAAGc3RhdHVzAAAAAAfQAAAAC09yZGVyU3RhdHVzAA==",
  "AAAAAQAAAAAAAAAAAAAABVNwbGl0AAAAAAAAAgAAAAAAAAAGYW1vdW50AAAAAAALAAAAAAAAAAlyZWNpcGllbnQAAAAAAAAT",
  "AAAABQAAAAAAAAAAAAAACU9yZGVyUGFpZAAAAAAAAAEAAAAKb3JkZXJfcGFpZAAAAAAAAwAAAAAAAAAIb3JkZXJfaWQAAAAQAAAAAQAAAAAAAAAFcGF5ZXIAAAAAAAATAAAAAAAAAAAAAAAGYW1vdW50AAAAAAALAAAAAAAAAAI=",
  "AAAAAgAAAAAAAAAAAAAAC09yZGVyU3RhdHVzAAAAAAMAAAAAAAAAAAAAAAdQZW5kaW5nAAAAAAAAAAAAAAAABFBhaWQAAAAAAAAAAAAAAAlDYW5jZWxsZWQAAAA=",
  "AAAABQAAAAAAAAAAAAAADE9yZGVyQ3JlYXRlZAAAAAEAAAANb3JkZXJfY3JlYXRlZAAAAAAAAAIAAAAAAAAACG9yZGVyX2lkAAAAEAAAAAEAAAAAAAAACG1lcmNoYW50AAAAEwAAAAAAAAAC",
  "AAAABQAAAAAAAAAAAAAADk9yZGVyQ2FuY2VsbGVkAAAAAAABAAAAD29yZGVyX2NhbmNlbGxlZAAAAAACAAAAAAAAAAhvcmRlcl9pZAAAABAAAAABAAAAAAAAAAZjYWxsZXIAAAAAABMAAAAAAAAAAg==",
  "AAAABQAAAAAAAAAAAAAAEFJlc2VydmVXaXRoZHJhd24AAAABAAAAEXJlc2VydmVfd2l0aGRyYXduAAAAAAAAAgAAAAAAAAAIbWVyY2hhbnQAAAATAAAAAQAAAAAAAAAGYW1vdW50AAAAAAALAAAAAAAAAAI=",
  "AAAAAAAAAFVFbCBjbGllbnRlIHBhZ2EgZWwgbW9udG8gZXhhY3RvOyBlbCBjb250cmF0byByZXBhcnRlIFVTREMgeSBtYXJjYSBsYSBvcmRlbiBjb21vIFBhaWQuAAAAAAAAA3BheQAAAAACAAAAAAAAAAVwYXllcgAAAAAAABMAAAAAAAAACG9yZGVyX2lkAAAAEAAAAAA=",
  "AAAAAAAAAFRGaWphIGVsIHRva2VuIFVTREMgKFN0ZWxsYXIgQXNzZXQgQ29udHJhY3QpIHF1ZSBlbCBjb250cmF0byBhY2VwdGFyw6EuIFNvbG8gdW5hIHZlei4AAAAEaW5pdAAAAAIAAAAAAAAABWFkbWluAAAAAAAAEwAAAAAAAAAFdG9rZW4AAAAAAAATAAAAAA==",
  "AAAAAAAAADhMZWN0dXJhIHDDumJsaWNhOiBtb250bywgcmVwYXJ0b3MgeSBlc3RhZG8gZGUgdW5hIG9yZGVuLgAAAAlnZXRfb3JkZXIAAAAAAAABAAAAAAAAAAhvcmRlcl9pZAAAABAAAAABAAAH0AAAAAVPcmRlcgAAAA==",
  "AAAAAAAAAEdFbCBjb21lcmNpYW50ZSBvIHN1IG9wZXJhdG9yIGNhbmNlbGFuIHVuYSBvcmRlbiBxdWUgYcO6biBubyBmdWUgcGFnYWRhLgAAAAAMY2FuY2VsX29yZGVyAAAAAgAAAAAAAAAGY2FsbGVyAAAAAAATAAAAAAAAAAhvcmRlcl9pZAAAABAAAAAA",
  "AAAAAAAAADxFbCBvcGVyYXRvciBhdXRvcml6YWRvIHJlZ2lzdHJhIHVuYSBvcmRlbiBlbiBlc3RhZG8gUGVuZGluZy4AAAAMY3JlYXRlX29yZGVyAAAABgAAAAAAAAAIb3BlcmF0b3IAAAATAAAAAAAAAAhtZXJjaGFudAAAABMAAAAAAAAACG9yZGVyX2lkAAAAEAAAAAAAAAAGYW1vdW50AAAAAAALAAAAAAAAAAZzcGxpdHMAAAAAA+oAAAfQAAAABVNwbGl0AAAAAAAAAAAAAAdyZXNlcnZlAAAAAAsAAAAA",
  "AAAAAAAAAExFbCBjb21lcmNpYW50ZSBhdXRvcml6YSBhbCBiYWNrZW5kIChvcGVyYXRvcikgYSBjcmVhciDDs3JkZW5lcyBlbiBzdSBub21icmUuAAAADHNldF9vcGVyYXRvcgAAAAIAAAAAAAAACG1lcmNoYW50AAAAEwAAAAAAAAAIb3BlcmF0b3IAAAATAAAAAA==",
  "AAAAAAAAALFFbCBjb21lcmNpYW50ZSByZXRpcmEgKHRvdGFsIG8gcGFyY2lhbG1lbnRlKSBsbyBxdWUgYHBheSgpYCBmdWUgYWN1bXVsYW5kbyBlbiBzdSByZXNlcnZhLgrDmm5pY2EgZm9ybWEgZGUgbW92ZXIgZXNvcyBmb25kb3M6IGhhc3RhIGFjw6EsIHF1ZWRhbiBibG9xdWVhZG9zIGVuIGVsIHByb3BpbyBjb250cmF0by4AAAAAAAAQd2l0aGRyYXdfcmVzZXJ2ZQAAAAIAAAAAAAAACG1lcmNoYW50AAAAEwAAAAAAAAAGYW1vdW50AAAAAAALAAAAAA==",
  "AAAAAAAAAFdMZWN0dXJhIHDDumJsaWNhOiBjdcOhbnRvIHRpZW5lIHVuIGNvbWVyY2lhbnRlIHJldGVuaWRvIGVuIHJlc2VydmEsIGxpc3RvIHBhcmEgcmV0aXJhci4AAAAAE2dldF9yZXNlcnZlX2JhbGFuY2UAAAAAAQAAAAAAAAAIbWVyY2hhbnQAAAATAAAAAQAAAAs=",
];

export interface Client {
  pay: (
    { payer, order_id }: { payer: string; order_id: string },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<null>>;

  init: (
    { admin, token }: { admin: string; token: string },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<null>>;

  get_order: (
    { order_id }: { order_id: string },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<Order>>;

  cancel_order: (
    { caller, order_id }: { caller: string; order_id: string },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<null>>;

  create_order: (
    {
      operator,
      merchant,
      order_id,
      amount,
      splits,
      reserve,
    }: {
      operator: string;
      merchant: string;
      order_id: string;
      amount: i128;
      splits: Array<Split>;
      reserve: i128;
    },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<null>>;

  set_operator: (
    { merchant, operator }: { merchant: string; operator: string },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<null>>;

  withdraw_reserve: (
    { merchant, amount }: { merchant: string; amount: i128 },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<null>>;

  get_reserve_balance: (
    { merchant }: { merchant: string },
    options?: MethodOptions,
  ) => Promise<AssembledTransaction<i128>>;
}

export class Client extends ContractClient {
  static async deploy<T = Client>(
    options: MethodOptions &
      Omit<ContractClientOptions, "contractId"> & {
        wasmHash: Buffer | string;
        salt?: Buffer | Uint8Array;
        format?: "hex" | "base64";
      },
  ): Promise<AssembledTransaction<T>> {
    return ContractClient.deploy(null, options);
  }
  constructor(public readonly options: ContractClientOptions) {
    super(new ContractSpec([...CONTRACT_SPEC_ENTRIES]), options);
  }
  public readonly fromJSON = {
    pay: this.txFromJSON<null>,
    init: this.txFromJSON<null>,
    get_order: this.txFromJSON<Order>,
    cancel_order: this.txFromJSON<null>,
    create_order: this.txFromJSON<null>,
    set_operator: this.txFromJSON<null>,
    withdraw_reserve: this.txFromJSON<null>,
    get_reserve_balance: this.txFromJSON<i128>,
  };
}
