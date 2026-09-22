import { Module } from '@nestjs/common';
import { MerchantsModule } from '../merchants/merchants.module.js';
import { RecipientsController } from './recipients.controller.js';
import { RecipientsRepository } from './recipients.repository.js';
import { RecipientsService } from './recipients.service.js';

@Module({
  imports: [MerchantsModule],
  controllers: [RecipientsController],
  providers: [RecipientsService, RecipientsRepository],
  exports: [RecipientsRepository],
})
export class RecipientsModule {}
