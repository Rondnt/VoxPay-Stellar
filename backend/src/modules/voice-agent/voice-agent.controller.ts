import { Body, Controller, Param, Post, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiTags } from '@nestjs/swagger';
import { CurrentTenant } from '../../common/decorators/current-tenant.decorator.js';
import { ConfirmVoiceCommandDto } from './dto/confirm-voice-command.dto.js';
import { VoiceAgentService } from './voice-agent.service.js';

@ApiTags('voice-agent')
@Controller('v1/voice/commands')
export class VoiceAgentController {
  constructor(private readonly voiceAgent: VoiceAgentService) {}

  @Post()
  @UseInterceptors(FileInterceptor('audio'))
  create(@CurrentTenant() tenantId: string, @UploadedFile() audio?: Express.Multer.File) {
    return this.voiceAgent.createCommand(tenantId, audio);
  }

  @Post(':id/confirm')
  confirm(
    @CurrentTenant() tenantId: string,
    @Param('id') id: string,
    @Body() dto: ConfirmVoiceCommandDto,
  ) {
    return this.voiceAgent.confirm(tenantId, id, dto);
  }
}
