import { Injectable, NotFoundException } from '@nestjs/common';
import { MerchantsService } from '../merchants/merchants.service.js';
import type { CreateRecipientDto } from './dto/create-recipient.dto.js';
import type { UpdateRecipientDto } from './dto/update-recipient.dto.js';
import { RecipientsRepository } from './recipients.repository.js';

@Injectable()
export class RecipientsService {
  constructor(
    private readonly repository: RecipientsRepository,
    private readonly merchants: MerchantsService,
  ) {}

  async list(tenantId: string) {
    const merchant = await this.merchants.findByTenant(tenantId);
    return this.repository.findAllByMerchant(merchant.id);
  }

  async create(tenantId: string, dto: CreateRecipientDto) {
    const merchant = await this.merchants.findByTenant(tenantId);
    return this.repository.create({ ...dto, merchantId: merchant.id });
  }

  async update(tenantId: string, id: string, dto: UpdateRecipientDto) {
    const merchant = await this.merchants.findByTenant(tenantId);
    const existing = await this.repository.findOne(id, merchant.id);
    if (!existing) throw new NotFoundException('Recipient not found');
    return this.repository.update(id, dto);
  }

  async remove(tenantId: string, id: string) {
    const merchant = await this.merchants.findByTenant(tenantId);
    const existing = await this.repository.findOne(id, merchant.id);
    if (!existing) throw new NotFoundException('Recipient not found');
    return this.repository.delete(id);
  }
}
