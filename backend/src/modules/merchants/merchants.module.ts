import { Module } from '@nestjs/common';
import { MerchantsController } from './merchants.controller.js';
import { MerchantsService } from './merchants.service.js';
import { ReserveWithdrawalsRepository } from './reserve-withdrawals.repository.js';

@Module({
  controllers: [MerchantsController],
  providers: [MerchantsService, ReserveWithdrawalsRepository],
  exports: [MerchantsService],
})
export class MerchantsModule {}
