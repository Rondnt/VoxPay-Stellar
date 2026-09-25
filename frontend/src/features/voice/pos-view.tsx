"use client";
import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { CheckCircle, Clock, Copy, LoaderCircle, Square } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useMerchant } from "@/components/merchant-shell";
import {
  Amount,
  Button,
  ButtonLink,
  Card,
  Footer,
  Notice,
  Splits,
  TransactionLink,
} from "@/components/ui";
import { apiClient, errorMessage } from "@/services/api-client";
import { parseIntent } from "@/lib/domain";
import { connectNotifications, onEvent } from "@/lib/socket";
import type {
  ConfirmableIntent,
  Order,
  VoiceConfirmation,
} from "@/types/domain";

type Stage =
  | "idle"
  | "permission"
  | "recording"
  | "uploading"
  | "interpreting"
  | "review"
  | "creating"
  | "uncertain"
  | "qr"
  | "paid"
  | "cancelled";
export function PosView({ initialOrderId }: { initialOrderId?: string }) {
  const { merchant } = useMerchant();
  const [stage, setStage] = useState<Stage>(
    initialOrderId ? "creating" : "idle",
  );
  const [connected, setConnected] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [intent, setIntent] = useState<ConfirmableIntent | null>(null);
  const [order, setOrder] = useState<Order | null>(null);
  const [failure, setFailure] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [copied, setCopied] = useState(false);
  const [paymentUrl, setPaymentUrl] = useState("");
  const [audio, setAudio] = useState<Blob | null>(null);
  const commandId = useRef("");
  const orderId = useRef(initialOrderId ?? "");
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const mounted = useRef(true);
  const locked = useRef(false);
  const discard = useRef(false);
  const pendingEvents = useRef(new Map<string, VoiceConfirmation>());

  const checkOrder = useCallback(async () => {
    if (!orderId.current) return;
    const requestedId = orderId.current;
    try {
      const current = await apiClient.get<Order>(
        `/v1/orders/${encodeURIComponent(orderId.current)}`,
      );
      // Tenant check complements the current backend's missing order scoping.
      if (merchant && current.merchantId !== merchant.id)
        throw new Error("Este pedido no pertenece a tu negocio.");
      if (!mounted.current || requestedId !== orderId.current) return;
      setOrder(current);
      setFailure("");
      setStage(
        current.status === "PAID"
          ? "paid"
          : current.status === "CANCELLED"
            ? "cancelled"
            : current.createTxHash
              ? "qr"
              : "creating",
      );
      setPaymentUrl(
        new URL(
          `/pay/${encodeURIComponent(current.id)}`,
          window.location.origin,
        ).href,
      );
    } catch (err) {
      if (mounted.current) setFailure(errorMessage(err));
    }
  }, [merchant]);
  const acceptConfirmation = useCallback((payload: VoiceConfirmation) => {
    const parsed =
      payload.status === "UNKNOWN" ? null : parseIntent(payload.intent);
    setTranscript(payload.transcript || "");
    if (!parsed) {
      setIntent(null);
      setStage("idle");
      setFailure(
        "No pudimos interpretar un cobro válido. Repite el importe, el pedido y los destinatarios. El reparto no puede superar el total.",
      );
      return;
    }
    setIntent(parsed);
    setStage("review");
    setFailure("");
  }, []);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      discard.current = true;
      if (recorder.current?.state === "recording") recorder.current.stop();
      stream.current?.getTracks().forEach((t) => t.stop());
    };
  }, []);
  useEffect(() => {
    if (!merchant) return;
    const socket = connectNotifications(merchant.id);
    socket.on("connect", () => setConnected(true));
    socket.on("disconnect", () => setConnected(false));
    socket.on("connect_error", () => setConnected(false));
    const off = onEvent(socket, (event, raw) => {
      if (!raw || typeof raw !== "object") return;
      if (event === "voice:confirmation") {
        const payload = raw as VoiceConfirmation;
        if (typeof payload.commandId !== "string") return;
        if (payload.commandId === commandId.current)
          acceptConfirmation(payload);
        else {
          pendingEvents.current.set(payload.commandId, payload);
          if (pendingEvents.current.size > 20)
            pendingEvents.current.delete(
              pendingEvents.current.keys().next().value!,
            );
        }
      }
      if (
        (event === "order:created" || event === "order:paid") &&
        (raw as { orderId?: string }).orderId === orderId.current
      )
        void checkOrder();
    });
    socket.connect();
    return () => {
      off();
      socket.disconnect();
    };
  }, [merchant, acceptConfirmation, checkOrder]);
  useEffect(() => {
    if (!initialOrderId || !merchant) return;
    orderId.current = initialOrderId;
    void checkOrder();
  }, [initialOrderId, merchant, checkOrder]);
  useEffect(() => {
    if (!["creating", "qr", "uncertain"].includes(stage) || !orderId.current)
      return;
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void checkOrder();
    }, 5000);
    return () => clearInterval(timer);
  }, [stage, checkOrder]);
  useEffect(() => {
    if (stage !== "recording") return;
    const started = Date.now();
    const timer = setInterval(() => {
      const elapsed = Math.floor((Date.now() - started) / 1000);
      setSeconds(elapsed);
      if (elapsed >= 60 && recorder.current?.state === "recording")
        recorder.current.stop();
    }, 500);
    return () => clearInterval(timer);
  }, [stage]);
  useEffect(() => {
    if (stage !== "interpreting") return;
    const timer = setTimeout(
      () =>
        setFailure(
          "La interpretación está tardando. Puedes esperar o volver a grabar; aún no se ha creado ningún cobro.",
        ),
      45_000,
    );
    return () => clearTimeout(timer);
  }, [stage]);

  async function upload(blob: Blob) {
    if (!blob.size) {
      setFailure("No se detectó audio. Vuelve a grabar.");
      setStage("idle");
      return;
    }
    if (blob.size > 12 * 1024 * 1024) {
      setFailure(
        "La grabación es demasiado grande. Graba una instrucción más corta.",
      );
      setStage("idle");
      return;
    }
    setStage("uploading");
    setFailure("");
    commandId.current = "";
    try {
      const form = new FormData();
      const extension = blob.type.includes("mp4")
        ? "mp4"
        : blob.type.includes("ogg")
          ? "ogg"
          : "webm";
      form.append("audio", blob, `cobro.${extension}`);
      const response = await apiClient.post<{ commandId: string }>(
        "/v1/voice/commands",
        form,
      );
      if (!mounted.current) return;
      commandId.current = response.commandId;
      setAudio(null);
      setStage("interpreting");
      const buffered = pendingEvents.current.get(response.commandId);
      if (buffered) {
        pendingEvents.current.delete(response.commandId);
        acceptConfirmation(buffered);
      }
    } catch (err) {
      if (mounted.current) {
        setFailure(errorMessage(err));
        setStage("idle");
      }
    }
  }
  async function record() {
    if (locked.current || !connected || !merchant?.operatorAuthorized) return;
    locked.current = true;
    setStage("permission");
    setFailure("");
    commandId.current = "";
    setIntent(null);
    setTranscript("");
    setAudio(null);
    try {
      if (
        !navigator.mediaDevices?.getUserMedia ||
        typeof MediaRecorder === "undefined"
      )
        throw new Error(
          "Tu navegador no permite grabar audio. Abre VoxPay mediante HTTPS y permite el micrófono.",
        );
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!mounted.current) {
        media.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = media;
      discard.current = false;
      const mimeType = [
        "audio/webm;codecs=opus",
        "audio/mp4",
        "audio/ogg;codecs=opus",
      ].find((type) => MediaRecorder.isTypeSupported(type));
      const instance = new MediaRecorder(
        media,
        mimeType ? { mimeType } : undefined,
      );
      recorder.current = instance;
      const chunks: Blob[] = [];
      instance.ondataavailable = (event) => {
        if (event.data.size) chunks.push(event.data);
      };
      instance.onstop = () => {
        media.getTracks().forEach((t) => t.stop());
        if (!mounted.current || discard.current) return;
        const blob = new Blob(chunks, {
          type: instance.mimeType || "audio/webm",
        });
        setAudio(blob);
        void upload(blob);
      };
      instance.onerror = () => {
        discard.current = true;
        media.getTracks().forEach((t) => t.stop());
        setFailure("No se pudo grabar el audio. Inténtalo nuevamente.");
        setStage("idle");
      };
      instance.start();
      setSeconds(0);
      setStage("recording");
    } catch (err) {
      stream.current?.getTracks().forEach((t) => t.stop());
      setFailure(
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Micrófono bloqueado. Permite su uso en tu navegador y vuelve a intentarlo."
          : errorMessage(err),
      );
      setStage("idle");
    } finally {
      locked.current = false;
    }
  }
  function cancelRecording() {
    discard.current = true;
    recorder.current?.stop();
    stream.current?.getTracks().forEach((t) => t.stop());
    setStage("idle");
  }
  async function confirm() {
    if (
      locked.current ||
      !commandId.current ||
      !intent ||
      !merchant?.operatorAuthorized
    )
      return;
    locked.current = true;
    setStage("creating");
    setFailure("");
    const confirmedCommandId = commandId.current;
    commandId.current = ""; // Ignore delayed/duplicate interpretation events after confirmation.
    try {
      const created = await apiClient.post<Order>(
        `/v1/voice/commands/${encodeURIComponent(confirmedCommandId)}/confirm`,
      );
      orderId.current = created.id;
      setOrder(created);
      window.history.replaceState(
        null,
        "",
        `/pos?order=${encodeURIComponent(created.id)}`,
      );
      await checkOrder();
    } catch (err) {
      setFailure(
        `${errorMessage(err)} Consulta Pedidos antes de crear otro cobro; la solicitud puede haberse procesado.`,
      );
      setStage("uncertain");
    } finally {
      locked.current = false;
    }
  }
  async function copyLink() {
    try {
      await navigator.clipboard.writeText(paymentUrl);
      setCopied(true);
    } catch {
      setFailure(
        "No se pudo copiar. Abre el enlace de pago y cópialo desde tu navegador.",
      );
    }
  }
  function newOrder() {
    orderId.current = "";
    commandId.current = "";
    setOrder(null);
    setIntent(null);
    setTranscript("");
    setFailure("");
    setStage("idle");
    window.history.replaceState(null, "", "/pos");
  }

  if (["qr", "paid", "cancelled"].includes(stage) && order)
    return (
      <>
        <Card className="qr-card">
          <div className="qr-heading">
            <h1>
              {stage === "paid"
                ? "¡Pago recibido!"
                : stage === "cancelled"
                  ? "Pedido cancelado"
                  : "Escanea para pagar"}
            </h1>
            <p>Pedido {order.orderRef}</p>
          </div>
          {stage === "qr" && paymentUrl && (
            <div className="qr-box">
              <QRCodeSVG
                value={paymentUrl}
                size={240}
                level="M"
                title={`Pagar pedido ${order.orderRef}`}
              />
            </div>
          )}
          {stage === "paid" && <CheckCircle size={72} aria-hidden="true" />}
          <Amount compact value={order.amount} />
          <span className="badge">
            {stage === "qr" && <Clock size={20} />}
            {stage === "paid"
              ? "Pago confirmado"
              : stage === "cancelled"
                ? "Cancelado"
                : "Esperando pago"}
          </span>
          <p className="center">
            {stage === "qr"
              ? "La pantalla se actualizará al recibir el pago."
              : stage === "paid"
                ? "El reparto se realizó según tu pedido."
                : "Este cobro ya no admite pagos."}
          </p>
          {failure && <Notice error>{failure}</Notice>}
          {stage === "qr" ? (
            <Button className="full" variant="secondary" onClick={copyLink}>
              <Copy size={18} />
              {copied ? "Enlace copiado" : "Copiar enlace de pago"}
            </Button>
          ) : (
            <Button onClick={newOrder}>Nuevo cobro</Button>
          )}
          <Splits splits={order.splitsJson ?? []} amount={order.amount} />
          <TransactionLink hash={order.payTxHash} />
        </Card>
        <div className="qr-links">
          {stage === "qr" && (
            <a
              className="text-link"
              href={paymentUrl}
              target="_blank"
              rel="noopener noreferrer"
            >
              Abrir enlace de pago
            </a>
          )}
          <ButtonLink secondary href={`/orders/${order.id}`}>
            Ver detalle del pedido
          </ButtonLink>
        </div>
        <Footer />
      </>
    );

  return (
    <>
      <div className="page-heading pos-heading">
        <div>
          <h1>Nuevo cobro</h1>
          <p>Habla, revisa y confirma tus cobros</p>
        </div>
        {merchant?.operatorAuthorized ? (
          <span className="badge">
            <CheckCircle size={20} />
            Wallet configurada
          </span>
        ) : (
          <ButtonLink secondary href="/wallet">
            Configurar wallet
          </ButtonLink>
        )}
      </div>
      {!connected && (
        <Notice title="Conectando notificaciones">
          Necesitamos la conexión en tiempo real para recibir la interpretación
          de tu voz.
        </Notice>
      )}
      <ol className="steps" aria-label="Progreso del cobro">
        {["Voz", "Revisión", "Pago"].map((label, index) => (
          <li
            key={label}
            aria-current={index === (intent ? 1 : 0) ? "step" : undefined}
          >
            <span className="step-symbol" aria-hidden="true">
              {index === 0 && intent ? (
                <Image src="/brand/53c04.svg" width={28} height={28} alt="" />
              ) : (
                <>
                  <Image src="/brand/a1180.svg" width={28} height={28} alt="" />
                  {index === (intent ? 1 : 0) && (
                    <Image
                      className="step-dot"
                      src="/brand/c3fd5.svg"
                      width={19}
                      height={18}
                      alt=""
                    />
                  )}
                </>
              )}
            </span>
            {label}
          </li>
        ))}
      </ol>
      {failure && <Notice error>{failure}</Notice>}
      {stage === "creating" || stage === "uncertain" ? (
        <Card className="state-card">
          <LoaderCircle className="spin" aria-hidden="true" />
          <h2>
            {stage === "uncertain"
              ? "Verifica el cobro"
              : "Preparando el cobro"}
          </h2>
          <p>
            Esperamos la confirmación de Stellar antes de mostrar el QR. No
            vuelvas a enviar este cobro.
          </p>
          <div className="row wrap">
            {(order || initialOrderId) && (
              <Button onClick={checkOrder}>Consultar estado</Button>
            )}
            <ButtonLink secondary href="/orders">
              Ver pedidos
            </ButtonLink>
          </div>
        </Card>
      ) : (
        <div className="pos-columns">
          <Card className="voice-card">
            <h2>Describe tu instrucción</h2>
            <div className="voice-visual">
              <button
                className="mic-control"
                aria-label={
                  stage === "recording"
                    ? "Detener grabación"
                    : "Grabar instrucción"
                }
                disabled={
                  ["uploading", "interpreting", "permission"].includes(stage) ||
                  !merchant?.operatorAuthorized ||
                  !connected
                }
                onClick={() =>
                  stage === "recording"
                    ? recorder.current?.stop()
                    : void record()
                }
              >
                <Image
                  className="mic-disc"
                  src="/brand/c2522.svg"
                  width={165}
                  height={157}
                  alt=""
                />
                <Image
                  className="mic-symbol"
                  src="/brand/f31fb.svg"
                  width={56}
                  height={64}
                  alt=""
                />
                <Image
                  className="mic-ring"
                  src="/brand/2ddf5.svg"
                  width={200}
                  height={200}
                  alt=""
                />
              </button>
              <div className="waves" aria-hidden="true">
                <Image
                  src="/brand/510d3.svg"
                  width={61.75}
                  height={55.4167}
                  alt=""
                />
                <Image
                  src="/brand/93cbc.svg"
                  width={63.75}
                  height={55.75}
                  alt=""
                />
              </div>
            </div>
            <div className="transcript" aria-live="polite">
              <strong>
                {stage === "recording"
                  ? `Grabando · ${seconds}s / 60s`
                  : stage === "interpreting"
                    ? "Interpretando tu instrucción…"
                    : stage === "uploading"
                      ? "Enviando audio…"
                      : "Transcripción:"}
              </strong>
              <p>
                {transcript ||
                  "Prueba: «Cobra 30 USDC por el pedido 10 y reparte 5 USDC a José»."}
              </p>
            </div>
            {stage === "recording" ? (
              <div className="stack">
                <Button onClick={() => recorder.current?.stop()}>
                  <Square size={14} />
                  Detener y transcribir
                </Button>
                <Button variant="secondary" onClick={cancelRecording}>
                  Cancelar grabación
                </Button>
              </div>
            ) : (
              <Button
                variant="dark"
                busy={["uploading", "permission"].includes(stage)}
                disabled={
                  !merchant?.operatorAuthorized ||
                  !connected ||
                  stage === "uploading" ||
                  stage === "permission"
                }
                onClick={record}
              >
                <Image src="/brand/9b258.svg" width={9} height={10} alt="" />
                {transcript
                  ? "Vuelve a grabar"
                  : stage === "interpreting"
                    ? "Volver a grabar"
                    : "Grabar instrucción"}
              </Button>
            )}
            {audio && stage === "idle" && (
              <Button
                variant="secondary"
                disabled={!connected}
                onClick={() => upload(audio)}
              >
                Reintentar transcripción
              </Button>
            )}
          </Card>
          <Card className="review-card">
            <div>
              <h2>Revisa el cobro</h2>
              <p>
                {intent
                  ? `Pedido ${intent.orderRef}`
                  : "Tu pedido aparecerá aquí"}
              </p>
            </div>
            <div className="stack">
              <p>Total a cobrar</p>
              {intent ? (
                <Amount value={intent.amount} />
              ) : (
                <div className="amount">
                  <strong>—</strong>
                  <span>USDC</span>
                </div>
              )}
            </div>
            <hr />
            {intent ? (
              <Splits splits={intent.splits} amount={intent.amount} />
            ) : (
              <p>
                Graba una instrucción para revisar el importe y el reparto antes
                de confirmar.
              </p>
            )}
            <hr />
            <div className="stack">
              <small>Al confirmar, prepararemos el cobro y su código QR.</small>
              <Button
                variant="dark"
                disabled={
                  !intent || stage !== "review" || !merchant?.operatorAuthorized
                }
                onClick={confirm}
              >
                Confirmar cobro
                <Image src="/brand/8a435.svg" width={24} height={24} alt="" />
              </Button>
            </div>
          </Card>
        </div>
      )}
      <Footer />
    </>
  );
}
