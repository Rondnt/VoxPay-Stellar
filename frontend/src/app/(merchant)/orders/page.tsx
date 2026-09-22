export default function OrdersPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-4 p-8">
      <h1 className="text-2xl font-semibold">Pedidos</h1>
      <p className="text-sm text-zinc-500">
        Lista de órdenes con estado y link al hash en stellar.expert. Ver{" "}
        <code>src/features/orders</code>.
      </p>
    </div>
  );
}
