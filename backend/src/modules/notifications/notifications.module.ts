import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { MerchantsModule } from '../merchants/merchants.module.js';
import { NotificationsPublisherModule } from './notifications-publisher.module.js';
import { NotificationsGateway } from './notifications.gateway.js';

@Module({
  imports: [
    NotificationsPublisherModule,
    MerchantsModule,
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
      }),
      inject: [ConfigService],
    }),
  ],
  providers: [NotificationsGateway],
  exports: [NotificationsPublisherModule],
})
export class NotificationsModule {}
