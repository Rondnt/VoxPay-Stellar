import { InjectQueue } from '@nestjs/bullmq';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { QUEUE_NAMES } from '../../infrastructure/queue/queue.constants.js';
import { RecipientsRepository } from '../recipients/recipients.repository.js';
import type { CreateOrderDto } from './dto/create-order.dto.js';
import { OrdersRepository } from './orders.repository.js';

interface CreateOrderJobData {
  orderId: string;
}

@Injectable()
export class OrdersService {
  constructor(
    private readonly repository: OrdersRepository,
    private readonly recipients: RecipientsRepository,
    @InjectQueue(QUEUE_NAMES.ORDERS) private readonly ordersQueue: Queue<CreateOrderJobData>,
  ) {}

  /** Crea la orden en Postgres (Pending) y encola su creación on-chain (create_order). */
  async createFromIntent(merchantId: string, dto: CreateOrderDto) {
    const resolvedSplits = [];
    let splitsTotal = 0;

    for (const split of dto.splits) {
      const recipient = await this.recipients.findByAlias(merchantId, split.recipientAlias);
      if (!recipient) {
        throw new BadRequestException(`Unknown recipient alias: ${split.recipientAlias}`);
      }
      resolvedSplits.push({
        recipientAlias: split.recipientAlias,
        stellarAddress: recipient.stellarAddress,
        amount: split.amount,
      });
      splitsTotal += split.amount;
    }

    if (splitsTotal > dto.amount) {
      throw new BadRequestException('Splits exceed order amount');
    }

    const order = await this.repository.create({
      merchantId,
      orderRef: dto.orderRef,
      amount: dto.amount,
      splitsJson: resolvedSplits,
      status: 'PENDING',
    });

    await this.ordersQueue.add('create_order', { orderId: order.id });

    return order;
  }

  async findById(id: string) {
    const order = await this.repository.findById(id);
    if (!order) throw new NotFoundException('Order not found');
    return order;
  }

  /** Datos públicos para la página de pago: nada sensible del comerciante ni de otros pedidos. */
  async findPublic(id: string) {
    const order = await this.findById(id);
    return {
      id: order.id,
      orderRef: order.orderRef,
      amount: order.amount,
      status: order.status,
      payTxHash: order.payTxHash,
    };
  }
}
