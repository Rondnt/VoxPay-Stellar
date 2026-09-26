export type VoiceIntentType = 'create_order' | 'get_order_status' | 'get_sales_summary' | 'unknown';

export interface VoiceSplit {
  recipientAlias: string;
  amount: number;
  type: 'tip' | 'share';
}

export interface VoiceIntent {
  intent: VoiceIntentType;
  amount?: number;
  asset?: string;
  orderRef?: string;
  splits: VoiceSplit[];
  confidence: number;
}

export interface AgentProvider {
  transcribe(audio: Buffer, filename: string): Promise<string>;
  interpret(transcript: string): Promise<VoiceIntent>;
  speak(text: string): Promise<Buffer>;
}

export const AGENT_PROVIDER = Symbol('AGENT_PROVIDER');
