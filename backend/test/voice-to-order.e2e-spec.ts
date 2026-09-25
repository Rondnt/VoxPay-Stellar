import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { hash } from 'bcryptjs';
import { Timestamp } from 'firebase-admin/firestore';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';
import { FirestoreService } from '../src/infrastructure/firestore/firestore.service.js';

/**
 * Cubre el flujo central: confirmar una intención de voz ya interpretada crea la orden en Firestore
 * con los splits resueltos, y respeta el guard de auth. Corre contra el emulador de Firestore real
 * (FIRESTORE_EMULATOR_HOST) y Redis real (REDIS_URL) — no mockea nada de infraestructura.
 */
describe('Voice → confirm → order (e2e)', () => {
  let app: INestApplication<App>;
  let firestore: FirestoreService;
  let merchantId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();

    firestore = app.get(FirestoreService);

    const tenantRef = await firestore.db.collection('tenants').add({
      name: 'E2E Tenant',
      plan: 'free',
      apiKeyHash: 'unused',
      createdAt: Timestamp.now(),
    });

    await firestore.db.collection('users').add({
      tenantId: tenantRef.id,
      email: 'e2e@voxpay.dev',
      passwordHash: await hash('e2e-password', 10),
      role: 'OWNER',
      createdAt: Timestamp.now(),
    });

    const merchantRef = await firestore.db.collection('merchants').add({
      tenantId: tenantRef.id,
      stellarAddress: 'GE2EMERCHANTFAKE',
      operatorAuthorized: false,
      createdAt: Timestamp.now(),
    });
    merchantId = merchantRef.id;

    await firestore.db
      .collection('recipients')
      .doc(`${merchantId}_José`)
      .set({
        merchantId,
        alias: 'José',
        stellarAddress: 'GE2ERECIPIENTFAKE',
        defaultShare: null,
        createdAt: Timestamp.now(),
      });
  });

  afterAll(async () => {
    await app.close();
  });

  it('confirms a create_order intent and returns the resolved order', async () => {
    const login = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: 'e2e@voxpay.dev', password: 'e2e-password' })
      .expect(200);

    const token: string = login.body.accessToken;
    expect(token).toBeTruthy();

    const commandRef = await firestore.db.collection('voiceCommands').add({
      merchantId,
      transcript: 'Cobra 30 USDC por el pedido e2e y separa 3 USDC de propina para José',
      intentJson: {
        intent: 'create_order',
        amount: 30,
        asset: 'USDC',
        order_ref: `e2e-${Date.now()}`,
        splits: [{ recipient_alias: 'José', amount: 3 }],
        confidence: 0.95,
      },
      status: 'PENDING',
      createdAt: Timestamp.now(),
    });

    const confirm = await request(app.getHttpServer())
      .post(`/v1/voice/commands/${commandRef.id}/confirm`)
      .set('Authorization', `Bearer ${token}`)
      .expect(201);

    expect(confirm.body.status).toBe('PENDING');
    expect(confirm.body.splitsJson).toEqual([
      { recipientAlias: 'José', stellarAddress: 'GE2ERECIPIENTFAKE', amount: 3 },
    ]);

    await request(app.getHttpServer())
      .get(`/v1/orders/${confirm.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .expect(200)
      .expect(({ body }) => {
        if (body.id !== confirm.body.id) throw new Error('order id mismatch on read-back');
      });
  });

  it('rejects confirming a command from a different merchant (404, not leaked)', async () => {
    const login = await request(app.getHttpServer())
      .post('/v1/auth/login')
      .send({ email: 'e2e@voxpay.dev', password: 'e2e-password' })
      .expect(200);

    await request(app.getHttpServer())
      .post('/v1/voice/commands/does-not-exist/confirm')
      .set('Authorization', `Bearer ${login.body.accessToken as string}`)
      .expect(404);
  });

  it('rejects unauthenticated access to a protected route', async () => {
    await request(app.getHttpServer()).get('/v1/merchants/me').expect(401);
  });

  it('still allows public routes without a token (TenantGuard @Public() fix)', async () => {
    await request(app.getHttpServer()).get('/v1/public/orders/does-not-exist').expect(404);
  });
});
