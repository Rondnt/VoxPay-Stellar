"use client";
import { useRef, useState } from "react";
import { CheckCircle, LoaderCircle } from "lucide-react";
import {
  Amount,
  Brand,
  Button,
  Footer,
  NetworkBadge,
  Notice,
  TransactionLink,
} from "@/components/ui";
import { useResource } from "@/hooks/use-resource";
import { apiClient, ApiError, errorMessage } from "@/services/api-client";
import { shortAddress } from "@/lib/domain";
import type { PublicOrder } from "@/types/domain";

type Stage =
  | "connect"
  | "connecting"
  | "review"
  | "building"
  | "signing"
  | "submitting"
  | "pending";
export function PaymentView({ orderId }: { orderId: string }) {
  const path = `/v1/public/orders/${encodeURIComponent(orderId)}`;
  const {
    data: order,
    loading,
    error,
    refresh,
    setData,
  } = useResource<PublicOrder>(path, 5_000);
  const [address, setAddress] = useState("");
  const [stage, setStage] = useState<Stage>("connect");
  const [failure, setFailure] = useState("");
  const [help, setHelp] = useState(false);
  const [hash, setHash] = useState("");
  const locked = useRef(false);
  const busy = ["connecting", "building", "signing", "submitting"].includes(
    stage,
  );
  async function connect() {
    if (locked.current) return;
    locked.current = true;
    setStage("connecting");
    setFailure("");
    setHelp(false);
    try {
      const wallet = await import("@/lib/wallet");
      const value = await wallet.connectWallet();
      await wallet.assertWallet(value);
      setAddress(value);
      setStage("review");
    } catch (err) {
      setFailure(errorMessage(err));
      setStage("connect");
    } finally {
      locked.current = false;
    }
  }
  async function pay() {
    if (locked.current || !order || !address || stage !== "review") return;
    locked.current = true;
    setFailure("");
    let submitted = false;
    try {
      setStage("building");
      const fresh = await apiClient.get<PublicOrder>(path);
      setData(fresh);
      if (fresh.status !== "PENDING") {
        setStage("review");
        return;
      }
      if (fresh.amount !== order.amount || fresh.orderRef !== order.orderRef) {
        setFailure(
          "El pedido cambió. Revisa de nuevo el importe antes de pagar.",
        );
        setStage("review");
        return;
      }
      const wallet = await import("@/lib/wallet");
      await wallet.assertWallet(address);
      const { xdr } = await apiClient.post<{ xdr: string }>(`${path}/tx`, {
        payerPublicKey: address,
      });
      setStage("signing");
      const signedXdr = await wallet.signXdr(xdr, address);
      setStage("submitting");
      submitted = true;
      const result = await apiClient.post<{ hash: string }>(`${path}/submit`, {
        signedXdr,
      });
      setHash(result.hash);
      setStage("pending");
      await refresh();
    } catch (err) {
      setFailure(errorMessage(err));
      setStage(submitted ? "pending" : "review");
    } finally {
      locked.current = false;
    }
  }
  const paid = order?.status === "PAID";
  const cancelled = order?.status === "CANCELLED";
  const unavailable = error instanceof ApiError && error.status === 404;
  let title = "Paga tu pedido",
    description = "Revisa el importe y conecta tu wallet.";
  if (loading && !order) {
    title = "Cargando pedido";
    description = "Estamos consultando el importe y el estado.";
  } else if (unavailable) {
    title = "Pedido no disponible";
    description = "Revisa el enlace o pide un nuevo QR al negocio.";
  } else if (error && !order) {
    title = "No pudimos cargar el pedido";
    description = "Revisa tu conexión e inténtalo de nuevo.";
  } else if (paid) {
    title = "Pago confirmado";
    description =
      "Tu pago se completó correctamente. Puedes cerrar esta pantalla.";
  } else if (cancelled) {
    title = "Pedido cancelado";
    description = "Este cobro ya no admite pagos. Pide un nuevo QR al negocio.";
  } else if (stage === "review") {
    title = "Revisa tu pago";
    description = "Confirma el importe. La firma se realizará en tu wallet.";
  } else if (stage === "signing") {
    title = "Esperando firma";
    description = "Abre tu wallet y revisa la transacción antes de firmar.";
  } else if (stage === "building" || stage === "submitting") {
    title = "Procesando pago";
    description = "No cierres esta pantalla ni vuelvas a enviar el pago.";
  } else if (stage === "pending") {
    title = "Verificando el pago";
    description =
      "El envío puede haberse realizado. Consulta el estado; no vuelvas a pagar.";
  }
  return (
    <>
      <header className="public-header">
        <Brand />
        <NetworkBadge />
      </header>
      <main className="payment-main">
        <div className="payment-grid">
          <section className="payment-summary">
            <h2>Pago a negocio</h2>
            <p>
              Pedido {order?.orderRef ?? "—"} · <strong>Total a pagar</strong>
            </p>
            {order && !unavailable ? (
              <Amount value={order.amount} />
            ) : (
              <div className="amount">
                <strong>—</strong>
                <span>USDC</span>
              </div>
            )}
          </section>
          <section className="card payment-action" aria-live="polite">
            <div className="stack">
              {paid && <CheckCircle size={40} aria-hidden="true" />}
              <h1>{title}</h1>
              <p>{description}</p>
            </div>
            {address && !paid && !cancelled && (
              <small>Wallet · {shortAddress(address)}</small>
            )}
            {failure && !paid && <Notice error>{failure}</Notice>}
            {!!error && order && !unavailable && (
              <Notice error>
                No pudimos actualizar el pedido. Comprueba el estado antes de
                continuar.
              </Notice>
            )}
            <div className="stack">
              {!order && loading ? (
                <LoaderCircle className="spin" aria-label="Cargando" />
              ) : unavailable || cancelled ? null : !order ? (
                <Button onClick={refresh}>Reintentar</Button>
              ) : paid ? (
                <TransactionLink hash={order.payTxHash ?? hash} />
              ) : stage === "pending" ? (
                <>
                  <Button onClick={refresh} busy={loading}>
                    Consultar estado
                  </Button>
                  <TransactionLink hash={hash} />
                </>
              ) : stage === "review" ? (
                <>
                  <Button onClick={pay} disabled={!!error}>
                    Confirmar y pagar
                  </Button>
                  <Button variant="secondary" onClick={connect}>
                    Cambiar wallet
                  </Button>
                </>
              ) : (
                <>
                  <Button busy={busy} disabled={!!error} onClick={connect}>
                    {busy ? "Esperando confirmación…" : "Conectar wallet"}
                  </Button>
                  {!busy && (
                    <Button variant="secondary" onClick={() => setHelp(!help)}>
                      ¿No puedes conectar tu wallet?
                    </Button>
                  )}
                </>
              )}
              {help && (
                <Notice>
                  Usa Freighter o xBull en un navegador compatible. Desbloquea
                  tu wallet y selecciona Stellar Testnet. Nunca compartas tu
                  clave secreta.
                </Notice>
              )}
              {!paid && (
                <p className="center">No necesitas una cuenta de VoxPay.</p>
              )}
            </div>
          </section>
        </div>
        <Footer />
      </main>
    </>
  );
}
