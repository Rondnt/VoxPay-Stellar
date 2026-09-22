export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-2xl space-y-4 p-8">
      <h1 className="text-2xl font-semibold">Dashboard</h1>
      <p className="text-sm text-zinc-500">
        Totales del día (<code>GET /v1/analytics/today</code>) y consultas por
        voz como &quot;¿cuánto cobré hoy?&quot;.
      </p>
    </div>
  );
}
