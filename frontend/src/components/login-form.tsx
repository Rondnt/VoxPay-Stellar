"use client";
import { useState, useEffect, type FormEvent } from "react";
import { Eye, EyeOff, X } from "lucide-react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { Brand, Button } from "./ui";
import {
  firebaseAuthError,
  prepareFirebaseLogin,
  syncFirebaseSession,
} from "@/lib/firebase-auth";
import {
  signInWithPopup,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
} from "firebase/auth";
import { auth } from "@/lib/firebase";

const googleProvider = new GoogleAuthProvider();

export function LoginForm({
  expired,
  register = false,
}: {
  expired: boolean;
  register?: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [remember, setRemember] = useState(false);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [googleBusy, setGoogleBusy] = useState(false);
  const [error, setError] = useState("");
  const [expiredVisible, setExpiredVisible] = useState(expired);
  const [errors, setErrors] = useState<{ email?: string; password?: string }>(
    {},
  );

  // Limpiar ?expired=1 de la URL y borrar cookie de sesión vencida
  useEffect(() => {
    if (expired && typeof window !== "undefined") {
      window.history.replaceState({}, "", pathname);
    }
  }, [expired, pathname]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy || googleBusy) return;
    const next = {
      email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
        ? undefined
        : "Ingresa un correo válido.",
      password: !password
        ? "Ingresa tu contraseña."
        : register && password.length < 8
          ? "Usa al menos 8 caracteres."
          : register && password !== confirmation
            ? "Las contraseñas no coinciden."
            : undefined,
    };
    setErrors(next);
    if (next.email || next.password) return;
    setBusy(true);
    setError("");
    try {
      await prepareFirebaseLogin(remember);
      const result = register
        ? await createUserWithEmailAndPassword(auth, email.trim(), password)
        : await signInWithEmailAndPassword(auth, email.trim(), password);
      await syncFirebaseSession(result.user);
      router.replace("/pos");
      router.refresh();
    } catch (err) {
      setError(firebaseAuthError(err));
    } finally {
      setBusy(false);
    }
  }

  async function loginWithGoogle() {
    if (googleBusy || busy) return;
    setGoogleBusy(true);
    setError("");
    try {
      await prepareFirebaseLogin(remember);
      const result = await signInWithPopup(auth, googleProvider);
      await syncFirebaseSession(result.user);
      router.replace("/pos");
      router.refresh();
    } catch (err) {
      setError(firebaseAuthError(err));
    } finally {
      setGoogleBusy(false);
    }
  }

  return (
    <main className="login-page">
      <Brand login />
      <section className="login-card">
        <div className="login-card-header">
          <h1>{register ? "Crea tu cuenta" : "Bienvenido"}</h1>
          <p>
            {register
              ? "Regístrate con tu correo o continúa con Google."
              : "Ingresa tus datos para acceder al sistema"}
          </p>
        </div>

        {expiredVisible && (
          <div
            className="login-error-banner login-warning-banner"
            role="status"
          >
            <span>⚠️ Tu sesión venció. Vuelve a iniciar sesión.</span>
            <button
              type="button"
              onClick={() => setExpiredVisible(false)}
              aria-label="Cerrar aviso"
              className="login-error-close"
            >
              <X size={14} />
            </button>
          </div>
        )}

        {error && (
          <div className="login-error-banner" role="alert">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError("")}
              aria-label="Cerrar error"
              className="login-error-close"
            >
              <X size={14} />
            </button>
          </div>
        )}

        <form onSubmit={submit} noValidate className="login-form-stack">
          {/* Correo */}
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
              disabled={busy || googleBusy}
              required
            />
            {errors.email && (
              <small id="email-error" className="field-error">
                {errors.email}
              </small>
            )}
          </div>

          {/* Contraseña */}
          <div className="field">
            <label htmlFor="password">Contraseña</label>
            <div className="password-field">
              <input
                id="password"
                type={show ? "text" : "password"}
                autoComplete={register ? "new-password" : "current-password"}
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                aria-invalid={!!errors.password}
                aria-describedby={
                  errors.password ? "password-error" : undefined
                }
                disabled={busy || googleBusy}
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

          {register && (
            <div className="field">
              <label htmlFor="confirmation">Confirmar contraseña</label>
              <input
                id="confirmation"
                type={show ? "text" : "password"}
                autoComplete="new-password"
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                disabled={busy || googleBusy}
                required
              />
            </div>
          )}
          {/* Recordarme + Olvidaste */}
          <div className="login-row-options">
            <label className="login-checkbox-label">
              <input
                type="checkbox"
                checked={remember}
                onChange={(e) => setRemember(e.target.checked)}
                id="remember"
              />
              <span>Recordarme</span>
            </label>
            <Link href="/forgot-password" className="login-forgot-link">
              ¿Olvidaste tu contraseña?
            </Link>
          </div>

          {/* Botón principal */}
          <Button
            type="submit"
            busy={busy}
            disabled={googleBusy}
            className="login-submit-btn"
          >
            {busy
              ? register
                ? "Creando cuenta…"
                : "Iniciando sesión…"
              : register
                ? "Crear cuenta"
                : "Iniciar sesión"}
          </Button>
        </form>

        {/* Divisor */}
        <div className="login-divider">
          <span>O Inicia sesión con</span>
        </div>

        {/* Google */}
        <button
          type="button"
          onClick={loginWithGoogle}
          disabled={busy || googleBusy}
          className="login-google-btn"
        >
          {googleBusy ? (
            <span className="login-google-spinner" aria-hidden="true" />
          ) : (
            <GoogleIcon />
          )}
          Iniciar sesión con Google
        </button>

        {/* Registro */}
        <p className="login-register-text">
          {register ? "¿Ya tienes una cuenta?" : "¿Necesitas una cuenta?"}{" "}
          <Link
            href={register ? "/login" : "/register"}
            className="login-register-link"
          >
            {register ? "Iniciar sesión" : "Registrar"}
          </Link>
        </p>
      </section>
    </main>
  );
}

function GoogleIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      aria-hidden="true"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}
