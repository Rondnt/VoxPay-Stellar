import { useEffect, useState } from "react";

export type MicPermissionState = "granted" | "denied" | "prompt" | "unknown";

/**
 * Estado real del permiso de micrófono para este origen, vía la Permissions API -- así
 * `useWakeWord` sabe si puede arrancar solo (sin gesto del usuario) o si tiene que esperar a que
 * el comerciante haga clic una vez primero.
 *
 * Por qué hace falta esto: Chrome exige que la PRIMERA solicitud de micrófono venga de un gesto
 * real del usuario (clic) -- si SpeechRecognition intenta arrancar solo, desde un efecto, sin que
 * nadie tocó nada todavía, el navegador la aborta en silencio en loop. El clic manual en "Grabar
 * instrucción" (que dispara getUserMedia) es lo que realmente pide el permiso la primera vez; una
 * vez otorgado, queda guardado para el origen y "Vox" puede arrancar solo de ahí en más.
 */
export function useMicPermission(): MicPermissionState {
  const [state, setState] = useState<MicPermissionState>("unknown");

  useEffect(() => {
    let status: PermissionStatus | null = null;
    let cancelled = false;

    const nav = navigator as Navigator & {
      permissions?: { query(opts: { name: string }): Promise<PermissionStatus> };
    };
    // Sin Permissions API (o sin soporte para "microphone"): el estado inicial ya es "unknown",
    // no hace falta setearlo de nuevo -- solo dejar que el clic manual decida.
    if (!nav.permissions?.query) return;

    nav.permissions
      .query({ name: "microphone" as PermissionName })
      .then((s) => {
        if (cancelled) return;
        status = s;
        setState(s.state as MicPermissionState);
        s.onchange = () => setState(s.state as MicPermissionState);
      })
      .catch(() => setState("unknown"));

    return () => {
      cancelled = true;
      if (status) status.onchange = null;
    };
  }, []);

  return state;
}
