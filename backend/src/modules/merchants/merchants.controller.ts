import { Body, Controller, Get, HttpCode, HttpStatus, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator.js';
import { BuildReserveWithdrawTxDto } from './dto/build-reserve-withdraw-tx.dto.js';
import { RegisterWalletDto } from './dto/register-wallet.dto.js';
import { SetReserveConfigDto } from './dto/set-reserve-config.dto.js';
import { SubmitOperatorAuthDto } from './dto/submit-operator-auth.dto.js';
import { SubmitReserveWithdrawDto } from './dto/submit-reserve-withdraw.dto.js';
import { MerchantsService } from './merchants.service.js';

@ApiTags('merchants')
@Controller('v1/merchants')
export class MerchantsController {
  constructor(private readonly merchants: MerchantsService) {}

  @Get('me')
  me(@CurrentTenant() tenantId: string) {
    return this.merchants.findByTenant(tenantId);
  }

  @Patch('wallet')
  registerWallet(@CurrentTenant() tenantId: string, @Body() dto: RegisterWalletDto) {
    return this.merchants.registerWallet(tenantId, dto.stellarAddress);
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

  @Patch('reserve')
  setReserveConfig(@CurrentTenant() tenantId: string, @Body() dto: SetReserveConfigDto) {
    return this.merchants.setReserveConfig(tenantId, dto.reservePercentage);
  }

  @Get('reserve/balance')
  async getReserveBalance(@CurrentTenant() tenantId: string) {
    const balance = await this.merchants.getReserveBalance(tenantId);
    return { balance };
  }

  @Post('reserve/withdraw/tx')
  @HttpCode(HttpStatus.OK)
  async buildReserveWithdrawTx(
    @CurrentTenant() tenantId: string,
    @Body() dto: BuildReserveWithdrawTxDto,
  ) {
    const xdr = await this.merchants.buildReserveWithdrawTx(tenantId, dto.amount);
    return { xdr };
  }

  @Post('reserve/withdraw/submit')
  @HttpCode(HttpStatus.OK)
  submitReserveWithdraw(
    @CurrentTenant() tenantId: string,
    @Body() dto: SubmitReserveWithdrawDto,
  ) {
    return this.merchants.submitReserveWithdraw(tenantId, dto.amount, dto.signedXdr);
  }

  @Get('reserve/withdrawals')
  getReserveWithdrawals(@CurrentTenant() tenantId: string) {
    return this.merchants.getReserveWithdrawals(tenantId);
  }
}
