import { IsNumber, IsPositive, IsString } from 'class-validator';

export class SubmitReserveWithdrawDto {
  @IsNumber()
  @IsPositive()
  amount!: number;

  @IsString()
  signedXdr!: string;
}
