import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';

@Injectable()
export class RecipientsRepository {
  constructor(private readonly prisma: PrismaService) {}

  findAllByMerchant(merchantId: string) {
    return this.prisma.recipient.findMany({ where: { merchantId } });
  }

  findOne(id: string, merchantId: string) {
    return this.prisma.recipient.findFirst({ where: { id, merchantId } });
  }

  findByAlias(merchantId: string, alias: string) {
    return this.prisma.recipient.findUnique({ where: { merchantId_alias: { merchantId, alias } } });
  }

  create(data: Prisma.RecipientUncheckedCreateInput) {
    return this.prisma.recipient.create({ data });
  }

  update(id: string, data: Prisma.RecipientUncheckedUpdateInput) {
    return this.prisma.recipient.update({ where: { id }, data });
  }

  delete(id: string) {
    return this.prisma.recipient.delete({ where: { id } });
  }
}
