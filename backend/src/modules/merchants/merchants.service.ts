import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { SorobanService } from '../../infrastructure/stellar/soroban.service.js';

@Injectable()
export class MerchantsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly soroban: SorobanService,
  ) {}

  async findByTenant(tenantId: string) {
    const merchant = await this.prisma.merchant.findFirst({ where: { tenantId } });
    if (!merchant) throw new NotFoundException('Merchant not found');
    return merchant;
  }

  findById(id: string) {
    return this.prisma.merchant.findUniqueOrThrow({ where: { id } });
  }

  /** Arma el XDR sin firmar de set_operator(merchant, operator); lo firma el comerciante con su wallet. */
  async buildOperatorAuthorizationTx(tenantId: string): Promise<string> {
    const merchant = await this.findByTenant(tenantId);
    return this.soroban.buildUnsignedInvocation(merchant.stellarAddress, 'set_operator', [
      SorobanService.addressArg(merchant.stellarAddress),
      SorobanService.addressArg(this.soroban.getOperatorPublicKey()),
    ]);
  }

  async submitOperatorAuthorization(tenantId: string, signedXdr: string): Promise<{ hash: string }> {
    const merchant = await this.findByTenant(tenantId);
    const result = await this.soroban.submitSignedXdr(signedXdr);
    await this.prisma.merchant.update({
      where: { id: merchant.id },
      data: { operatorAuthorized: true },
    });
    return result;
  }
}
