import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3001),

  DATABASE_URL: z.string().min(1),
  REDIS_URL: z.string().min(1),

  JWT_SECRET: z.string().min(1),

  STELLAR_NETWORK: z.enum(['testnet', 'futurenet']).default('testnet'),
  STELLAR_RPC_URL: z.string().min(1),
  STELLAR_CONTRACT_ID: z.string().min(1),
  STELLAR_OPERATOR_SECRET: z.string().min(1),

  RAVEN_URL: z.string().min(1),
});

export type Env = z.infer<typeof envSchema>;

export function validateEnv(config: Record<string, unknown>): Env {
  return envSchema.parse(config);
}
