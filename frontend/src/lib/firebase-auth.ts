"use client";
import {
  browserLocalPersistence,
  browserSessionPersistence,
  setPersistence,
  type User,
} from "firebase/auth";
import { auth } from "./firebase";

export async function prepareFirebaseLogin(remember: boolean) {
  await setPersistence(
    auth,
    remember ? browserLocalPersistence : browserSessionPersistence,
  );
}

export async function syncFirebaseSession(user: User) {
  const response = await fetch("/api/firebase-session", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ idToken: await user.getIdToken() }),
  });
  if (!response.ok)
    throw new Error(
      "No se pudo validar la sesión. Vuelve a iniciar sesión; si acabas de registrarte, tu cuenta ya está creada.",
    );
}

export function firebaseAuthError(error: unknown): string {
  const code =
    error && typeof error === "object" && "code" in error
      ? String(error.code)
      : "";
  const messages: Record<string, string> = {
    "auth/invalid-credential": "El correo o la contraseña no son correctos.",
    "auth/wrong-password": "El correo o la contraseña no son correctos.",
    "auth/user-not-found": "El correo o la contraseña no son correctos.",
    "auth/email-already-in-use":
      "Este correo ya está registrado. Inicia sesión o recupera tu contraseña.",
    "auth/weak-password":
      "La contraseña no cumple los requisitos de seguridad del proyecto.",
    "auth/password-does-not-meet-requirements":
      "La contraseña no cumple los requisitos de seguridad del proyecto.",
    "auth/invalid-email": "Ingresa un correo válido.",
    "auth/operation-not-allowed":
      "Este método de acceso no está habilitado en Firebase Authentication.",
    "auth/unauthorized-domain":
      "Autoriza localhost en Firebase Authentication → Configuración → Dominios autorizados.",
    "auth/popup-blocked":
      "Permite ventanas emergentes o abre esta página en Chrome o Edge para iniciar sesión con Google.",
    "auth/popup-closed-by-user":
      "Se cerró la ventana de Google. Puedes intentarlo de nuevo.",
    "auth/cancelled-popup-request": "Ya hay una ventana de acceso abierta.",
    "auth/network-request-failed":
      "No pudimos conectar con Firebase. Revisa tu conexión.",
    "auth/too-many-requests":
      "Demasiados intentos. Espera unos minutos antes de volver a intentar.",
    "auth/user-disabled": "Esta cuenta está deshabilitada.",
    "auth/account-exists-with-different-credential":
      "Este correo utiliza otro método de acceso. Inicia sesión con ese método.",
  };
  return (
    messages[code] ??
    (code
      ? "No se pudo completar el acceso. Inténtalo de nuevo."
      : error instanceof Error
        ? error.message
        : "No se pudo completar el acceso.")
  );
}
