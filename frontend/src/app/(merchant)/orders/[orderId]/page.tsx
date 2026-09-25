import { OrderDetail } from "@/features/orders/order-detail";
export default async function OrderPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;
  return <OrderDetail key={orderId} orderId={orderId} />;
}
