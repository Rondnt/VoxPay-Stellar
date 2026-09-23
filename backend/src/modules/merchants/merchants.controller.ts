import { Body, Controller, Get, HttpCode, HttpStatus, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator.js';
import { SubmitOperatorAuthDto } from './dto/submit-operator-auth.dto.js';
import { MerchantsService } from './merchants.service.js';

@ApiTags('merchants')
@Controller('v1/merchants')
export class MerchantsController {
  constructor(private readonly merchants: MerchantsService) {}

  @Get('me')
  me(@CurrentTenant() tenantId: string) {
    return this.merchants.findByTenant(tenantId);
  }

  @Post('operator/tx')
  @HttpCode(HttpStatus.OK)
  async buildOperatorTx(@CurrentTenant() tenantId: string) {
    const xdr = await this.merchants.buildOperatorAuthorizationTx(tenantId);
    return { xdr };
  }

  @Post('operator/submit')
  @HttpCode(HttpStatus.OK)
  submitOperatorTx(@CurrentTenant() tenantId: string, @Body() dto: SubmitOperatorAuthDto) {
    return this.merchants.submitOperatorAuthorization(tenantId, dto.signedXdr);
  }
}
