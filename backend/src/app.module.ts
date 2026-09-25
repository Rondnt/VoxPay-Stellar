import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { HealthModule } from './common/health/health.module.js';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter.js';
import { JwtAuthGuard } from './common/guards/jwt-auth.guard.js';
import { TenantGuard } from './common/guards/tenant.guard.js';
import { validateEnv } from './config/env.validation.js';
import { AgentModule } from './infrastructure/agent/agent.module.js';
import { FirestoreModule } from './infrastructure/firestore/firestore.module.js';
import { QueueModule } from './infrastructure/queue/queue.module.js';
import { RedisModule } from './infrastructure/redis/redis.module.js';
import { StellarModule } from './infrastructure/stellar/stellar.module.js';
import { AnalyticsModule } from './modules/analytics/analytics.module.js';
import { AuthModule } from './modules/auth/auth.module.js';
import { MerchantsModule } from './modules/merchants/merchants.module.js';
import { NotificationsModule } from './modules/notifications/notifications.module.js';
import { OrdersModule } from './modules/orders/orders.module.js';
import { PaymentsModule } from './modules/payments/payments.module.js';
import { RecipientsModule } from './modules/recipients/recipients.module.js';
import { TenantsModule } from './modules/tenants/tenants.module.js';
import { VoiceAgentModule } from './modules/voice-agent/voice-agent.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, validate: validateEnv }),
    FirestoreModule,
    RedisModule,
    StellarModule,
    AgentModule,
    QueueModule,
    NotificationsModule,
    HealthModule,
    AuthModule,
    TenantsModule,
    MerchantsModule,
    RecipientsModule,
    OrdersModule,
    PaymentsModule,
    VoiceAgentModule,
    AnalyticsModule,
  ],
  providers: [
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: TenantGuard },
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
  ],
})
export class AppModule {}
