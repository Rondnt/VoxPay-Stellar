import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Inject, Logger } from '@nestjs/common';
import type { Job } from 'bullmq';
import { AGENT_PROVIDER, type AgentProvider } from '../../infrastructure/agent/agent-provider.interface.js';
import { FirestoreService } from '../../infrastructure/firestore/firestore.service.js';
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
    private readonly firestore: FirestoreService,
    private readonly notifications: NotificationsPublisher,
  ) {
    super();
  }

  private get collection() {
    return this.firestore.db.collection('voiceCommands');
  }

  async process(job: Job<VoiceCommandJobData>): Promise<void> {
    const docRef = this.collection.doc(job.data.commandId);
    const doc = await docRef.get();
    if (!doc.exists) {
      this.logger.warn(`VoiceCommand ${job.data.commandId} not found, skipping`);
      return;
    }
    const merchantId = (doc.data() as { merchantId: string }).merchantId;

    const audio = Buffer.from(job.data.audioBase64, 'base64');
    const transcript = await this.agent.transcribe(audio, job.data.filename);
    const intent = await this.agent.interpret(transcript);

    const status = intent.confidence < 0.6 || intent.intent === 'unknown' ? 'UNKNOWN' : 'PENDING';

    await docRef.update({
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
    });

    await this.notifications.publish(merchantId, 'voice:confirmation', {
      commandId: doc.id,
      transcript,
      intent,
    });
  }

  /** Sin esto, un job que agota sus reintentos falla en silencio — nada lo loguea por default. */
  @OnWorkerEvent('failed')
  onFailed(job: Job<VoiceCommandJobData> | undefined, error: Error): void {
    this.logger.error(`interpret job ${job?.id} (command ${job?.data.commandId}) failed: ${error.message}`);
  }
}
