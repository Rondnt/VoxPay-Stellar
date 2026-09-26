import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { MerchantsModule } from '../merchants/merchants.module.js';
import { NotificationsPublisherModule } from './notifications-publisher.module.js';
import { NotificationsGateway } from './notifications.gateway.js';

@Module({
  imports: [NotificationsPublisherModule, MerchantsModule, AuthModule],
  providers: [NotificationsGateway],
  exports: [NotificationsPublisherModule],
})
export class NotificationsModule {}
