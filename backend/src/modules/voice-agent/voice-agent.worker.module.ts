import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { AgentModule } from '../../infrastructure/agent/agent.module.js';
import { QUEUE_NAMES } from '../../infrastructure/queue/queue.constants.js';
import { NotificationsPublisherModule } from '../notifications/notifications-publisher.module.js';
import { VoiceAgentProcessor } from './voice-agent.processor.js';

/** Solo lo importa worker.module.ts: registra el consumer de la cola `voice-commands`. */
@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUE_NAMES.VOICE_COMMANDS }),
    AgentModule,
    NotificationsPublisherModule,
  ],
  providers: [VoiceAgentProcessor],
})
export class VoiceAgentWorkerModule {}
