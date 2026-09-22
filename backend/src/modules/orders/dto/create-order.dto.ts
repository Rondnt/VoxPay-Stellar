import { Type } from 'class-transformer';
import { IsArray, IsNumber, IsPositive, IsString, ValidateNested } from 'class-validator';

export class OrderSplitDto {
  @IsString()
  recipientAlias!: string;

  @IsNumber()
  @IsPositive()
  amount!: number;
}

/** Payload interno usado por voice-agent al confirmar una intención create_order. */
export class CreateOrderDto {
  @IsString()
  orderRef!: string;

  @IsNumber()
  @IsPositive()
  amount!: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => OrderSplitDto)
  splits!: OrderSplitDto[];
}
