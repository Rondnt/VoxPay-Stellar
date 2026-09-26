// Sintetizado con Web Audio API (dos tonos cortos, sin archivo de audio externo que cargar) --
// un "bloop" ascendente para confirmar de oído que VoxPay empezó a escuchar. Se toca apenas
// arranca la grabación real (recorder.start()), sin importar si la disparó la palabra de
// activación ("Vox") o un clic manual en el micrófono.
let sharedContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  const Ctor =
    window.AudioContext ||
    (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  if (!sharedContext) sharedContext = new Ctor();
  return sharedContext;
}

export function playActivationChime() {
  try {
    const ctx = getAudioContext();
    if (!ctx) return;
    // El contexto puede arrancar "suspended" cuando no hay un gesto del usuario justo en este
    // instante (p. ej. lo disparó la palabra de activación, no un clic) -- resume() es un no-op
    // si ya está corriendo.
    void ctx.resume();

    const now = ctx.currentTime;
    const playTone = (freq: number, startOffset: number, duration: number, peakGain: number) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, now + startOffset);
      gain.gain.setValueAtTime(0, now + startOffset);
      gain.gain.linearRampToValueAtTime(peakGain, now + startOffset + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + startOffset + duration);
      osc.connect(gain).connect(ctx.destination);
      osc.start(now + startOffset);
      osc.stop(now + startOffset + duration + 0.02);
    };

    // Quinta justa ascendente (A5 -> E6), corto y suave -- un "bloop-blip".
    playTone(880, 0, 0.09, 0.18);
    playTone(1318.5, 0.08, 0.12, 0.16);
  } catch {
    // Nunca debe romper el flujo de grabación (autoplay bloqueado, navegador sin Web Audio,
    // etc.) -- en el peor caso, simplemente no suena.
  }
}
