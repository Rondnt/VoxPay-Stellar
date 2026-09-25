import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
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

    const { hash } = await this.soroban.invokeAsOperator('create_order', {
      operator: this.soroban.getOperatorPublicKey(),
      merchant: merchant.stellarAddress,
      order_id: order.orderRef,
      amount: SorobanService.toContractAmount(Number(order.amount)),
      splits: splits.map((split) => ({
        recipient: split.stellarAddress,
        amount: SorobanService.toContractAmount(split.amount),
      })),
    });

    await this.repository.update(order.id, { createTxHash: hash });

    await this.notifications.publish(order.merchantId, 'order:created', {
      orderId: order.id,
      orderRef: order.orderRef,
      hash,
    });
  }

  /** Sin esto, un job que agota sus reintentos falla en silencio — nada lo loguea por default. */
  @OnWorkerEvent('failed')
  onFailed(job: Job<CreateOrderJobData> | undefined, error: Error): void {
    this.logger.error(`create_order job ${job?.id} (order ${job?.data.orderId}) failed: ${error.message}`);
  }
}
