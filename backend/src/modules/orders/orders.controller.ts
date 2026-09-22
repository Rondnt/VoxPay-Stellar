import { Controller, Get, Param } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { Public } from '../../common/decorators/public.decorator.js';
import { OrdersService } from './orders.service.js';

@ApiTags('orders')
@Controller()
export class OrdersController {
  constructor(private readonly orders: OrdersService) {}

  @Get('v1/orders/:id')
  findOne(@Param('id') id: string) {
    return this.orders.findById(id);
  }

  @Public()
  @Get('v1/public/orders/:id')
  findPublic(@Param('id') id: string) {
    return this.orders.findPublic(id);
  }
}
