import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { AGENT_PROVIDER, type AgentProvider } from '../../infrastructure/agent/agent-provider.interface.js';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { QUEUE_NAMES } from '../../infrastructure/queue/queue.constants.js';
import { NotificationsPublisher } from '../notifications/notifications.publisher.js';

interface VoiceCommandJobData {
  commandId: string;
  audioBase64: string;
  filename: string;
}

/** Consumidor de la cola `voice-commands`; solo corre en el proceso worker (ver worker.module.ts). */
@Processor(QUEUE_NAMES.VOICE_COMMANDS)
export class VoiceAgentProcessor extends WorkerHost {
  private readonly logger = new Logger(VoiceAgentProcessor.name);

  constructor(
    @Inject(AGENT_PROVIDER) private readonly agent: AgentProvider,
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsPublisher,
  ) {
    super();
  }

  async process(job: Job<VoiceCommandJobData>): Promise<void> {
    const command = await this.prisma.voiceCommand.findUnique({
      where: { id: job.data.commandId },
    });
    if (!command) {
      this.logger.warn(`VoiceCommand ${job.data.commandId} not found, skipping`);
      return;
    }

    const audio = Buffer.from(job.data.audioBase64, 'base64');
    const transcript = await this.agent.transcribe(audio, job.data.filename);
    const intent = await this.agent.interpret(transcript);

    const status = intent.confidence < 0.6 || intent.intent === 'unknown' ? 'UNKNOWN' : 'PENDING';

    await this.prisma.voiceCommand.update({
      where: { id: command.id },
      data: {
        transcript,
        intentJson: {
          intent: intent.intent,
          amount: intent.amount ?? null,
          asset: intent.asset ?? null,
          order_ref: intent.orderRef ?? null,
          splits: intent.splits.map((split) => ({
            recipient_alias: split.recipientAlias,
            amount: split.amount,
            type: split.type,
          })),
          confidence: intent.confidence,
        },
        status,
      },
    });

    await this.notifications.publish(command.merchantId, 'voice:confirmation', {
      commandId: command.id,
      transcript,
      intent,
    });
  }
}
