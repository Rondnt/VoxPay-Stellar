import { z } from 'zod';

export const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3001),

  REDIS_URL: z.string().min(1),

  JWT_SECRET: z.string().min(1),

  FIREBASE_PROJECT_ID: z.string().min(1),
  // Solo local: si está seteada, el Admin SDK se conecta al emulador sin credenciales.
  FIRESTORE_EMULATOR_HOST: z.string().min(1).optional(),
  // Solo producción/staging (sin emulador): JSON del service account.
  FIREBASE_SERVICE_ACCOUNT: z.string().min(1).optional(),

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
