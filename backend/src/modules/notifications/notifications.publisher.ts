import { Injectable } from '@nestjs/common';
import { RedisService } from '../../infrastructure/redis/redis.service.js';

@Injectable()
export class NotificationsPublisher {
  constructor(private readonly redis: RedisService) {}

  async publish(merchantId: string, event: string, payload: unknown): Promise<void> {
    await this.redis.client.publish(
      `merchant:${merchantId}:events`,
      JSON.stringify({ event, payload }),
    );
  }
}
