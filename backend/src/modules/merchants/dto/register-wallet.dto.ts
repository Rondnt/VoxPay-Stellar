import { IsString } from 'class-validator';

export class RegisterWalletDto {
  @IsString()
  stellarAddress!: string;
}
