import { Module } from '@nestjs/common';
import { NotificationsGateway } from './notifications.gateway.js';
import { NotificationsPublisherModule } from './notifications-publisher.module.js';

@Module({
  imports: [NotificationsPublisherModule],
  providers: [NotificationsGateway],
  exports: [NotificationsPublisherModule],
})
export class NotificationsModule {}
