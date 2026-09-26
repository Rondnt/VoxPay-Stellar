import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator.js';
import { Public } from '../../common/decorators/public.decorator.js';
import { OrdersService } from './orders.service.js';

@ApiTags('orders')
@Controller()
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get('v1/orders')
  findAll(@CurrentTenant() tenantId: string) {
    return this.orders.findAllForTenant(tenantId);
  }

  @Get('v1/orders/:id')
  findOne(@CurrentTenant() tenantId: string, @Param('id') id: string) {
    return this.orders.findByIdForTenant(id, tenantId);
  }

  @Public()
  @Get('v1/public/orders/:id')
  findPublic(@Param('id') id: string) {
    return this.orders.findPublic(id);
  }
}
