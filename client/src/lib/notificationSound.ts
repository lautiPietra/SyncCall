let audioContext: AudioContext | null = null;

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') {
    return null;
  }
  const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) {
    return null;
  }
  if (!audioContext) {
    audioContext = new Ctor();
  }
  return audioContext;
}

function playTone(ctx: AudioContext, frequency: number, startTime: number, duration: number, peakGain: number): void {
  const oscillator = ctx.createOscillator();
  const gainNode = ctx.createGain();
  oscillator.type = 'sine';
  oscillator.frequency.value = frequency;

  // Ataque rápido y caída exponencial: evita el "click" de un volumen que arranca/corta en seco.
  gainNode.gain.setValueAtTime(0, startTime);
  gainNode.gain.linearRampToValueAtTime(peakGain, startTime + 0.012);
  gainNode.gain.exponentialRampToValueAtTime(0.0001, startTime + duration);

  oscillator.connect(gainNode);
  gainNode.connect(ctx.destination);
  oscillator.start(startTime);
  oscillator.stop(startTime + duration);
}

/**
 * "Ding" corto de dos notas, sintetizado con Web Audio (sin depender de un archivo de audio
 * externo), en el espíritu del sonido de notificación de mensaje de Discord.
 */
export function playMessageNotificationSound(): void {
  const ctx = getAudioContext();
  if (!ctx) {
    return;
  }
  if (ctx.state === 'suspended') {
    // Si el navegador todavía no permitió audio (sin gesto del usuario), lo intenta igual;
    // si falla no pasa nada, simplemente no suena esta vez.
    void ctx.resume().catch(() => {});
  }

  const now = ctx.currentTime;
  playTone(ctx, 740, now, 0.16, 0.16); // F#5
  playTone(ctx, 988, now + 0.09, 0.22, 0.16); // B5
}

/**
 * Ringtone de llamada entrante: mismo sintetizador que el "ding" de mensajes, pero en loop
 * (dos tonos cortos repetidos, al estilo tono de teléfono clásico) hasta que se llame al
 * handle de corte devuelto (al aceptar, rechazar, cancelar o que se corte la llamada).
 */
export function playRingtone(): () => void {
  const ctx = getAudioContext();
  if (!ctx) {
    return () => {};
  }
  if (ctx.state === 'suspended') {
    void ctx.resume().catch(() => {});
  }

  const RING_INTERVAL_MS = 2500;
  const triggerRing = (): void => {
    const now = ctx.currentTime;
    playTone(ctx, 600, now, 0.35, 0.14);
    playTone(ctx, 600, now + 0.45, 0.35, 0.14);
  };

  triggerRing();
  const intervalId = window.setInterval(triggerRing, RING_INTERVAL_MS);
  return () => window.clearInterval(intervalId);
}

/**
 * Tono corto y descendente (al revés del "ding" de mensaje) para marcar que una llamada
 * terminó, sea porque colgaste vos o porque se cortó del otro lado.
 */
export function playCallEndSound(): void {
  const ctx = getAudioContext();
  if (!ctx) {
    return;
  }
  if (ctx.state === 'suspended') {
    void ctx.resume().catch(() => {});
  }

  const now = ctx.currentTime;
  playTone(ctx, 520, now, 0.18, 0.15);
  playTone(ctx, 340, now + 0.1, 0.24, 0.15);
}
