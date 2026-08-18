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
