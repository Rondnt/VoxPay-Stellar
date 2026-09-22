import { IsString } from 'class-validator';

export class SubmitOperatorAuthDto {
  @IsString()
  signedXdr!: string;
}
