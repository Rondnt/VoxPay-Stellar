import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';

@Injectable()
export class TenantsService {
  constructor(private readonly prisma: PrismaService) {}

  findByApiKeyHash(apiKeyHash: string) {
    return this.prisma.tenant.findUnique({ where: { apiKeyHash } });
  }

  findById(id: string) {
    return this.prisma.tenant.findUniqueOrThrow({ where: { id } });
  }

  create(data: { name: string; apiKeyHash: string; plan?: string }) {
    return this.prisma.tenant.create({ data });
  }
}
