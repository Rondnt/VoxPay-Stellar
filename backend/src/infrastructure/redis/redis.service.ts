import { Injectable, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Redis } from 'ioredis';
import { randomUUID } from 'node:crypto';

@Injectable()
export class RedisService implements OnModuleDestroy {
  readonly client: Redis;

  constructor(config: ConfigService) {
    this.client = new Redis(config.getOrThrow<string>('REDIS_URL'), {
      maxRetriesPerRequest: null,
    });
  }

  onModuleDestroy() {
    this.client.disconnect();
  }

  /** Lock simple con SET NX PX; usado por el indexador de eventos para correr una sola instancia activa. */
  async withLock<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T | undefined> {
    const token = randomUUID();
    const acquired = await this.client.set(`lock:${key}`, token, 'PX', ttlMs, 'NX');
    if (acquired !== 'OK') return undefined;

    try {
      return await fn();
    } finally {
      const current = await this.client.get(`lock:${key}`);
      if (current === token) {
        await this.client.del(`lock:${key}`);
      }
    }
  }
}
