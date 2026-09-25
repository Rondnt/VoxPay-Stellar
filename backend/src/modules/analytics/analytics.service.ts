import { Injectable } from '@nestjs/common';
import { MerchantsService } from '../merchants/merchants.service.js';
import { OrdersRepository } from '../orders/orders.repository.js';

@Injectable()
export class AnalyticsService {
  constructor(
    private readonly merchants: MerchantsService,
    private readonly orders: OrdersRepository,
  ) {}

  async today(tenantId: string) {
    const merchant = await this.merchants.findByTenant(tenantId);

    const from = new Date();
    from.setUTCHours(0, 0, 0, 0);
    const to = new Date();

    const { total, count } = await this.orders.sumPaidSince(merchant.id, from);

    return {
      totalAmount: total.toString(),
      count,
      from: from.toISOString(),
      to: to.toISOString(),
    };
  }
}
