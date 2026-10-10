"use client";
import { useEffect } from "react";
import { Store, ClipboardList, RefreshCw } from "lucide-react";
import { VoxiScene } from "@/components/voxi";
import { useMerchant } from "@/components/merchant-shell";
import {
  Button,
  ButtonLink,
  Card,
  EmptyState,
  Footer,
  Loading,
  Notice,
  PageHeading,
} from "@/components/ui";
import { useResource } from "@/hooks/use-resource";
import { ApiError, errorMessage } from "@/services/api-client";
import { isDailyAnalytics, money } from "@/lib/domain";
import { connectNotifications, onEvent } from "@/lib/socket";
import type { DailyAnalytics } from "@/types/domain";
export function DashboardView() {
  const { merchant } = useMerchant();
  const { data, loading, error, refresh } = useResource<DailyAnalytics>(
    "/v1/analytics/today",
    30_000,
    isDailyAnalytics,
  );
  useEffect(() => {
    if (!merchant) return;
    const socket = connectNotifications(merchant.id);
    const off = onEvent(socket, (event) => {
      if (event === "order:paid") void refresh();
    });
    socket.connect();
    return () => {
      off();
      socket.disconnect();
    };
  }, [merchant, refresh]);
  return (
    <>
      <PageHeading
        title="Dashboard"
        description="Resumen de tus cobros de hoy."
      />
      <div className="row between wrap dashboard-toolbar">
        <p>
          {data
            ? `Hoy · ${new Date(data.from).toLocaleDateString("es-PE", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" })} (UTC)`
            : "Hoy (UTC)"}
        </p>
        <div className="row wrap dashboard-actions">
          <ButtonLink href="/pos">Nuevo cobro</ButtonLink>
          <ButtonLink secondary href="/orders">
            Ver pedidos
          </ButtonLink>
          <Button variant="secondary" onClick={refresh} busy={loading}>
            Actualizar{!loading && <RefreshCw size={20} aria-hidden="true" />}
          </Button>
        </div>
      </div>
      {loading && !data ? (
        <Loading label="Cargando resumen" />
      ) : error && !data ? (
        <EmptyState
          title="No pudimos cargar el resumen"
        >
          {error instanceof ApiError && error.status === 404
            ? "Las métricas del día todavía no están disponibles en la API."
            : errorMessage(error)}
        </EmptyState>
      ) : (
        data && (
          <>
            {!!error && (
              <Notice error title="No se pudo actualizar">
                Mostramos el último resumen disponible. Puedes volver a
                intentarlo.
              </Notice>
            )}
            <div className="two-columns">
              <Card className="metric">
                <div className="metric-label">
                  <p>Total cobrado hoy</p>
                  <Store size={28} aria-hidden="true" />
                </div>
                <strong className="metric-value">
                  {money(data.totalAmount)} <span>USDC</span>
                </strong>
              </Card>
              <Card className="metric">
                <div className="metric-label">
                  <p>Pedidos pagados</p>
                  <ClipboardList size={28} aria-hidden="true" />
                </div>
                <strong className="metric-value">{data.count}</strong>
              </Card>
            </div>
            <Notice
              success={!!data.count}
              title={
                data.count
                  ? "Solo pagos confirmados"
                  : "Aún no hay pagos confirmados hoy"
              }
            >
              El importe incluye el reparto entre tu negocio y destinatarios.
            </Notice>
            {!data.count && (
              <Card className="state-card">
                <VoxiScene pose="greeting" />
                <h2>Tu próximo cobro empieza aquí</h2>
                <p>Crea un cobro por voz para comenzar el día.</p>
              </Card>
            )}
            <small>
              Actualizado:{" "}
              {new Date(data.to).toLocaleTimeString("es-PE", {
                hour: "2-digit",
                minute: "2-digit",
                timeZone: "UTC",
              })}{" "}
              UTC
            </small>
          </>
        )
      )}
      <Footer>
        <p>El día se calcula de 00:00 a 23:59 UTC.</p>
      </Footer>
    </>
  );
}
