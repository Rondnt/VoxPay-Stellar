"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  CheckCircle,
  Clock,
  Copy,
  LoaderCircle,
  Square,
  Mic,
  FileText,
  ArrowRight,
  AudioLines,
} from "lucide-react";
import { VoxiScene } from "@/components/voxi";
import { PaymentProgress } from "@/components/payment-progress";
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
import { playActivationChime } from "@/lib/chime";
import { useMicPermission } from "@/hooks/use-mic-permission";
import { useWakeWord } from "@/hooks/use-wake-word";
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
  const [examplesOpen, setExamplesOpen] = useState(false);
  const [editingInstruction, setEditingInstruction] = useState(false);
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

  // "VoxPay" solo escucha mientras no hay nada más usando el micrófono, y solo una vez que el
  // permiso ya está CONFIRMADO (Chrome exige que la primera solicitud venga de un clic real; ver
  // use-mic-permission.ts). Al detectarla dispara el mismo record() que un clic manual.
  const micPermission = useMicPermission();
  const wakeWordEnabled =
    stage === "idle" &&
    micPermission === "granted" &&
    connected &&
    !!merchant?.operatorAuthorized;
  console.log("[pos-view] wakeWordEnabled:", wakeWordEnabled, {
    stage,
    micPermission,
    connected,
    operatorAuthorized: merchant?.operatorAuthorized,
  });
  useWakeWord(record, wakeWordEnabled);

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
    if (payload.audioBase64) {
      void new Audio(`data:audio/mpeg;base64,${payload.audioBase64}`)
        .play()
        .catch(() => {});
    }
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
    setEditingInstruction(false);
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
      playActivationChime();
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
    setCopied(false);
    setEditingInstruction(false);
    window.history.replaceState(null, "", "/pos");
  }

  if (["qr", "paid", "cancelled"].includes(stage) && order)
    return (
      <>
        <div className="page-heading">
          <div>
            <h1>
              {stage === "paid"
                ? "¡Pago recibido!"
                : stage === "cancelled"
                  ? "Pedido cancelado"
                  : "Cobro listo"}
            </h1>
            <p>
              {stage === "qr"
                ? "Comparte el QR con tu cliente para recibir el pago."
                : "Consulta el estado y el reparto de tu cobro."}
            </p>
          </div>
        </div>
        <PaymentProgress step={2} />
        <div className="pos-columns">
          <Card className="qr-card">
            <span
              className={
                "badge " +
                (stage === "paid"
                  ? "badge-paid"
                  : stage === "cancelled"
                    ? "badge-cancelled"
                    : "badge-pending")
              }
            >
              {stage === "qr" && <Clock size={16} aria-hidden="true" />}
              {stage === "paid"
                ? "Pago confirmado"
                : stage === "cancelled"
                  ? "Cancelado"
                  : "Esperando pago"}
            </span>
            <div className="qr-heading">
              <h2>
                {stage === "qr"
                  ? "Escanea para pagar"
                  : "Pedido " + order.orderRef}
              </h2>
            </div>
            {stage === "qr" && paymentUrl ? (
              <>
                <div className="qr-box">
                  <QRCodeSVG
                    value={paymentUrl}
                    size={240}
                    level="M"
                    title={"Pagar pedido " + order.orderRef}
                  />
                </div>
                <div className="qr-status">
                  <VoxiScene pose="waiting" />
                  <p>La pantalla se actualizará al recibir el pago.</p>
                </div>
                <Button className="full" variant="secondary" onClick={copyLink}>
                  <Copy size={18} />
                  {copied ? "Enlace copiado" : "Copiar enlace de pago"}
                </Button>
                <a
                  className="text-link"
                  href={paymentUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Abrir enlace de pago
                </a>
              </>
            ) : (
              <>
                <VoxiScene
                  pose={stage === "paid" ? "celebrating" : "stopping"}
                />
                <Amount compact value={order.amount} />
                <p className="center">
                  {stage === "paid"
                    ? "El reparto se realizó según tu pedido."
                    : "Este cobro ya no admite pagos."}
                </p>
                <TransactionLink hash={order.payTxHash} />
              </>
            )}
            {failure && <Notice error>{failure}</Notice>}
          </Card>
          <Card className="review-card">
            <div>
              <h2>Resumen del cobro</h2>
              <p>Pedido {order.orderRef}</p>
            </div>
            <div>
              <p>Total a cobrar</p>
              <Amount value={order.amount} />
            </div>
            <hr />
            <Splits splits={order.splitsJson ?? []} amount={order.amount} />
            <div className="confirmation-actions stack">
              {stage === "paid" && (
                <Notice success>
                  El pago figura como confirmado en el pedido.
                </Notice>
              )}
              <Button onClick={newOrder}>
                Nuevo cobro
                <Mic size={20} aria-hidden="true" />
              </Button>
              <ButtonLink secondary href={"/orders/" + order.id}>
                Ver detalle del pedido
              </ButtonLink>
            </div>
          </Card>
        </div>
        <Footer />
      </>
    );

  const recording = stage === "recording";
  const processing = ["uploading", "interpreting", "permission"].includes(
    stage,
  );
  return (
    <div className="pos-page pos-new-charge">
      <div className="pos-intro">
        <div className="page-heading pos-heading">
          <div>
            <h1>Nuevo cobro</h1>
            <p>Habla, revisa y confirma tus cobros</p>
          </div>
          {merchant?.operatorAuthorized ? (
            <span className="badge badge-paid">
              <CheckCircle size={16} aria-hidden="true" />
              Wallet configurada
            </span>
          ) : (
            <ButtonLink secondary href="/wallet">
              Configurar wallet
            </ButtonLink>
          )}
        </div>
        <PaymentProgress step={intent ? 1 : 0} />
      </div>
      {!connected && (
        <Notice title="Conectando notificaciones">
          Necesitamos la conexión en tiempo real para recibir la interpretación
          de tu voz.
        </Notice>
      )}
      {failure && <Notice error>{failure}</Notice>}
      {stage === "creating" || stage === "uncertain" ? (
        <Card className="state-card">
          <VoxiScene pose="thinking" />
          <LoaderCircle className="spin" aria-hidden="true" />
          <h2>
            {stage === "uncertain"
              ? "Verifica el cobro"
              : "Preparando el cobro"}
          </h2>
          <p>
            Estamos consultando el registro del cobro antes de mostrar el QR. No
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
        <div
          className={
            "pos-columns " + (intent && !editingInstruction ? "pos-review" : "")
          }
        >
          <Card className="voice-card">
            <div className="voice-card-heading">
              <h2>Habla con Voxi</h2>
              <Button
                variant="secondary"
                onClick={() => setExamplesOpen(!examplesOpen)}
                aria-expanded={examplesOpen}
                aria-controls="voice-examples"
              >
                <FileText size={20} aria-hidden="true" />
                Ejemplos
              </Button>
              <p>
                Indica el monto, el pedido y cómo repartir el pago entre las
                personas.
              </p>
            </div>
            {examplesOpen && (
              <div id="voice-examples" className="examples-panel">
                <strong>Prueba con una instrucción como esta</strong>
                <p>«Cobra 30 USDC por el pedido 10 y reparte 5 USDC a José».</p>
                <small>
                  Usa un número de pedido nuevo y un alias guardado en
                  Destinatarios. Los ejemplos no crean cobros.
                </small>
              </div>
            )}
            <div className="voice-visual">
              <VoxiScene
                large
                pose={
                  failure ? "confused" : processing ? "thinking" : "listening"
                }
              />
              <button
                className={"mic-control " + (recording ? "is-recording" : "")}
                aria-label={
                  recording ? "Detener y transcribir" : "Grabar instrucción"
                }
                disabled={
                  processing || !merchant?.operatorAuthorized || !connected
                }
                onClick={() =>
                  recording ? recorder.current?.stop() : void record()
                }
              >
                {recording ? (
                  <Square size={28} fill="currentColor" aria-hidden="true" />
                ) : processing ? (
                  <LoaderCircle size={32} className="spin" aria-hidden="true" />
                ) : (
                  <Mic size={36} aria-hidden="true" />
                )}
              </button>
              <span className="voice-control-label">
                {recording
                  ? "Detener y transcribir · " + seconds + "s / 60s"
                  : processing
                    ? "Preparando tu instrucción…"
                    : transcript
                      ? "Toca para volver a grabar"
                      : "Toca para hablar"}
              </span>
            </div>
            <div className="transcript" aria-live="polite">
              <div>
                <strong>
                  {recording
                    ? "Grabando tu instrucción"
                    : stage === "interpreting"
                      ? "Interpretando tu instrucción…"
                      : stage === "uploading"
                        ? "Enviando audio…"
                        : "Transcripción de tu instrucción"}
                </strong>
                <p>
                  {transcript ||
                    "Tu instrucción aparecerá aquí después de grabar."}
                </p>
              </div>
              <AudioLines size={40} aria-hidden="true" />
            </div>
            {recording && (
              <div className="stack recording-actions">
                <Button variant="secondary" onClick={cancelRecording}>
                  Cancelar grabación
                </Button>
              </div>
            )}
            {stage === "interpreting" && (
              <Button
                variant="secondary"
                onClick={record}
                disabled={!connected || !merchant?.operatorAuthorized}
              >
                Volver a grabar
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
            <div className="review-card-heading">
              <h2>Revisa el cobro</h2>
              <p>
                {intent
                  ? "Pedido " + intent.orderRef + " · Borrador"
                  : "Tu pedido aparecerá aquí"}
              </p>
            </div>
            <div className="review-mobile-voxi">
              <VoxiScene pose="presenting" />
            </div>
            <div className="review-total">
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
            <div className="confirmation-actions stack">
              <Notice>
                Al confirmar, prepararemos el cobro y su código QR para que
                puedas recibir el pago.
              </Notice>
              <Button
                disabled={
                  !intent || stage !== "review" || !merchant?.operatorAuthorized
                }
                onClick={confirm}
              >
                Confirmar cobro
                <ArrowRight size={24} aria-hidden="true" />
              </Button>
              {intent && (
                <Button
                  variant="secondary"
                  className="review-edit-button"
                  onClick={() => setEditingInstruction(true)}
                >
                  Editar instrucción
                </Button>
              )}
            </div>
          </Card>
        </div>
      )}
      <Footer />
    </div>
  );
}
