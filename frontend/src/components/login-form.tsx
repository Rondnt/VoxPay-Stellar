"use client";
import { useState, useEffect, type FormEvent } from "react";
import { Eye, EyeOff, X, Mail, LockKeyhole, ArrowRight } from "lucide-react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Button } from "./ui";
import { AuthLayout } from "./auth-layout";
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
import { getFirebaseAuth } from "@/lib/firebase";

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
      email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
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
      const auth = getFirebaseAuth();
      const result = register
        ? await createUserWithEmailAndPassword(auth, email.trim(), password)
        : await signInWithEmailAndPassword(auth, email.trim(), password);
      await syncFirebaseSession(result.user);
      router.replace("/dashboard");
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
      const result = await signInWithPopup(getFirebaseAuth(), googleProvider);
      await syncFirebaseSession(result.user);
      router.replace("/dashboard");
      router.refresh();
    } catch (err) {
      setError(firebaseAuthError(err));
    } finally {
      setGoogleBusy(false);
    }
  }

  return (
    <AuthLayout register={register}>
      <div className="login-card-header">
        <h1>{register ? "Crea tu cuenta" : "Iniciar sesión"}</h1>
        <p>
          {register
            ? "Regístrate con tu correo o continúa con Google."
            : "Accede a tu cuenta para gestionar tus cobros por voz."}
        </p>
      </div>

      {expiredVisible && (
        <div className="login-error-banner login-warning-banner" role="status">
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
          <div className="input-icon-field">
            <Mail size={20} aria-hidden="true" />
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
          </div>
          {errors.email && (
            <small id="email-error" className="field-error">
              {errors.email}
            </small>
          )}
        </div>

        {/* Contraseña */}
        <div className="field">
          <label htmlFor="password">Contraseña</label>
          <div className="password-field input-icon-field">
            <LockKeyhole size={20} aria-hidden="true" />
            <input
              id="password"
              type={show ? "text" : "password"}
              autoComplete={register ? "new-password" : "current-password"}
              placeholder="••••••••"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              aria-invalid={!!errors.password}
              aria-describedby={errors.password ? "password-error" : undefined}
              disabled={busy || googleBusy}
              required
            />
            <button
              type="button"
              onClick={() => setShow(!show)}
              disabled={busy || googleBusy}
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
        {!register && (
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
        )}

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
          {!busy && <ArrowRight size={24} aria-hidden="true" />}
        </Button>
      </form>

      {/* Divisor */}
      <div className="login-divider">
        <span>O inicia sesión con</span>
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
        {register ? "¿Ya tienes una cuenta?" : "¿No tienes una cuenta?"}{" "}
        <Link
          href={register ? "/login" : "/register"}
          className="login-register-link"
        >
          {register ? "Iniciar sesión" : "Regístrate"}
        </Link>
      </p>
    </AuthLayout>
  );
}

function GoogleIcon() {
  return <Image src="/brand/v2/11fc4.svg" width={24} height={24} alt="" />;
}
