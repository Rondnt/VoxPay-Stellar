import { PartialType } from '@nestjs/swagger';
import { CreateRecipientDto } from './create-recipient.dto.js';

export class UpdateRecipientDto extends PartialType(CreateRecipientDto) {}
