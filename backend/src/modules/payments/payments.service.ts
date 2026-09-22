import { Injectable, NotFoundException } from '@nestjs/common';
import { SorobanService } from '../../infrastructure/stellar/soroban.service.js';
import { OrdersRepository } from '../orders/orders.repository.js';
import { NotificationsPublisher } from '../notifications/notifications.publisher.js';

@Injectable()
export class PaymentsService {
  constructor(
    private readonly orders: OrdersRepository,
    private readonly soroban: SorobanService,
    private readonly notifications: NotificationsPublisher,
  ) {}

  async buildPaymentTx(orderId: string, payerPublicKey: string): Promise<string> {
    const order = await this.orders.findById(orderId);
    if (!order) throw new NotFoundException('Order not found');

    return this.soroban.buildUnsignedInvocation(payerPublicKey, 'pay', [
      SorobanService.addressArg(payerPublicKey),
      SorobanService.stringArg(order.orderRef),
    ]);
  }

  async submitPayment(orderId: string, signedXdr: string): Promise<{ hash: string }> {
    const order = await this.orders.findById(orderId);
    if (!order) throw new NotFoundException('Order not found');

    const result = await this.soroban.submitSignedXdr(signedXdr);
    await this.orders.update(order.id, { status: 'PAID', payTxHash: result.hash });

    await this.notifications.publish(order.merchantId, 'order:paid', {
      orderId: order.id,
      orderRef: order.orderRef,
      hash: result.hash,
    });

    return result;
  }
}
