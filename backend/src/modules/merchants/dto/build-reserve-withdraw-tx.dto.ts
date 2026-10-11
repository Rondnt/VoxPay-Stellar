import { IsNumber, IsPositive } from 'class-validator';

export class BuildReserveWithdrawTxDto {
  @IsNumber()
  @IsPositive()
  amount!: number;
}
