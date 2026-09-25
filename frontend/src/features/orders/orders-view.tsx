"use client";
import { useState } from "react";
import { Search } from "lucide-react";
import {
  Button,
  ButtonLink,
  EmptyState,
  Footer,
  Loading,
  PageHeading,
  StatusBadge,
} from "@/components/ui";
import { useResource } from "@/hooks/use-resource";
import { ApiError, errorMessage } from "@/services/api-client";
import { formatDate, money } from "@/lib/domain";
import type { Order, OrderStatus } from "@/types/domain";

export function OrdersView() {
  const { data, loading, error, refresh } = useResource<Order[]>(
    "/v1/orders",
    30_000,
  );
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState<OrderStatus | "">("");
  const orders = (Array.isArray(data) ? data : []).filter(
    (o) =>
      o.orderRef
        .toLocaleLowerCase()
        .includes(query.trim().toLocaleLowerCase()) &&
      (!status || o.status === status),
  );
  return (
    <>
      <PageHeading
        title="Pedidos"
        description="Consulta el estado de tus cobros."
        action={
          <ButtonLink secondary href="/pos">
            Nuevo cobro
          </ButtonLink>
        }
      />
      <div className="filters">
        <div className="search-field">
          <input
            aria-label="Buscar por número de pedido"
            placeholder="Buscar por número de pedido"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <Search size={18} aria-hidden="true" />
        </div>
        <select
          aria-label="Filtrar por estado"
          value={status}
          onChange={(e) => setStatus(e.target.value as OrderStatus | "")}
        >
          <option value="">Todos los estados</option>
          <option value="PENDING">Pendiente</option>
          <option value="PAID">Pagado</option>
          <option value="CANCELLED">Cancelado</option>
        </select>
      </div>
      {loading && !data ? (
        <Loading label="Cargando pedidos" />
      ) : error ? (
        <EmptyState
          title="No pudimos cargar tus pedidos"
          action={<Button onClick={refresh}>Reintentar</Button>}
        >
          {error instanceof ApiError && error.status === 404
            ? "El listado de pedidos todavía no está disponible en la API. Puedes abrir un pedido desde el enlace del POS."
            : errorMessage(error)}
        </EmptyState>
      ) : !orders.length ? (
        <EmptyState
          title={
            query || status ? "No encontramos pedidos" : "Aún no tienes pedidos"
          }
          action={
            query || status ? (
              <Button
                variant="secondary"
                onClick={() => {
                  setQuery("");
                  setStatus("");
                }}
              >
                Limpiar filtros
              </Button>
            ) : (
              <ButtonLink href="/pos">Nuevo cobro</ButtonLink>
            )
          }
        >
          {query || status
            ? "Prueba con otro número o estado."
            : "Crea tu primer cobro por voz para verlo aquí."}
        </EmptyState>
      ) : (
        <div className="orders-table" role="table" aria-label="Pedidos">
          <div className="order-header" role="row">
            {["Pedido", "Fecha", "Importe", "Estado", "Acciones"].map((x) => (
              <span role="columnheader" key={x}>
                {x}
              </span>
            ))}
          </div>
          {orders.map((o) => (
            <div className="order-row" role="row" key={o.id}>
              <div role="cell" className="identity">
                <strong>Pedido {o.orderRef}</strong>
                <span className="mobile-date">{formatDate(o.createdAt)}</span>
              </div>
              <span role="cell" className="date">
                {formatDate(o.createdAt)}
              </span>
              <strong role="cell" className="order-total">
                {money(o.amount)} USDC
              </strong>
              <StatusBadge status={o.status} />
              <ButtonLink
                secondary
                href={`/orders/${encodeURIComponent(o.id)}`}
              >
                Ver detalle
              </ButtonLink>
            </div>
          ))}
        </div>
      )}
      <div className="row between wrap">
        <p>{!error && data ? `${orders.length} pedidos` : ""}</p>
        <Footer />
      </div>
    </>
  );
}
