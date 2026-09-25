import Image from "next/image";
import Link from "next/link";
import { ExternalLink, LoaderCircle } from "lucide-react";
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { explorerUrl, money, statusLabel } from "@/lib/domain";
import type { OrderStatus, Split } from "@/types/domain";

export function Button({
  className = "",
  variant = "primary",
  busy,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "dark";
  busy?: boolean;
}) {
  return (
    <button
      {...props}
      disabled={disabled || busy}
      aria-busy={busy || undefined}
      className={`button button-${variant} ${className}`}
    >
      {busy && <LoaderCircle size={16} className="spin" aria-hidden="true" />}
      {children}
    </button>
  );
}
export function ButtonLink({
  href,
  children,
  secondary = false,
  className = "",
}: {
  href: string;
  children: ReactNode;
  secondary?: boolean;
  className?: string;
}) {
  return (
    <Link
      href={href}
      className={`button button-${secondary ? "secondary" : "primary"} ${className}`}
    >
      {children}
    </Link>
  );
}
export function Card({
  className = "",
  ...props
}: HTMLAttributes<HTMLElement>) {
  return <section className={`card ${className}`} {...props} />;
}
export function PageHeading({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <h1>{title}</h1>
        <p>{description}</p>
      </div>
      {action}
    </div>
  );
}
export function Notice({
  title,
  children,
  error = false,
}: {
  title?: string;
  children: ReactNode;
  error?: boolean;
}) {
  return (
    <div
      className={`notice ${error ? "notice-error" : ""}`}
      role={error ? "alert" : "status"}
    >
      {title && <h3>{title}</h3>}
      <div>{children}</div>
    </div>
  );
}
export function Loading({ label = "Cargando…" }: { label?: string }) {
  return (
    <Card className="state-card" aria-live="polite">
      <LoaderCircle className="spin" aria-hidden="true" />
      <h2>{label}</h2>
      <p>Estamos consultando la información.</p>
    </Card>
  );
}
export function EmptyState({
  title,
  children,
  action,
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <Card className="state-card">
      <h2>{title}</h2>
      <p>{children}</p>
      {action}
    </Card>
  );
}
export function Brand({ login = false }: { login?: boolean }) {
  return (
    <span className={login ? "login-logo" : "brand-logo"}>
      <Image
        src={login ? "/brand/b571a.png" : "/brand/463ac.png"}
        alt="VoxPay"
        fill
        sizes={
          login
            ? "(max-width: 767px) 290px, 360px"
            : "(max-width: 767px) 144px, 176px"
        }
        priority
      />
    </span>
  );
}
export function NetworkBadge() {
  return <span className="badge">Testnet</span>;
}
export function StatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span className={`badge ${status === "PAID" ? "badge-paid" : ""}`}>
      {statusLabel[status]}
    </span>
  );
}
export function Amount({
  value,
  compact = false,
}: {
  value: string | number;
  compact?: boolean;
}) {
  return (
    <div className={`amount ${compact ? "amount-compact" : ""}`}>
      <strong>{money(value)}</strong>
      <span>USDC</span>
    </div>
  );
}
export function Splits({
  splits,
  amount,
}: {
  splits: Split[];
  amount: string | number;
}) {
  const remainder =
    Number(amount) - splits.reduce((total, s) => total + Number(s.amount), 0);
  return (
    <div className="splits">
      <p>Reparto del pago</p>
      {splits.map((s, i) => (
        <div className="split" key={`${s.recipientAlias}-${i}`}>
          <span>{s.recipientAlias}</span>
          <span>
            <strong>{money(s.amount)}</strong> <small>USDC</small>
          </span>
        </div>
      ))}
      <div className="split">
        <span>Tu negocio</span>
        <span>
          <strong>{money(remainder)}</strong> <small>USDC</small>
        </span>
      </div>
    </div>
  );
}
export function TransactionLink({
  hash,
  label = "Ver transacción en Stellar Expert",
}: {
  hash?: string | null;
  label?: string;
}) {
  const url = explorerUrl(hash);
  return url ? (
    <a
      className="text-link"
      href={url}
      target="_blank"
      rel="noopener noreferrer"
    >
      {label}
      <ExternalLink size={16} aria-hidden="true" />
    </a>
  ) : null;
}
export function Footer({ children }: { children?: ReactNode }) {
  return (
    <footer className="page-footer">
      <p>Stellar Testnet · Fondos de prueba</p>
      {children}
    </footer>
  );
}
