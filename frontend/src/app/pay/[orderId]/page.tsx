import { PaymentView } from "@/features/payments/payment-view";
export default async function PayPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  return <PaymentView key={orderId} orderId={orderId} />;
}
