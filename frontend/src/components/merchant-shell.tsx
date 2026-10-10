"use client";
import { createContext, useContext, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ChevronDown,
  Menu,
  X,
  Wallet,
  LogOut,
  Mic,
  ClipboardList,
  Users,
  LayoutDashboard,
} from "lucide-react";
import { Brand, NetworkBadge, Notice, Button } from "./ui";
import { useResource } from "@/hooks/use-resource";
import { apiClient, errorMessage } from "@/services/api-client";
import type { Merchant } from "@/types/domain";

const MerchantContext = createContext<{
  merchant: Merchant | null;
  refresh: () => Promise<void>;
}>({ merchant: null, refresh: async () => {} });
export const useMerchant = () => useContext(MerchantContext);
const navigation = [
  { href: "/dashboard", label: "Dashboard", Icon: LayoutDashboard },
  { href: "/pos", label: "Nuevo cobro", Icon: Mic },
  { href: "/orders", label: "Pedidos", Icon: ClipboardList },
  { href: "/recipients", label: "Destinatarios", Icon: Users },
  { href: "/wallet", label: "Wallet del negocio", Icon: Wallet },
];
export function MerchantShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [logoutError, setLogoutError] = useState("");
  const {
    data: merchant,
    error,
    refresh,
  } = useResource<Merchant>("/v1/merchants/me");
  async function logout() {
    try {
      const [{ getFirebaseAuth }, { signOut }] = await Promise.all([
        import("@/lib/firebase"),
        import("firebase/auth"),
      ]);
      await signOut(getFirebaseAuth());
      await apiClient.post("/v1/auth/logout");
      router.replace("/login");
      router.refresh();
    } catch (err) {
      setLogoutError(errorMessage(err));
    }
  }
  function close() {
    setMobileOpen(false);
    setAccountOpen(false);
  }
  return (
    <MerchantContext.Provider value={{ merchant, refresh }}>
      <a className="skip-link" href="#main">
        Saltar al contenido
      </a>
      <header
        className="app-header"
        onKeyDown={(e) => {
          if (e.key === "Escape") close();
        }}
      >
        <Link href="/dashboard" aria-label="VoxPay, ir al Dashboard" onClick={close}>
          <Brand />
        </Link>
        <div className="header-actions">
          <NetworkBadge />
          <div className="account-wrap">
            <button
              className="account-button"
              onClick={() => {
                setAccountOpen(!accountOpen);
                setMobileOpen(false);
              }}
              aria-expanded={accountOpen}
              aria-controls="account-menu"
            >
              <span className="avatar">MN</span>
              <span>Mi negocio</span>
              <ChevronDown size={16} />
            </button>
            {accountOpen && (
              <div className="account-menu" id="account-menu">
                <Link onClick={close} href="/wallet">
                  <Wallet size={16} />
                  Wallet del negocio
                </Link>
                <button onClick={logout}>
                  <LogOut size={16} />
                  Cerrar sesión
                </button>
              </div>
            )}
          </div>
          <button
            className="mobile-menu-button"
            aria-label={mobileOpen ? "Cerrar menú" : "Abrir menú"}
            aria-expanded={mobileOpen}
            aria-controls="mobile-navigation"
            onClick={() => {
              setMobileOpen(!mobileOpen);
              setAccountOpen(false);
            }}
          >
            {mobileOpen ? <X /> : <Menu />}
          </button>
        </div>
        {mobileOpen && (
          <nav
            id="mobile-navigation"
            className="mobile-nav"
            aria-label="Navegación móvil"
          >
            {navigation.map(({ href, label, Icon }) => (
              <Link
                onClick={close}
                key={href}
                href={href}
                aria-current={pathname.startsWith(href) ? "page" : undefined}
              >
                <Icon size={22} aria-hidden="true" />
                {label}
              </Link>
            ))}
            <button onClick={logout}>Cerrar sesión</button>
          </nav>
        )}
      </header>
      <div className="app-body">
        <aside className="sidebar">
          <nav className="desktop-nav" aria-label="Navegación principal">
            {navigation.map(({ href, label, Icon }) => (
              <Link
                key={href}
                href={href}
                aria-current={pathname.startsWith(href) ? "page" : undefined}
              >
                <Icon size={22} aria-hidden="true" />
                {label}
              </Link>
            ))}
          </nav>
        </aside>
        <main id="main" className="workspace">
          {(!!error || logoutError) && (
            <Notice error title="No se pudo cargar la cuenta">
              <p>{logoutError || errorMessage(error)}</p>
              <Button variant="secondary" onClick={refresh}>
                Reintentar
              </Button>
            </Notice>
          )}
          {children}
        </main>
      </div>
    </MerchantContext.Provider>
  );
}
