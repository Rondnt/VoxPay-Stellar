"use client";
import { useState, type FormEvent } from "react";
import { Eye, EyeOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { Brand, Button, Card, Notice } from "./ui";
import { apiClient, ApiError, errorMessage } from "@/services/api-client";

export function LoginForm({ expired }: { expired: boolean }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [errors, setErrors] = useState<{ email?: string; password?: string }>(
    {},
  );
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const next = {
      email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
        ? undefined
        : "Ingresa un correo válido.",
      password: password.length >= 8 ? undefined : "Usa al menos 8 caracteres.",
    };
    setErrors(next);
    if (next.email || next.password) return;
    setBusy(true);
    setError("");
    try {
      await apiClient.post("/v1/auth/login", { email: email.trim(), password });
      router.replace("/pos");
      router.refresh();
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 401
          ? "El correo o la contraseña no son correctos."
          : errorMessage(err),
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="login-page">
      <Brand login />
      <Card className="login-card">
        <h1>Bienvenido</h1>
        <p>Ingresa tus datos para acceder al sistema.</p>
        {expired && <Notice>Tu sesión venció. Vuelve a iniciar sesión.</Notice>}
        <form onSubmit={submit} noValidate className="stack">
          <div className="field">
            <label htmlFor="email">Correo electrónico</label>
            <input
              id="email"
              type="email"
              autoComplete="username"
              placeholder="nombre.negocio@mail.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              aria-invalid={!!errors.email}
              aria-describedby={errors.email ? "email-error" : undefined}
              disabled={busy}
              required
            />
            {errors.email && (
              <small id="email-error" className="field-error">
                {errors.email}
              </small>
            )}
          </div>
          <div className="field">
            <label htmlFor="password">Contraseña</label>
            <div className="password-field">
              <input
                id="password"
                type={show ? "text" : "password"}
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={!!errors.password}
                aria-describedby={
                  errors.password ? "password-error" : undefined
                }
                disabled={busy}
                required
              />
              <button
                type="button"
                onClick={() => setShow(!show)}
                aria-label={show ? "Ocultar contraseña" : "Mostrar contraseña"}
              >
                {show ? <EyeOff size={20} /> : <Eye size={20} />}
              </button>
            </div>
            {errors.password && (
              <small id="password-error" className="field-error">
                {errors.password}
              </small>
            )}
          </div>
          {error && <Notice error>{error}</Notice>}
          <Button type="submit" busy={busy}>
            {busy ? "Iniciando sesión…" : "Iniciar sesión"}
          </Button>
        </form>
        <small>Acceso para negocios registrados.</small>
        <small>Stellar Testnet · Fondos de prueba</small>
      </Card>
    </main>
  );
}
