import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { Brand } from "./ui";
import { LoginVoxi } from "./login-voxi";

export function AuthLayout({
  children,
  register = false,
  animateVoxi = false,
}: {
  children: ReactNode;
  register?: boolean;
  animateVoxi?: boolean;
}) {
  return (
    <main className="login-page">
      <div className="auth-shell">
        <header className={`auth-header${register ? " auth-header-register" : ""}`}>
          <Link href="/login" aria-label="VoxPay, iniciar sesión">
            <Brand login />
          </Link>
        </header>
        <div className="auth-content">
          <section className="auth-welcome" aria-label="Bienvenida a VoxPay">
            <h2>
              {register ? "Tu negocio, con VoxPay" : "Bienvenido a VoxPay"}
            </h2>
            <p>Accede a tu cuenta para gestionar tus cobros por voz.</p>
            <div className="auth-welcome-art">
              {!animateVoxi && (
                <Image
                  src="/brand/v2/1f791.svg"
                  width={440}
                  height={400}
                  alt=""
                  className="auth-desktop-backdrop"
                />
              )}
              <Image
                src="/brand/v2/f854c.svg"
                width={260}
                height={208}
                alt=""
                className="auth-mobile-backdrop"
              />
              {animateVoxi ? (
                <LoginVoxi />
              ) : (
                <>
                  <Image
                    src="/brand/v2/b91ed.png"
                    width={480}
                    height={480}
                    alt=""
                    className="auth-desktop-voxi"
                    priority
                  />
                  <Image
                    src="/brand/v2/79f06.png"
                    width={280}
                    height={280}
                    alt=""
                    className="auth-mobile-voxi"
                    priority
                  />
                </>
              )}
              <span className="auth-welcome-bubble">
                ¡Qué bueno
                <br />
                tenerte aquí!
              </span>
            </div>
          </section>
          <section className="login-card">{children}</section>
        </div>
      </div>
    </main>
  );
}
