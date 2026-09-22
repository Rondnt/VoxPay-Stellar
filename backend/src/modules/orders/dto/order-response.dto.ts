export class OrderResponseDto {
  id!: string;
  orderRef!: string;
  amount!: string;
  status!: 'PENDING' | 'PAID' | 'CANCELLED';
  createTxHash!: string | null;
  payTxHash!: string | null;
  createdAt!: Date;
}
