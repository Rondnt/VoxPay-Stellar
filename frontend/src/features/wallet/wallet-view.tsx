"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { UserRound, Info, Wallet, ShieldCheck, ArrowRight, Landmark } from "lucide-react";
import { Voxi, VoxiScene, type VoxiPose } from "@/components/voxi";
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
import { formatDate, money, shortAddress } from "@/lib/domain";
import type { Merchant, ReserveWithdrawal } from "@/types/domain";

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
  const [reservePercentageInput, setReservePercentageInput] = useState("0");
  const [savingReserve, setSavingReserve] = useState(false);
  const [reserveFailure, setReserveFailure] = useState("");
  const [reserveSaved, setReserveSaved] = useState(false);
  const reserveLocked = useRef(false);
  const [reserveBalance, setReserveBalance] = useState<number | null>(null);
  const [loadingBalance, setLoadingBalance] = useState(true);
  const [withdrawAmount, setWithdrawAmount] = useState("");
  const [withdrawStage, setWithdrawStage] = useState<
    "idle" | "signing" | "submitting" | "uncertain"
  >("idle");
  const [withdrawFailure, setWithdrawFailure] = useState("");
  const [withdrawHash, setWithdrawHash] = useState("");
  const withdrawLocked = useRef(false);
  const [withdrawalsTotal, setWithdrawalsTotal] = useState(0);
  const [withdrawalItems, setWithdrawalItems] = useState<ReserveWithdrawal[]>([]);
  const [loadingWithdrawals, setLoadingWithdrawals] = useState(true);
  useEffect(() => {
    // No hay forma de evitar el efecto acá: es un input editable (el comerciante lo puede estar
    // tipeando) que además tiene que re-sincronizarse con el valor real apenas `merchant` carga o
    // se refresca tras guardar -- no es un valor puramente derivado de props en cada render.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (merchant) setReservePercentageInput(String(merchant.reservePercentage));
  }, [merchant]);
  const reserveRequestId = useRef(0);
  const loadReserveBalance = useCallback(() => {
    if (!merchant?.operatorAuthorized) return;
    const requestId = ++reserveRequestId.current;
    apiClient
      .get<{ balance: number }>("/v1/merchants/reserve/balance")
      .then((res) => {
        if (reserveRequestId.current === requestId) setReserveBalance(res.balance);
      })
      .catch(() => {})
      .finally(() => {
        if (reserveRequestId.current === requestId) setLoadingBalance(false);
      });
  }, [merchant?.operatorAuthorized]);
  useEffect(() => {
    loadReserveBalance();
  }, [loadReserveBalance]);
  const withdrawalsRequestId = useRef(0);
  const loadReserveWithdrawals = useCallback(() => {
    if (!merchant?.operatorAuthorized) return;
    const requestId = ++withdrawalsRequestId.current;
    apiClient
      .get<{ total: number; items: ReserveWithdrawal[] }>(
        "/v1/merchants/reserve/withdrawals",
      )
      .then((res) => {
        if (withdrawalsRequestId.current === requestId) {
          setWithdrawalsTotal(res.total);
          setWithdrawalItems(res.items);
        }
      })
      .catch(() => {})
      .finally(() => {
        if (withdrawalsRequestId.current === requestId) setLoadingWithdrawals(false);
      });
  }, [merchant?.operatorAuthorized]);
  useEffect(() => {
    loadReserveWithdrawals();
  }, [loadReserveWithdrawals]);
  async function saveReserveConfig() {
    if (reserveLocked.current) return;
    reserveLocked.current = true;
    setSavingReserve(true);
    setReserveFailure("");
    setReserveSaved(false);
    try {
      const value = Number(reservePercentageInput);
      if (!Number.isFinite(value) || value < 0 || value > 50) {
        throw new Error("Ingresa un porcentaje entre 0 y 50.");
      }
      await apiClient.patch<Merchant>("/v1/merchants/reserve", {
        reservePercentage: value,
      });
      await refresh();
      setReserveSaved(true);
    } catch (err) {
      setReserveFailure(errorMessage(err));
    } finally {
      setSavingReserve(false);
      reserveLocked.current = false;
    }
  }
  async function refreshReserveBalance() {
    const res = await apiClient.get<{ balance: number }>(
      "/v1/merchants/reserve/balance",
    );
    setReserveBalance(res.balance);
  }
  async function withdrawReserve() {
    if (withdrawLocked.current || !merchant?.stellarAddress) return;
    withdrawLocked.current = true;
    setWithdrawFailure("");
    let submitted = false;
    try {
      const amount = Number(withdrawAmount);
      if (!Number.isFinite(amount) || amount <= 0) {
        throw new Error("Ingresa un monto válido a retirar.");
      }
      setWithdrawStage("signing");
      const wallet = await import("@/lib/wallet");
      await wallet.assertWallet(merchant.stellarAddress);
      const { xdr } = await apiClient.post<{ xdr: string }>(
        "/v1/merchants/reserve/withdraw/tx",
        { amount },
      );
      const signedXdr = await wallet.signXdr(xdr, merchant.stellarAddress);
      setWithdrawStage("submitting");
      submitted = true;
      const result = await apiClient.post<{ hash: string }>(
        "/v1/merchants/reserve/withdraw/submit",
        { amount, signedXdr },
      );
      setWithdrawHash(result.hash);
      setWithdrawAmount("");
      await refreshReserveBalance();
      loadReserveWithdrawals();
      setWithdrawStage("idle");
    } catch (err) {
      setWithdrawFailure(errorMessage(err));
      setWithdrawStage(submitted ? "uncertain" : "idle");
    } finally {
      withdrawLocked.current = false;
    }
  }
  async function connect(options: { allowChange?: boolean } = {}) {
    if (locked.current) return;
    locked.current = true;
    setFailure("");
    setStage("connecting");
    try {
      const wallet = await import("@/lib/wallet");
      const value = await wallet.connectWallet();
      await wallet.assertWallet(value);
      if (value !== merchant?.stellarAddress) {
        if (merchant?.operatorAuthorized && !options.allowChange)
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
                        : "Conecta la wallet que vas a usar para tu negocio. La primera vez que conectes queda registrada como tu cuenta; después vas a poder cambiarla desde esta pantalla. La conexión no autoriza todavía al operador."}
          </p>
          {failure && <Notice error>{failure}</Notice>}
          {confirmed ? (
            <>
              <ButtonLink href="/pos">
                Continuar al POS
                <ArrowRight size={22} aria-hidden="true" />
              </ButtonLink>
              <Button
                variant="secondary"
                busy={busy}
                disabled={loadingBalance || !!reserveBalance}
                onClick={() => connect({ allowChange: true })}
              >
                Cambiar wallet del negocio
              </Button>
              {!loadingBalance && !!reserveBalance && (
                <small>
                  Retirá el saldo reservado con la wallet actual antes de
                  cambiarla.
                </small>
              )}
            </>
          ) : stage === "uncertain" ? (
            <Button onClick={refresh}>Consultar estado</Button>
          ) : stage === "review" ? (
            <>
              <Button onClick={authorize}>
                Autorizar operador
                <ShieldCheck size={22} aria-hidden="true" />
              </Button>
              <Button variant="secondary" onClick={() => connect()}>
                Cambiar wallet
              </Button>
            </>
          ) : (
            <Button disabled={!merchant} busy={busy} onClick={() => connect()}>
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
      {confirmed && (
        <Card className="stack wallet-reserve">
          <div className="wallet-reserve-intro">
            <div className="stack">
              <div className="row">
                <Landmark size={22} aria-hidden="true" />
                <h2>Reserva automática</h2>
              </div>
              <p>
                Aparta un % de cada cobro nuevo, bloqueado en el contrato hasta
                que lo retires con esta misma wallet — útil para ir guardando el
                pago a cuenta de SUNAT.
              </p>
            </div>
            <Voxi pose="accountant" className="wallet-reserve-voxi" />
          </div>
          <div className="row">
            <input
              type="number"
              min={0}
              max={50}
              step={0.5}
              value={reservePercentageInput}
              onChange={(e) => setReservePercentageInput(e.target.value)}
              aria-label="Porcentaje de reserva"
            />
            <span>%</span>
            <Button busy={savingReserve} onClick={saveReserveConfig}>
              Guardar
            </Button>
          </div>
          {reserveFailure && <Notice error>{reserveFailure}</Notice>}
          {reserveSaved && <Notice success>Porcentaje actualizado.</Notice>}
          <hr />
          <div className="row between">
            <span>Saldo reservado</span>
            <strong>
              {loadingBalance ? "…" : money(reserveBalance ?? 0)} USDC
            </strong>
          </div>
          <div className="row">
            <input
              type="number"
              min={0}
              step="any"
              placeholder="Monto a retirar"
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(e.target.value)}
              aria-label="Monto a retirar"
              disabled={!reserveBalance}
            />
            <Button
              variant="secondary"
              busy={withdrawStage === "signing" || withdrawStage === "submitting"}
              disabled={!reserveBalance}
              onClick={withdrawReserve}
            >
              Retirar
            </Button>
          </div>
          {withdrawStage === "uncertain" && (
            <Button
              variant="secondary"
              onClick={() => {
                void refreshReserveBalance();
                setWithdrawStage("idle");
              }}
            >
              Consultar estado
            </Button>
          )}
          {withdrawFailure && <Notice error>{withdrawFailure}</Notice>}
          <TransactionLink hash={withdrawHash} />
          <hr />
          <div className="row between">
            <span>Retirado histórico para SUNAT</span>
            <strong>
              {loadingWithdrawals ? "…" : money(withdrawalsTotal)} USDC
            </strong>
          </div>
          {!loadingWithdrawals && withdrawalItems.length === 0 && (
            <small>Todavía no retiraste nada de la reserva.</small>
          )}
          {withdrawalItems.length > 0 && (
            <div className="stack">
              {withdrawalItems.map((item) => (
                <div className="row between" key={item.txHash}>
                  <small>{formatDate(item.createdAt)}</small>
                  <span>{money(item.amount)} USDC</span>
                  <TransactionLink hash={item.txHash} label="Ver tx" />
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
      <Notice>
        La wallet del negocio y la wallet del cliente cumplen funciones
        distintas.
      </Notice>
      <Footer />
    </>
  );
}
