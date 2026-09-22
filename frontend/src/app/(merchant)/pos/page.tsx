export default function PosPage() {
  return (
    <div className="mx-auto max-w-xl space-y-4 p-8">
      <h1 className="text-2xl font-semibold">POS por voz</h1>
      <p className="text-sm text-zinc-500">
        Graba el cobro (MediaRecorder), envíalo a{" "}
        <code>POST /v1/voice/commands</code>, confirma la intención y muestra
        el QR de la orden. Ver <code>src/features/voice</code>.
      </p>
    </div>
  );
}
