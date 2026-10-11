import { IsNumber, Max, Min } from 'class-validator';

export class SetReserveConfigDto {
  @IsNumber()
  @Min(0)
  @Max(50)
  reservePercentage!: number;
}
