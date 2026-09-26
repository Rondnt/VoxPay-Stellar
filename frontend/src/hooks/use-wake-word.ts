import { useEffect, useRef } from "react";

// La Web Speech API no está en lib.dom.d.ts -- tipos mínimos para lo que usamos.
interface SpeechRecognitionResultLike {
  0: { transcript: string };
}
interface SpeechRecognitionEventLike extends Event {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}
interface SpeechRecognitionErrorEventLike extends Event {
  error: string;
}
interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start(): void;
  stop(): void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getRecognitionCtor(): SpeechRecognitionCtor | null {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export const isWakeWordSupported =
  typeof window !== "undefined" && !!getRecognitionCtor();

// "Vox" solo (sin "Pay") se descartó: probado en vivo, el reconocimiento lo escucha como "box" o
// "vos" -- nunca como "vox"/"voz" -- y "vos" es el pronombre informal de uso diario en Perú y
// Argentina, así que solo esa palabra dispararía falsos positivos todo el tiempo. La palabra
// completa "VoxPay" agrega una segunda sílaba distintiva ("pay") que ninguna palabra común del
// español tiene pegada atrás de "box"/"vos"/"voz", así que exigir ambas sílabas juntas baja mucho
// el choque con habla normal. Se generan todas las combinaciones de sílaba1+sílaba2 (con y sin
// espacio) porque no sabemos de antemano cuál va a transcribir el reconocimiento.
const FIRST_SYLLABLE = ["box", "vos", "voz", "vox"];
const SECOND_SYLLABLE = ["pay", "pei"];
const WAKE_PHRASES = FIRST_SYLLABLE.flatMap((first) =>
  SECOND_SYLLABLE.flatMap((second) => [`${first}${second}`, `${first} ${second}`]),
);
const RETRY_DELAY_MS = 800;
// Cuánto esperar como máximo la confirmación de que la sesión de reconocimiento realmente se
// cerró (onend) antes de avisar igual -- red de seguridad si el navegador no dispara el evento.
const RELEASE_CONFIRM_TIMEOUT_MS = 1200;

function normalize(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(new RegExp("[̀-ͯ]", "g"), "")
    .replace(/[^\w\s]/g, "")
    .trim();
}

/**
 * Detección de palabra de activación ("VoxPay") en segundo plano -- Web Speech API nativa del
 * navegador (gratis, sin pasar por Groq/nuestro backend).
 *
 * Nota de privacidad: mientras `enabled` es true, el navegador transmite el audio del micrófono a
 * los servidores de reconocimiento de Google (así funciona esta API en Chrome/Edge) -- no pasa
 * por nuestro servidor, pero sale del local del comerciante de forma continua mientras está
 * activo.
 *
 * Punto crítico: al detectar la palabra, NO alcanza con pedir `recognition.stop()` y avisar en el
 * mismo instante -- stop() es asíncrono, y si el consumidor (record() en pos-view) intenta tomar
 * el micrófono antes de que el navegador termine de soltarlo de verdad, getUserMedia() puede
 * colgarse o fallar. Acá se espera la confirmación real (`onend`) antes de llamar a `onWake`, con
 * un timeout corto de respaldo por si ese evento no llega.
 */
export function useWakeWord(onWake: () => void, enabled: boolean) {
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const shouldRunRef = useRef(false);
  const onWakeRef = useRef(onWake);

  useEffect(() => {
    onWakeRef.current = onWake;
  }, [onWake]);

  useEffect(() => {
    const Ctor = getRecognitionCtor();
    console.log("[useWakeWord] efecto corre, enabled:", enabled, "soportado:", !!Ctor);
    if (!enabled || !Ctor) return;

    shouldRunRef.current = true;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let releaseConfirmTimer: ReturnType<typeof setTimeout> | null = null;
    let pendingWake = false;

    function fireWakeOnce() {
      if (!pendingWake) return;
      pendingWake = false;
      if (releaseConfirmTimer) clearTimeout(releaseConfirmTimer);
      releaseConfirmTimer = null;
      onWakeRef.current();
    }

    function startListening() {
      const Ctor2 = getRecognitionCtor();
      if (!Ctor2 || !shouldRunRef.current) return;
      const recognition = new Ctor2();
      recognition.lang = "es-PE";
      recognition.continuous = true;
      recognition.interimResults = true;

      recognition.onresult = (e) => {
        for (let i = e.resultIndex; i < e.results.length; i++) {
          const r = e.results[i];
          if (!r) continue;
          const normalized = normalize(r[0].transcript);
          console.log("[useWakeWord] oído:", JSON.stringify(normalized));
          if (WAKE_PHRASES.some((p) => normalized.includes(p))) {
            console.log('[useWakeWord] "VoxPay" detectado, activando...');
            shouldRunRef.current = false;
            pendingWake = true;
            recognition.stop();
            releaseConfirmTimer = setTimeout(fireWakeOnce, RELEASE_CONFIRM_TIMEOUT_MS);
            return;
          }
        }
      };

      recognition.onerror = (e) => {
        console.log("[useWakeWord] error:", e.error);
        if (e.error === "no-speech" || e.error === "aborted") return;
        if (shouldRunRef.current) retryTimer = setTimeout(startListening, RETRY_DELAY_MS);
      };

      recognition.onend = () => {
        recognitionRef.current = null;
        console.log("[useWakeWord] sesion terminada, pendingWake:", pendingWake);
        if (pendingWake) {
          fireWakeOnce();
          return;
        }
        // Nunca reiniciar sin ninguna pausa -- el navegador puede cortar la sesión casi al
        // instante en algunas condiciones (silencio, etc.), y sin este piso mínimo eso se
        // convierte en un bucle apretadísimo que nunca le da tiempo real de escucha.
        if (shouldRunRef.current) retryTimer = setTimeout(startListening, RETRY_DELAY_MS);
      };

      recognitionRef.current = recognition;
      try {
        recognition.start();
        console.log("[useWakeWord] escuchando...");
      } catch (err) {
        console.log("[useWakeWord] start() fallo:", err);
        // start() puede lanzar si ya hay una instancia activa (Strict Mode) -- reintentar.
        recognitionRef.current = null;
        if (shouldRunRef.current) retryTimer = setTimeout(startListening, RETRY_DELAY_MS);
      }
    }

    startListening();

    return () => {
      shouldRunRef.current = false;
      pendingWake = false;
      if (retryTimer) clearTimeout(retryTimer);
      if (releaseConfirmTimer) clearTimeout(releaseConfirmTimer);
      recognitionRef.current?.stop();
      recognitionRef.current = null;
    };
  }, [enabled]);
}
