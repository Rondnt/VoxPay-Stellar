import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { MerchantsService } from '../merchants/merchants.service.js';
import type { CreateRecipientDto } from './dto/create-recipient.dto.js';
import type { UpdateRecipientDto } from './dto/update-recipient.dto.js';
import { RecipientsRepository } from './recipients.repository.js';

/** gRPC status code que el Admin SDK de Firestore usa cuando `.create()` choca con un doc existente. */
const GRPC_ALREADY_EXISTS = 6;

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
    try {
      return await this.repository.create({
        alias: dto.alias,
        stellarAddress: dto.stellarAddress,
        defaultShare: dto.defaultShare,
        merchantId: merchant.id,
      });
    } catch (error) {
      if ((error as { code?: number }).code === GRPC_ALREADY_EXISTS) {
        throw new ConflictException('Alias already exists');
      }
      throw error;
    }
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
