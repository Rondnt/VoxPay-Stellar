import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './config/env.validation.js';
import { AgentModule } from './infrastructure/agent/agent.module.js';
import { PrismaModule } from './infrastructure/prisma/prisma.module.js';
import { QueueModule } from './infrastructure/queue/queue.module.js';
import { RedisModule } from './infrastructure/redis/redis.module.js';
import { StellarModule } from './infrastructure/stellar/stellar.module.js';
import { NotificationsPublisherModule } from './modules/notifications/notifications-publisher.module.js';
import { OrdersWorkerModule } from './modules/orders/orders.worker.module.js';
import { VoiceAgentWorkerModule } from './modules/voice-agent/voice-agent.worker.module.js';

/**
 * Composition root del proceso worker: mismos módulos de infraestructura que AppModule, pero solo
 * los `*.worker.module.ts` con los consumers de BullMQ — nunca controllers ni el gateway WebSocket.
 */
@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    PrismaModule,
    RedisModule,
    StellarModule,
    AgentModule,
    QueueModule,
    NotificationsPublisherModule,
    OrdersWorkerModule,
    VoiceAgentWorkerModule,
  ],
})
export class WorkerModule {}
