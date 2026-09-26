import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { WebSocketGateway, WebSocketServer, type OnGatewayConnection } from '@nestjs/websockets';
import { Redis } from 'ioredis';
import type { Server, Socket } from 'socket.io';
import { AuthService } from '../auth/auth.service.js';
import { MerchantsService } from '../merchants/merchants.service.js';

/**
 * Solo corre en el proceso API (necesita el servidor HTTP para levantar Socket.IO).
 * Se suscribe por Redis pub/sub a los eventos que publica `NotificationsPublisher` —
 * incluyendo desde el proceso worker — y los reemite a la room del merchant correspondiente.
 */
@Injectable()
@WebSocketGateway({ namespace: 'notifications', cors: { origin: '*' } })
export class NotificationsGateway implements OnGatewayConnection, OnModuleInit, OnModuleDestroy {
  @WebSocketServer()
  server!: Server;

  private readonly logger = new Logger(NotificationsGateway.name);
  private readonly subscriber: Redis;

  constructor(
    config: ConfigService,
    private readonly authService: AuthService,
    private readonly merchants: MerchantsService,
  ) {
    this.subscriber = new Redis(config.getOrThrow<string>('REDIS_URL'));
  }

  onModuleInit() {
    void this.subscriber.psubscribe('merchant:*:events');
    this.subscriber.on('pmessage', (_pattern: string, channel: string, message: string) => {
      const merchantId = channel.split(':')[1];
      this.server.to(merchantId).emit('event', JSON.parse(message));
    });
  }

  onModuleDestroy() {
    this.subscriber.disconnect();
  }

  /** Misma resolución de token que la API REST (JWT propio o Firebase); el merchantId nunca se confía del cliente. */
  async handleConnection(socket: Socket): Promise<void> {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) {
      socket.disconnect(true);
      return;
    }

    try {
      const payload = await this.authService.resolveUser(token);
      const merchant = await this.merchants.findByTenant(payload.tenantId);
      void socket.join(merchant.id);
    } catch (error) {
      this.logger.warn(`Rejected socket connection: ${(error as Error).message}`);
      socket.disconnect(true);
    }
  }
}
