import { IsString } from 'class-validator';

export class SubmitPaymentDto {
  @IsString()
  signedXdr!: string;
}
