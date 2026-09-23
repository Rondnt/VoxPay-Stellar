import { Controller, Get } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator.js';
import { AnalyticsService } from './analytics.service.js';

@ApiTags('analytics')
@Controller('v1/analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('today')
  today(@CurrentTenant() tenantId: string) {
    return this.analytics.today(tenantId);
  }
}
