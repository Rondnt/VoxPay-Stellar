import 'dotenv/config';

import { Keypair } from '@stellar/stellar-sdk';
import { hash } from 'bcryptjs';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';

/**
 * Seed de datos para probar el backend contra el emulador de Firestore (Fase 2, Etapa 2.2).
 * Requiere FIRESTORE_EMULATOR_HOST seteado (ver backend/.env) — nunca corre contra Firebase real.
 */
async function main() {
  if (!process.env.FIRESTORE_EMULATOR_HOST) {
    throw new Error(
      'FIRESTORE_EMULATOR_HOST no está seteado — este script no debe correr contra Firebase real.',
    );
  }

  if (!getApps().length) {
    initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID ?? 'voxpay-local' });
  }
  const db = getFirestore();

  const merchantKeypair = Keypair.random();
  const recipientKeypair = Keypair.random();

  const tenantRef = await db.collection('tenants').add({
    name: 'Demo VoxPay',
    plan: 'free',
    apiKeyHash: await hash('demo-api-key', 10),
    createdAt: Timestamp.now(),
  });

  await db.collection('users').add({
    tenantId: tenantRef.id,
    email: 'demo@voxpay.dev',
    passwordHash: await hash('password123', 10),
    role: 'OWNER',
    createdAt: Timestamp.now(),
  });

  const merchantRef = await db.collection('merchants').add({
    tenantId: tenantRef.id,
    stellarAddress: merchantKeypair.publicKey(),
    operatorAuthorized: false,
    createdAt: Timestamp.now(),
  });

  const recipientAlias = 'José';
  await db
    .collection('recipients')
    .doc(`${merchantRef.id}_${recipientAlias}`)
    .set({
      merchantId: merchantRef.id,
      alias: recipientAlias,
      stellarAddress: recipientKeypair.publicKey(),
      defaultShare: null,
      createdAt: Timestamp.now(),
    });

  console.log('Seed OK\n');
  console.log('tenantId:      ', tenantRef.id);
  console.log('merchantId:    ', merchantRef.id);
  console.log('login:         demo@voxpay.dev / password123');
  console.log('recipient:     José');
  console.log('');
  console.log('Keypairs de testnet SIN FONDEAR (solo para que el backend no crashee; para probar');
  console.log('set_operator/pay de verdad en Fase 3 hay que fondearlos con friendbot):');
  console.log('  merchant  public:', merchantKeypair.publicKey());
  console.log('  merchant  secret:', merchantKeypair.secret());
  console.log('  recipient public:', recipientKeypair.publicKey());
  console.log('  recipient secret:', recipientKeypair.secret());
}

main()
  .then(() => process.exit(0))
  .catch((error: unknown) => {
    console.error(error);
    process.exit(1);
  });
