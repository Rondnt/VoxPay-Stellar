import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { QUEUE_NAMES } from '../../infrastructure/queue/queue.constants.js';
import { MerchantsModule } from '../merchants/merchants.module.js';
import { RecipientsModule } from '../recipients/recipients.module.js';
import { OrdersController } from './orders.controller.js';
import { OrdersRepository } from './orders.repository.js';
import { OrdersService } from './orders.service.js';

@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUE_NAMES.ORDERS }),
    RecipientsModule,
    MerchantsModule,
  ],
  controllers: [OrdersController],
  providers: [OrdersService, OrdersRepository],
  exports: [OrdersService, OrdersRepository],
})
export class OrdersModule {}
