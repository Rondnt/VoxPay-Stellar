import { IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateRecipientDto {
  @IsString()
  alias!: string;

  @IsString()
  stellarAddress!: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  defaultShare?: number;
}
