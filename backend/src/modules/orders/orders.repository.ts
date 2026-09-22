import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';

@Injectable()
export class OrdersRepository {
  constructor(private readonly prisma: PrismaService) {}

  findById(id: string) {
    return this.prisma.order.findUnique({ where: { id } });
  }

  findByMerchantAndRef(merchantId: string, orderRef: string) {
    return this.prisma.order.findUnique({
      where: { merchantId_orderRef: { merchantId, orderRef } },
    });
  }

  create(data: Prisma.OrderUncheckedCreateInput) {
    return this.prisma.order.create({ data });
  }

  update(id: string, data: Prisma.OrderUncheckedUpdateInput) {
    return this.prisma.order.update({ where: { id }, data });
  }

  sumPaidSince(merchantId: string, since: Date) {
    return this.prisma.order.aggregate({
      where: { merchantId, status: 'PAID', createdAt: { gte: since } },
      _sum: { amount: true },
      _count: true,
    });
  }
}
