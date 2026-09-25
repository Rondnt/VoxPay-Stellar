import type { ConfirmableIntent, OrderStatus } from "@/types/domain";
export function money(value: string | number): string {
  const n = Number(value);
  return Number.isFinite(n)
    ? new Intl.NumberFormat("en-US", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 7,
      }).format(n)
    : "—";
}
export function shortAddress(value: string) {
  return value.length > 16 ? `${value.slice(0, 6)}…${value.slice(-4)}` : value;
}
export const statusLabel: Record<OrderStatus, string> = {
  PENDING: "Pendiente",
  PAID: "Pagado",
  CANCELLED: "Cancelado",
};
export function explorerUrl(hash?: string | null) {
  return hash && /^[a-f0-9]{64}$/i.test(hash)
    ? `https://stellar.expert/explorer/testnet/tx/${hash}`
    : null;
}
export function formatDate(value: string) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "—"
    : date.toLocaleString("es-PE", {
        day: "2-digit",
        month: "short",
        hour: "2-digit",
        minute: "2-digit",
      });
}
// Accept Raven's planned snake_case and the current AgentProvider's camelCase.
export function parseIntent(raw: unknown): ConfirmableIntent | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  if (
    value.intent !== "create_order" ||
    (typeof value.confidence === "number" && value.confidence < 0.7)
  )
    return null;
  const orderRef = value.order_ref ?? value.orderRef;
  const amount = value.amount;
  if (
    typeof orderRef !== "string" ||
    !orderRef.trim() ||
    typeof amount !== "number" ||
    !Number.isFinite(amount) ||
    amount <= 0
  )
    return null;
  if (value.asset && value.asset !== "USDC") return null;
  const rawSplits = value.splits ?? [];
  if (!Array.isArray(rawSplits)) return null;
  const splits = [];
  for (const entry of rawSplits) {
    if (!entry || typeof entry !== "object") return null;
    const alias = entry.recipient_alias ?? entry.recipientAlias;
    if (
      typeof alias !== "string" ||
      !alias.trim() ||
      typeof entry.amount !== "number" ||
      !Number.isFinite(entry.amount) ||
      entry.amount < 0
    )
      return null;
    splits.push({ recipientAlias: alias, amount: entry.amount });
  }
  if (splits.reduce((sum, s) => sum + s.amount, 0) > amount + 1e-7) return null;
  return { orderRef, amount, splits };
}
