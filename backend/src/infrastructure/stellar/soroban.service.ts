import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  BASE_FEE,
  Contract,
  Keypair,
  Networks,
  Transaction,
  TransactionBuilder,
  rpc,
  xdr,
} from '@stellar/stellar-sdk';
import { Spec as ContractSpec } from '@stellar/stellar-sdk/contract';
import { CONTRACT_SPEC_ENTRIES, type Order } from './bindings/index.js';

/**
 * El SDK no le pone timeout a las llamadas RPC por default (`Options.timeout` default: 0, sin límite) —
 * contra una cuenta que no existe on-chain (ej. el operator inventado de desarrollo local), la llamada
 * queda colgada en vez de fallar rápido. Verificado en Fase 2: sin esto, un job de la cola `orders`
 * cuelga el worker entero esperando una respuesta que nunca llega.
 */
const RPC_TIMEOUT_MS = 10_000;

@Injectable()
export class SorobanService {
  private readonly logger = new Logger(SorobanService.name);
  private readonly server: rpc.Server;
  private readonly contract: Contract;
  private readonly spec: ContractSpec;
  private readonly networkPassphrase: string;
  private readonly operatorKeypair: Keypair;

  constructor(config: ConfigService) {
    this.server = new rpc.Server(config.getOrThrow<string>('STELLAR_RPC_URL'), {
      timeout: RPC_TIMEOUT_MS,
    });
    this.contract = new Contract(config.getOrThrow<string>('STELLAR_CONTRACT_ID'));
    this.spec = new ContractSpec(CONTRACT_SPEC_ENTRIES);
    this.networkPassphrase =
      config.get<string>('STELLAR_NETWORK', 'testnet') === 'testnet'
        ? Networks.TESTNET
        : Networks.FUTURENET;
    this.operatorKeypair = Keypair.fromSecret(config.getOrThrow<string>('STELLAR_OPERATOR_SECRET'));
  }

  /**
   * Invoca al contrato firmando con la clave del operator (create_order, cancel_order, set_operator).
   * `args` son los argumentos nombrados tal cual el contrato (ej. `{operator, merchant, order_id, amount,
   * splits}` para `create_order`) — `this.spec.funcArgsToScVals` los encodea contra el ABI real del
   * contrato (Etapa 3.4: reemplaza el `nativeToScVal` manual, que no validaba nombres/tipos de campos).
   */
  async invokeAsOperator(method: string, args: object): Promise<{ hash: string }> {
    const account = await this.server.getAccount(this.operatorKeypair.publicKey());
    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(this.contract.call(method, ...this.spec.funcArgsToScVals(method, args)))
      .setTimeout(30)
      .build();

    const prepared = await this.server.prepareTransaction(tx);
    prepared.sign(this.operatorKeypair);
    return this.submit(prepared);
  }

  /**
   * Arma el XDR sin firmar de pay()/set_operator(), para que el cliente lo firme con su wallet.
   * Ventana larga (10 min, no los 30s de los otros builders): acá el firmante es una persona real
   * abriendo Freighter/xBull, no el backend firmando al toque — 30s expira (`txTooLate`) antes de que
   * alguien alcance a leer la transacción y confirmarla. Verificado en Etapa 3.5 con una firma real.
   */
  async buildUnsignedInvocation(
    sourcePublicKey: string,
    method: string,
    args: object,
  ): Promise<string> {
    const account = await this.server.getAccount(sourcePublicKey);
    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(this.contract.call(method, ...this.spec.funcArgsToScVals(method, args)))
      .setTimeout(600)
      .build();

    const prepared = await this.server.prepareTransaction(tx);
    return prepared.toXDR();
  }

  /** Envía un XDR ya firmado por el cliente (pay()). */
  async submitSignedXdr(signedXdr: string): Promise<{ hash: string }> {
    const tx = TransactionBuilder.fromXDR(signedXdr, this.networkPassphrase) as Transaction;
    return this.submit(tx);
  }

  getOperatorPublicKey(): string {
    return this.operatorKeypair.publicKey();
  }

  /** Lectura on-chain de una orden (get_order); no requiere firma ni fondos. */
  async getOrder(orderId: string): Promise<Order> {
    const retval = await this.simulateReadOnly('get_order', { order_id: orderId });
    return this.spec.funcResToNative('get_order', retval) as Order;
  }

  private async simulateReadOnly(method: string, args: object): Promise<xdr.ScVal> {
    const account = await this.server.getAccount(this.operatorKeypair.publicKey());
    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(this.contract.call(method, ...this.spec.funcArgsToScVals(method, args)))
      .setTimeout(30)
      .build();

    const sim = await this.server.simulateTransaction(tx);
    if (rpc.Api.isSimulationError(sim)) {
      throw new Error(`Soroban simulation failed: ${sim.error}`);
    }
    if (!sim.result) {
      throw new Error('Soroban simulation returned no result');
    }
    return sim.result.retval;
  }

  private async submit(tx: Transaction): Promise<{ hash: string }> {
    const sent = await this.server.sendTransaction(tx);
    if (sent.status === 'ERROR') {
      this.logger.error(`Stellar tx rejected: ${JSON.stringify(sent.errorResult)}`);
      throw new Error('Stellar transaction rejected');
    }
    return { hash: sent.hash };
  }

  /**
   * Escala un monto decimal (ej. 30 USDC ingresado por voz) a la unidad mínima del asset antes de
   * codificarlo como i128 para el contrato. USDC en Stellar usa 7 decimales, igual que XLM/stroops
   * — el contrato y el SAC no saben nada de "USDC enteros", solo mueven la unidad mínima.
   */
  static toContractAmount(amount: number, decimals = 7): bigint {
    return BigInt(Math.round(amount * 10 ** decimals));
  }
}
