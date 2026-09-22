import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { QUEUE_NAMES } from '../../infrastructure/queue/queue.constants.js';
import { MerchantsModule } from '../merchants/merchants.module.js';
import { NotificationsPublisherModule } from '../notifications/notifications-publisher.module.js';
import { OrdersModule } from './orders.module.js';
import { OrdersProcessor } from './orders.processor.js';

/** Solo lo importa worker.module.ts: registra el consumer de la cola `orders`. */
@Module({
  imports: [
    OrdersModule,
    MerchantsModule,
    NotificationsPublisherModule,
    BullModule.registerQueue({ name: QUEUE_NAMES.ORDERS }),
  ],
  providers: [OrdersProcessor],
})
export class OrdersWorkerModule {}
