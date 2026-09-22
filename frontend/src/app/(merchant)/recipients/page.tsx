export default function RecipientsPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-4 p-8">
      <h1 className="text-2xl font-semibold">Destinatarios</h1>
      <p className="text-sm text-zinc-500">
        Agenda de alias → wallet (ej. &quot;José&quot;) y reglas de reparto
        fijas. CRUD contra <code>/v1/recipients</code>.
      </p>
    </div>
  );
}
