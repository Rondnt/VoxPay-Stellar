import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Address, nativeToScVal } from '@stellar/stellar-sdk';
import type { Job } from 'bullmq';
import { QUEUE_NAMES } from '../../infrastructure/queue/queue.constants.js';
import { SorobanService } from '../../infrastructure/stellar/soroban.service.js';
import { MerchantsService } from '../merchants/merchants.service.js';
import { NotificationsPublisher } from '../notifications/notifications.publisher.js';
import { OrdersRepository } from './orders.repository.js';

interface CreateOrderJobData {
  orderId: string;
}

interface StoredSplit {
  recipientAlias: string;
  stellarAddress: string;
  amount: number;
}

/** Consumidor de la cola `orders`; solo corre en el proceso worker (ver worker.module.ts). */
@Processor(QUEUE_NAMES.ORDERS)
export class OrdersProcessor extends WorkerHost {
  private readonly logger = new Logger(OrdersProcessor.name);

  constructor(
    private readonly repository: OrdersRepository,
    private readonly merchants: MerchantsService,
    private readonly soroban: SorobanService,
    private readonly notifications: NotificationsPublisher,
  ) {
    super();
  }

  async process(job: Job<CreateOrderJobData>): Promise<void> {
    const order = await this.repository.findById(job.data.orderId);
    if (!order) {
      this.logger.warn(`Order ${job.data.orderId} not found, skipping`);
      return;
    }

    const merchant = await this.merchants.findById(order.merchantId);
    const splits = order.splitsJson as unknown as StoredSplit[];

    // TODO(fase 3): validar el encoding de Vec<Split> contra el contrato real una vez existan los
    // bindings generados (`stellar contract bindings typescript`) — nativeToScVal no conoce el layout
    // exacto del struct sin el spec del contrato.
    const splitsArg = nativeToScVal(
      splits.map((split) => ({
        recipient: new Address(split.stellarAddress),
        amount: BigInt(Math.trunc(split.amount)),
      })),
    );

    const { hash } = await this.soroban.invokeAsOperator('create_order', [
      SorobanService.addressArg(this.soroban.getOperatorPublicKey()),
      SorobanService.addressArg(merchant.stellarAddress),
      SorobanService.stringArg(order.orderRef),
      SorobanService.i128Arg(order.amount.toString()),
      splitsArg,
    ]);

    await this.repository.update(order.id, { createTxHash: hash });

    await this.notifications.publish(order.merchantId, 'order:created', {
      orderId: order.id,
      orderRef: order.orderRef,
      hash,
    });
  }
}
