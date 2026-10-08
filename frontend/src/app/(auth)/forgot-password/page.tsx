"use client";
import { useState, type FormEvent } from "react";
import Link from "next/link";
import { sendPasswordResetEmail } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase";
import { firebaseAuthError } from "@/lib/firebase-auth";
import { Button, Notice } from "@/components/ui";
import { AuthLayout } from "@/components/auth-layout";
import { Mail } from "lucide-react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError("Ingresa un correo válido.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      await sendPasswordResetEmail(getFirebaseAuth(), email.trim());
      setSent(true);
    } catch (err) {
      if (
        err &&
        typeof err === "object" &&
        "code" in err &&
        err.code === "auth/user-not-found"
      )
        setSent(true);
      else setError(firebaseAuthError(err));
    } finally {
      setBusy(false);
    }
  }
  return (
    <AuthLayout>
      <div className="login-card-header">
        <h1>Recupera tu acceso</h1>
        <p>Te enviaremos las instrucciones a tu correo.</p>
      </div>
      {sent ? (
        <Notice success>
          Si este correo tiene una cuenta, recibirás un enlace para cambiar tu
          contraseña. Revisa también la carpeta de spam.
        </Notice>
      ) : (
        <form onSubmit={submit} className="login-form-stack" noValidate>
          <div className="field">
            <label htmlFor="email">Correo electrónico</label>
            <div className="input-icon-field">
              <Mail size={20} aria-hidden="true" />
              <input
                id="email"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={busy}
                required
              />
            </div>
          </div>
          {error && <Notice error>{error}</Notice>}
          <Button type="submit" busy={busy}>
            Enviar instrucciones
          </Button>
        </form>
      )}
      <Link href="/login" className="login-register-link">
        Volver a iniciar sesión
      </Link>
    </AuthLayout>
  );
}
