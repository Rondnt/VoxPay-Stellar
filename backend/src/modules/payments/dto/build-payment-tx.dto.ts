import { IsString } from 'class-validator';

export class BuildPaymentTxDto {
  @IsString()
  payerPublicKey!: string;
}
