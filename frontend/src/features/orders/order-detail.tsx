"use client";
import {
  Amount,
  Button,
  ButtonLink,
  Card,
  EmptyState,
  Footer,
  Loading,
  PageHeading,
  Splits,
  StatusBadge,
  TransactionLink,
} from "@/components/ui";
import { useResource } from "@/hooks/use-resource";
import { ApiError, errorMessage } from "@/services/api-client";
import { formatDate } from "@/lib/domain";
import type { Order } from "@/types/domain";
import { useMerchant } from "@/components/merchant-shell";
export function OrderDetail({ orderId }: { orderId: string }) {
  const { merchant } = useMerchant();
  const {
    data: order,
    error,
    loading,
    refresh,
  } = useResource<Order>(`/v1/orders/${encodeURIComponent(orderId)}`, 15_000);
  if (order && (!merchant || order.merchantId !== merchant.id))
    return (
      <EmptyState title="Pedido no disponible">
        No se pudo verificar que este pedido pertenezca a tu negocio.
      </EmptyState>
    );
  return (
    <>
      <PageHeading
        title="Detalle del pedido"
        description="Consulta el importe, el reparto y el estado del cobro."
      />
      <div>
        <ButtonLink href="/orders" secondary>
          Volver a pedidos
        </ButtonLink>
      </div>
      {loading && !order ? (
        <Loading label="Cargando pedido" />
      ) : error ? (
        <EmptyState
          title={
            error instanceof ApiError && error.status === 404
              ? "Pedido no disponible"
              : "No pudimos cargar el pedido"
          }
          action={<Button onClick={refresh}>Reintentar</Button>}
        >
          {errorMessage(error)}
        </EmptyState>
      ) : (
        order && (
          <Card className="order-detail stack gap-24">
            <div className="row between wrap">
              <h2>Pedido {order.orderRef}</h2>
              <StatusBadge status={order.status} />
            </div>
            <p>{formatDate(order.createdAt)}</p>
            <div className="stack">
              <p>Total del pedido</p>
              <Amount value={order.amount} />
            </div>
            <hr />
            <Splits splits={order.splitsJson ?? []} amount={order.amount} />
            <hr />
            {order.status === "PENDING" && (
              <>
                <p>El cobro aún no tiene un pago confirmado.</p>
                {order.createTxHash ? (
                  <ButtonLink
                    href={`/pos?order=${encodeURIComponent(order.id)}`}
                  >
                    Mostrar QR de pago
                  </ButtonLink>
                ) : (
                  <p>Estamos esperando que el cobro se registre en Stellar.</p>
                )}
              </>
            )}
            {order.status === "CANCELLED" && (
              <p>Este pedido fue cancelado. No admite nuevos pagos.</p>
            )}
            {order.status === "PAID" && <p>El pago está confirmado.</p>}
            <TransactionLink
              hash={order.payTxHash}
              label="Ver transacción de pago"
            />
            <TransactionLink
              hash={order.createTxHash}
              label="Ver creación del cobro"
            />
          </Card>
        )
      )}
      <Footer />
    </>
  );
}
