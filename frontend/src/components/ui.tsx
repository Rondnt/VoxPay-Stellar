import Image from "next/image";
import Link from "next/link";
import {
  ExternalLink,
  LoaderCircle,
  Info,
  CircleAlert,
  CircleCheck,
  UserRound,
  Store,
  X,
} from "lucide-react";
import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { explorerUrl, money, statusLabel } from "@/lib/domain";
import type { OrderStatus, Split } from "@/types/domain";
import { VoxiScene, type VoxiPose } from "./voxi";

export function Button({
  className = "",
  variant = "primary",
  busy,
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "dark" | "danger";
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
  success = false,
}: {
  title?: string;
  children: ReactNode;
  error?: boolean;
  success?: boolean;
}) {
  return (
    <div
      className={`notice ${error ? "notice-error" : success ? "notice-success" : ""}`}
      role={error ? "alert" : "status"}
    >
      {error ? (
        <CircleAlert size={22} aria-hidden="true" />
      ) : success ? (
        <CircleCheck size={22} aria-hidden="true" />
      ) : (
        <Info size={22} aria-hidden="true" />
      )}
      <div className="notice-content">
        {title && <h3>{title}</h3>}
        <div>{children}</div>
      </div>
    </div>
  );
}
export function Loading({ label = "Cargando…" }: { label?: string }) {
  return (
    <Card className="state-card" aria-live="polite">
      <VoxiScene pose="thinking" />
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
  pose = "confused",
}: {
  title: string;
  children: ReactNode;
  action?: ReactNode;
  pose?: VoxiPose;
}) {
  return (
    <Card className="state-card">
      <VoxiScene pose={pose} />
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
        src="/brand/v2/voxpay-logo-transparent.png"
        alt="VoxPay"
        width={237}
        height={119}
        sizes="237px"
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
    <span className={`badge badge-${status.toLowerCase()}`}>
      {status === "PAID" ? (
        <CircleCheck size={16} aria-hidden="true" />
      ) : status === "CANCELLED" ? (
        <X size={16} aria-hidden="true" />
      ) : (
        <LoaderCircle size={16} aria-hidden="true" />
      )}
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
          <span className="split-avatar">
            <UserRound size={22} aria-hidden="true" />
          </span>
          <span>{s.recipientAlias}</span>
          <span>
            <strong>{money(s.amount)}</strong> <small>USDC</small>
          </span>
        </div>
      ))}
      <div className="split">
        <span className="split-avatar">
          <Store size={22} aria-hidden="true" />
        </span>
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
