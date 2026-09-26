// Contracts verified against backend/src and plan-desarrollo.md; not generated OpenAPI.
export type OrderStatus = "PENDING" | "PAID" | "CANCELLED";
export interface Merchant {
  id: string;
  tenantId: string;
  stellarAddress: string;
  operatorAuthorized: boolean;
}
export interface Recipient {
  id: string;
  alias: string;
  stellarAddress: string;
  defaultShare?: string | null;
}
export interface Split {
  recipientAlias: string;
  stellarAddress?: string;
  amount: number | string;
}
export interface PublicOrder {
  id: string;
  orderRef: string;
  amount: string;
  status: OrderStatus;
  payTxHash: string | null;
}
export interface Order extends PublicOrder {
  merchantId: string;
  splitsJson: Split[];
  createTxHash: string | null;
  createdAt: string;
}
export interface DailyAnalytics {
  totalAmount: string;
  count: number;
  from: string;
  to: string;
}
export interface VoiceConfirmation {
  commandId: string;
  transcript: string;
  intent: unknown;
  status?: string;
  audioBase64?: string;
}
export interface ConfirmableIntent {
  orderRef: string;
  amount: number;
  splits: Split[];
}
