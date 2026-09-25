import { Controller, Get } from '@nestjs/common';
import { HealthCheck, HealthCheckService, HealthIndicatorService } from '@nestjs/terminus';
import { FirestoreService } from '../../infrastructure/firestore/firestore.service.js';
import { Public } from '../decorators/public.decorator.js';

@Controller('health')
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly indicators: HealthIndicatorService,
    private readonly firestore: FirestoreService,
  ) {}

  @Public()
  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () =>
        this.indicators.check('firestore').attempt(async () => {
          await this.firestore.db.listCollections();
        }),
    ]);
  }
}
