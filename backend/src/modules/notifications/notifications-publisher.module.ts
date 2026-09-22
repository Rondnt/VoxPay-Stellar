import { Module } from '@nestjs/common';
import { NotificationsPublisher } from './notifications.publisher.js';

/**
 * Módulo liviano sin el gateway WebSocket: lo importan `orders`/`voice-agent` para poder
 * publicar eventos tanto desde el proceso API como desde el proceso worker (que no levanta HTTP).
 */
@Module({
  providers: [NotificationsPublisher],
  exports: [NotificationsPublisher],
})
export class NotificationsPublisherModule {}
