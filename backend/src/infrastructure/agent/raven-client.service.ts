import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AgentProvider, VoiceIntent, VoiceIntentType } from './agent-provider.interface.js';

interface RavenIntentResponse {
  intent: string;
  amount: number | null;
  asset: string | null;
  order_ref: string | null;
  splits: { recipient_alias: string; amount: number; type: string }[];
  confidence: number;
}

@Injectable()
export class RavenClient implements AgentProvider {
  private readonly baseUrl: string;

  constructor(config: ConfigService) {
    this.baseUrl = config.getOrThrow<string>('RAVEN_URL');
  }

  async transcribe(audio: Buffer, filename: string): Promise<string> {
    const form = new FormData();
    form.append('audio', new Blob([audio]), filename);

    const res = await fetch(`${this.baseUrl}/transcribe`, { method: 'POST', body: form });
    if (!res.ok) {
      throw new Error(`Raven /transcribe failed: ${res.status}`);
    }
    const body = (await res.json()) as { transcript: string };
    return body.transcript;
  }

  async interpret(transcript: string): Promise<VoiceIntent> {
    const res = await fetch(`${this.baseUrl}/interpret`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ transcript }),
    });
    if (!res.ok) {
      throw new Error(`Raven /interpret failed: ${res.status}`);
    }
    const body = (await res.json()) as RavenIntentResponse;

    return {
      intent: body.intent as VoiceIntentType,
      amount: body.amount ?? undefined,
      asset: body.asset ?? undefined,
      orderRef: body.order_ref ?? undefined,
      splits: body.splits.map((split) => ({
        recipientAlias: split.recipient_alias,
        amount: split.amount,
        type: split.type as 'tip' | 'share',
      })),
      confidence: body.confidence,
    };
  }
}
