import { Body, Controller, Delete, Get, HttpCode, HttpStatus, Param, Patch, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator.js';
import { CreateRecipientDto } from './dto/create-recipient.dto.js';
import { UpdateRecipientDto } from './dto/update-recipient.dto.js';
import { RecipientsService } from './recipients.service.js';

@ApiTags('recipients')
@Controller('v1/recipients')
export class RecipientsController {
  constructor(private readonly recipients: RecipientsService) {}

  @Get()
  list(@CurrentTenant() tenantId: string) {
    return this.recipients.list(tenantId);
  }

  @Post()
  create(@CurrentTenant() tenantId: string, @Body() dto: CreateRecipientDto) {
    return this.recipients.create(tenantId, dto);
  }

  @Patch(':id')
  update(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: UpdateRecipientDto,
  ) {
    return this.recipients.update(tenantId, id, dto);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  async remove(@CurrentTenant() tenantId: string, @Param('id') id: string): Promise<void> {
    await this.recipients.remove(tenantId, id);
  }
}
