export const QUEUE_NAMES = {
  VOICE_COMMANDS: 'voice-commands',
  ORDERS: 'orders',
} as const;

export type QueueName = (typeof QUEUE_NAMES)[keyof typeof QUEUE_NAMES];
