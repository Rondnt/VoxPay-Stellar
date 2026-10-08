"use client";
import { useRef, useState } from "react";
import { UserRound, Info, Wallet, ShieldCheck, ArrowRight } from "lucide-react";
import { VoxiScene, type VoxiPose } from "@/components/voxi";
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
      if (value !== merchant?.stellarAddress) {
        if (merchant?.operatorAuthorized)
          throw new Error(
            "Esta cuenta no corresponde al negocio. Selecciona la wallet registrada.",
          );
        await apiClient.patch<Merchant>("/v1/merchants/wallet", {
          stellarAddress: value,
        });
        await refresh();
      }
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
  const pose: VoxiPose = confirmed
    ? "celebrating"
    : failure
      ? "confused"
      : stage === "review"
        ? "authorizing"
        : stage === "signing" || stage === "uncertain"
          ? "waiting"
          : busy
            ? "thinking"
            : "presenting";
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
      <Card className="wallet-summary">
        <div className="row between">
          <div className="row">
            <h2>Mi negocio</h2>
          </div>
          <span
            className={"badge " + (confirmed ? "badge-paid" : "badge-pending")}
          >
            {confirmed ? "Operador autorizado" : "Autorización pendiente"}
          </span>
        </div>
        <div className="wallet-data">
          <div>
            <UserRound size={20} aria-hidden="true" />
            <small>Cuenta registrada ·</small>
            <strong>
              {merchant?.stellarAddress
                ? shortAddress(merchant.stellarAddress)
                : "Sin wallet registrada"}
            </strong>
          </div>
          <div>
            <Info size={20} aria-hidden="true" />
            <small>Red ·</small>
            <strong>Stellar Testnet</strong>
          </div>
        </div>
        {address && <small>Wallet conectada · {shortAddress(address)}</small>}
      </Card>
      <Card className="wallet-state">
        <VoxiScene pose={pose} />
        <div className="stack">
          <h2>{title}</h2>
          <p>
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
                        : "Conecta la wallet que vas a usar para tu negocio. La primera vez que conectes queda registrada como tu cuenta; después no se podrá cambiar. La conexión no autoriza todavía al operador."}
          </p>
          {failure && <Notice error>{failure}</Notice>}
          {confirmed ? (
            <>
              <ButtonLink href="/pos">
                Continuar al POS
                <ArrowRight size={22} aria-hidden="true" />
              </ButtonLink>
            </>
          ) : stage === "uncertain" ? (
            <Button onClick={refresh}>Consultar estado</Button>
          ) : stage === "review" ? (
            <>
              <Button onClick={authorize}>
                Autorizar operador
                <ShieldCheck size={22} aria-hidden="true" />
              </Button>
              <Button variant="secondary" onClick={connect}>
                Cambiar wallet
              </Button>
            </>
          ) : (
            <Button disabled={!merchant} busy={busy} onClick={connect}>
              {!busy && <Wallet size={22} aria-hidden="true" />}
              {busy
                ? stage === "connecting"
                  ? "Conectando…"
                  : "Esperando confirmación…"
                : "Conectar wallet"}
            </Button>
          )}
          <TransactionLink hash={hash} />
        </div>
      </Card>
      <Notice>
        La wallet del negocio y la wallet del cliente cumplen funciones
        distintas.
      </Notice>
      <Footer />
    </>
  );
}
