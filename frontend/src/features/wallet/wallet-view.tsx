"use client";
import { useRef, useState } from "react";
import { useMerchant } from "@/components/merchant-shell";
import {
  Button,
  ButtonLink,
  Card,
  Footer,
  Notice,
  PageHeading,
  TransactionLink,
} from "@/components/ui";
import { apiClient, errorMessage } from "@/services/api-client";
import { shortAddress } from "@/lib/domain";
import type { Merchant } from "@/types/domain";

export function WalletView() {
  const { merchant, refresh } = useMerchant();
  const [address, setAddress] = useState("");
  const [stage, setStage] = useState<
    "idle" | "connecting" | "review" | "signing" | "submitting" | "uncertain"
  >("idle");
  const [failure, setFailure] = useState("");
  const [hash, setHash] = useState("");
  const locked = useRef(false);
  const busy = ["connecting", "signing", "submitting"].includes(stage);
  async function connect() {
    if (locked.current) return;
    locked.current = true;
    setFailure("");
    setStage("connecting");
    try {
      const wallet = await import("@/lib/wallet");
      const value = await wallet.connectWallet();
      await wallet.assertWallet(value);
      if (value !== merchant?.stellarAddress)
        throw new Error(
          "Esta cuenta no corresponde al negocio. Selecciona la wallet registrada.",
        );
      setAddress(value);
      setStage("review");
    } catch (err) {
      setFailure(errorMessage(err));
      setStage("idle");
    } finally {
      locked.current = false;
    }
  }
  async function authorize() {
    if (locked.current || !merchant || !address) return;
    locked.current = true;
    setFailure("");
    let submitted = false;
    try {
      setStage("signing");
      const current = await apiClient.get<Merchant>("/v1/merchants/me");
      if (current.operatorAuthorized) {
        await refresh();
        setStage("idle");
        return;
      }
      if (current.stellarAddress !== address)
        throw new Error(
          "La cuenta registrada cambió. Conecta la wallet correcta.",
        );
      const wallet = await import("@/lib/wallet");
      await wallet.assertWallet(address);
      const { xdr } = await apiClient.post<{ xdr: string }>(
        "/v1/merchants/operator/tx",
      );
      const signedXdr = await wallet.signXdr(xdr, address);
      setStage("submitting");
      submitted = true;
      const result = await apiClient.post<{ hash: string }>(
        "/v1/merchants/operator/submit",
        { signedXdr },
      );
      setHash(result.hash);
      await refresh();
      setStage("uncertain");
    } catch (err) {
      setFailure(errorMessage(err));
      setStage(submitted ? "uncertain" : "review");
    } finally {
      locked.current = false;
    }
  }
  const confirmed = merchant?.operatorAuthorized;
  const title = confirmed
    ? "Tu negocio está listo"
    : stage === "signing"
      ? "Confirma en tu wallet"
      : stage === "submitting"
        ? "Enviando autorización"
        : stage === "uncertain"
          ? "Comprobemos la autorización"
          : stage === "review"
            ? "Revisa la autorización"
            : "Conecta la wallet de tu negocio";
  return (
    <>
      <PageHeading
        title="Wallet del negocio"
        description="Configura la autorización para crear cobros."
      />
      <div className="two-columns">
        <Card className="stack">
          <h2>Mi negocio</h2>
          <p className="break-all">
            Cuenta registrada ·{" "}
            {merchant ? shortAddress(merchant.stellarAddress) : "Cargando…"}
          </p>
          <p>Red · Stellar Testnet</p>
          <strong>
            {confirmed ? "Operador autorizado" : "Autorización pendiente"}
          </strong>
          {address && <small>Wallet conectada · {shortAddress(address)}</small>}
        </Card>
        <div className="stack">
          <Notice title={title}>
            {confirmed
              ? "La autorización del operador está confirmada. Ya puedes continuar al POS."
              : stage === "review"
                ? "Autorizarás al operador de VoxPay para crear y cancelar cobros de tu negocio. Los clientes firman sus propios pagos."
                : stage === "signing"
                  ? "Revisa la transacción de autorización en Freighter o xBull. No cierres esta pantalla."
                  : stage === "submitting"
                    ? "Esperamos la respuesta del servidor. No vuelvas a enviar la transacción."
                    : stage === "uncertain"
                      ? "Consulta el estado antes de volver a firmar. La transacción podría haberse enviado."
                      : "Usa la cuenta de Stellar registrada para tu negocio. La conexión no autoriza todavía al operador."}
          </Notice>
          {failure && <Notice error>{failure}</Notice>}
          {confirmed ? (
            <ButtonLink href="/pos">Continuar al POS</ButtonLink>
          ) : stage === "uncertain" ? (
            <Button onClick={refresh}>Consultar estado</Button>
          ) : stage === "review" ? (
            <>
              <Button onClick={authorize}>Autorizar operador</Button>
              <Button variant="secondary" onClick={connect}>
                Cambiar wallet
              </Button>
            </>
          ) : (
            <Button disabled={!merchant} busy={busy} onClick={connect}>
              {busy
                ? stage === "connecting"
                  ? "Conectando…"
                  : "Esperando confirmación…"
                : "Conectar wallet"}
            </Button>
          )}
          <TransactionLink hash={hash} />
        </div>
      </div>
      <p>
        La wallet del negocio y la wallet del cliente cumplen funciones
        distintas.
      </p>
      <Footer />
    </>
  );
}
