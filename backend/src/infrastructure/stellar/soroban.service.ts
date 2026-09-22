import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  Address,
  BASE_FEE,
  Contract,
  Keypair,
  Networks,
  Transaction,
  TransactionBuilder,
  nativeToScVal,
  rpc,
  scValToNative,
  xdr,
} from '@stellar/stellar-sdk';

@Injectable()
export class SorobanService {
  private readonly logger = new Logger(SorobanService.name);
  private readonly server: rpc.Server;
  private readonly contract: Contract;
  private readonly networkPassphrase: string;
  private readonly operatorKeypair: Keypair;

  constructor(config: ConfigService) {
    this.server = new rpc.Server(config.getOrThrow<string>('STELLAR_RPC_URL'));
    this.contract = new Contract(config.getOrThrow<string>('STELLAR_CONTRACT_ID'));
    this.networkPassphrase =
      config.get<string>('STELLAR_NETWORK', 'testnet') === 'testnet'
        ? Networks.TESTNET
        : Networks.FUTURENET;
    this.operatorKeypair = Keypair.fromSecret(config.getOrThrow<string>('STELLAR_OPERATOR_SECRET'));
  }

  /** Invoca al contrato firmando con la clave del operator (create_order, cancel_order, set_operator). */
  async invokeAsOperator(method: string, args: xdr.ScVal[]): Promise<{ hash: string }> {
    const account = await this.server.getAccount(this.operatorKeypair.publicKey());
    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(this.contract.call(method, ...args))
      .setTimeout(30)
      .build();

    const prepared = await this.server.prepareTransaction(tx);
    prepared.sign(this.operatorKeypair);
    return this.submit(prepared);
  }

  /** Arma el XDR sin firmar de pay(), para que el cliente lo firme con su wallet. */
  async buildUnsignedInvocation(
    sourcePublicKey: string,
    method: string,
    args: xdr.ScVal[],
  ): Promise<string> {
    const account = await this.server.getAccount(sourcePublicKey);
    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(this.contract.call(method, ...args))
      .setTimeout(30)
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
  async getOrder(orderId: string): Promise<unknown> {
    const retval = await this.simulateReadOnly('get_order', [
      nativeToScVal(orderId, { type: 'string' }),
    ]);
    return scValToNative(retval);
  }

  private async simulateReadOnly(method: string, args: xdr.ScVal[]): Promise<xdr.ScVal> {
    const account = await this.server.getAccount(this.operatorKeypair.publicKey());
    const tx = new TransactionBuilder(account, {
      fee: BASE_FEE,
      networkPassphrase: this.networkPassphrase,
    })
      .addOperation(this.contract.call(method, ...args))
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

  static addressArg(publicKey: string): xdr.ScVal {
    return new Address(publicKey).toScVal();
  }

  static i128Arg(amount: string): xdr.ScVal {
    return nativeToScVal(amount, { type: 'i128' });
  }

  static stringArg(value: string): xdr.ScVal {
    return nativeToScVal(value, { type: 'string' });
  }
}
