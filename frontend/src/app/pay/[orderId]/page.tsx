export default async function PayPage({
  params,
}: {
  params: Promise<{ orderId: string }>;
}) {
  const { orderId } = await params;

  return (
    <div className="mx-auto max-w-md space-y-4 p-8">
      <h1 className="text-2xl font-semibold">Pagar pedido {orderId}</h1>
      <p className="text-sm text-zinc-500">
        Conecta tu wallet, firma el XDR de <code>pay()</code> que arma el
        backend (<code>POST /v1/public/orders/:id/tx</code>) y envíalo de
        vuelta (<code>POST /v1/public/orders/:id/submit</code>). Esta página
        nunca habla directo con el contrato.
      </p>
    </div>
  );
}
