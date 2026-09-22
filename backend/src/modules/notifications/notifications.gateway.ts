import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SubscribeMessage, WebSocketGateway, WebSocketServer, type OnGatewayConnection } from '@nestjs/websockets';
import { Redis } from 'ioredis';
import type { Server, Socket } from 'socket.io';

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

  private readonly subscriber: Redis;

  constructor(config: ConfigService) {
    this.subscriber = new Redis(config.getOrThrow<string>('REDIS_URL'));
  }

  onModuleInit() {
    this.subscriber.psubscribe('merchant:*:events');
    this.subscriber.on('pmessage', (_pattern: string, channel: string, message: string) => {
      const merchantId = channel.split(':')[1];
      this.server.to(merchantId).emit('event', JSON.parse(message));
    });
  }

  onModuleDestroy() {
    this.subscriber.disconnect();
  }

  handleConnection(socket: Socket) {
    const merchantId = socket.handshake.query.merchantId;
    if (typeof merchantId === 'string') {
      socket.join(merchantId);
    }
  }

  @SubscribeMessage('join')
  handleJoin(socket: Socket, merchantId: string) {
    socket.join(merchantId);
  }
}
