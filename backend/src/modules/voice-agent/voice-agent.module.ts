import { BullModule } from '@nestjs/bullmq';
import { Module } from '@nestjs/common';
import { QUEUE_NAMES } from '../../infrastructure/queue/queue.constants.js';
import { MerchantsModule } from '../merchants/merchants.module.js';
import { OrdersModule } from '../orders/orders.module.js';
import { VoiceAgentController } from './voice-agent.controller.js';
import { VoiceAgentService } from './voice-agent.service.js';

@Module({
  imports: [
    BullModule.registerQueue({ name: QUEUE_NAMES.VOICE_COMMANDS }),
    MerchantsModule,
    OrdersModule,
  ],
  controllers: [VoiceAgentController],
  providers: [VoiceAgentService],
})
export class VoiceAgentModule {}
