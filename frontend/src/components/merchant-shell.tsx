"use client";
import { createContext, useContext, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { ChevronDown, Menu, X, Wallet, LogOut } from "lucide-react";
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
  ["/pos", "POS por voz"],
  ["/orders", "Pedidos"],
  ["/recipients", "Destinatarios"],
  ["/dashboard", "Dashboard"],
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
        <Link href="/pos" aria-label="VoxPay, ir al POS" onClick={close}>
          <Brand />
        </Link>
        <nav className="desktop-nav" aria-label="Navegación principal">
          {navigation.map(([href, label]) => (
            <Link
              key={href}
              href={href}
              className={pathname.startsWith(href) ? "active" : ""}
              aria-current={pathname.startsWith(href) ? "page" : undefined}
            >
              {label}
            </Link>
          ))}
        </nav>
        <div className="header-actions">
          <NetworkBadge />
          <div className="account-wrap">
            <button
              className="account-button"
              onClick={() => setAccountOpen(!accountOpen)}
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
            onClick={() => setMobileOpen(!mobileOpen)}
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
            {[...navigation, ["/wallet", "Wallet del negocio"]].map(
              ([href, label]) => (
                <Link
                  onClick={close}
                  key={href}
                  href={href}
                  aria-current={pathname.startsWith(href) ? "page" : undefined}
                >
                  {label}
                </Link>
              ),
            )}
            <button onClick={logout}>Cerrar sesión</button>
          </nav>
        )}
      </header>
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
    </MerchantContext.Provider>
  );
}
