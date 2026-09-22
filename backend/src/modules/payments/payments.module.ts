import { Module } from '@nestjs/common';
import { NotificationsPublisherModule } from '../notifications/notifications-publisher.module.js';
import { OrdersModule } from '../orders/orders.module.js';
import { PaymentsController } from './payments.controller.js';
import { PaymentsService } from './payments.service.js';

@Module({
  imports: [OrdersModule, NotificationsPublisherModule],
  controllers: [PaymentsController],
  providers: [PaymentsService],
})
export class PaymentsModule {}
