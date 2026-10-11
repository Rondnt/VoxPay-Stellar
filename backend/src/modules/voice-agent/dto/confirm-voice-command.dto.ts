import { Type } from 'class-transformer';
import { IsArray, IsNumber, IsOptional, IsPositive, IsString, ValidateNested } from 'class-validator';

export class ConfirmVoiceCommandSplitDto {
  @IsString()
  recipientAlias!: string;

  @IsNumber()
  @IsPositive()
  amount!: number;
}

/** El comerciante puede corregir el monto o el reparto antes de confirmar, sin volver a grabar. */
export class ConfirmVoiceCommandDto {
  @IsOptional()
  @IsNumber()
  @IsPositive()
  amount?: number;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ConfirmVoiceCommandSplitDto)
  splits?: ConfirmVoiceCommandSplitDto[];
}
