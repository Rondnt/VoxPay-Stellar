import { InjectQueue } from '@nestjs/bullmq';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import type { Queue } from 'bullmq';
import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';
import { QUEUE_NAMES } from '../../infrastructure/queue/queue.constants.js';
import type { CreateOrderDto } from '../orders/dto/create-order.dto.js';
import { MerchantsService } from '../merchants/merchants.service.js';
import { OrdersService } from '../orders/orders.service.js';

interface VoiceCommandJobData {
  commandId: string;
  audioBase64: string;
  filename: string;
}

interface StoredIntent {
  intent: string;
  order_ref?: string | null;
  amount?: number | null;
  splits?: { recipient_alias: string; amount: number }[];
}

@Injectable()
export class VoiceAgentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly merchants: MerchantsService,
    private readonly orders: OrdersService,
    @InjectQueue(QUEUE_NAMES.VOICE_COMMANDS)
    private readonly voiceQueue: Queue<VoiceCommandJobData>,
  ) {}

  async createCommand(tenantId: string, audio?: Express.Multer.File) {
    if (!audio) {
      throw new BadRequestException('audio file is required');
    }

    const merchant = await this.merchants.findByTenant(tenantId);
    const command = await this.prisma.voiceCommand.create({
      data: { merchantId: merchant.id, transcript: '', intentJson: {}, status: 'PENDING' },
    });

    await this.voiceQueue.add('interpret', {
      commandId: command.id,
      audioBase64: audio.buffer.toString('base64'),
      filename: audio.originalname,
    });

    return { commandId: command.id };
  }

  /** El comerciante confirma la intención ya interpretada por Raven; esto crea la orden. */
  async confirm(tenantId: string, commandId: string) {
    const merchant = await this.merchants.findByTenant(tenantId);
    const command = await this.prisma.voiceCommand.findFirst({
      where: { id: commandId, merchantId: merchant.id },
    });
    if (!command) throw new NotFoundException('Voice command not found');

    const intent = command.intentJson as unknown as StoredIntent;
    if (intent.intent !== 'create_order' || !intent.order_ref || !intent.amount) {
      throw new BadRequestException('Command has no confirmable create_order intent');
    }

    const dto: CreateOrderDto = {
      orderRef: intent.order_ref,
      amount: intent.amount,
      splits: (intent.splits ?? []).map((split) => ({
        recipientAlias: split.recipient_alias,
        amount: split.amount,
      })),
    };

    const order = await this.orders.createFromIntent(merchant.id, dto);

    await this.prisma.voiceCommand.update({
      where: { id: command.id },
      data: { status: 'CONFIRMED' },
    });

    return order;
  }
}
