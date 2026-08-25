/**
 * `HTMLMediaElement.setSinkId` (elegir a qué salida de audio mandar la reproducción) solo lo
 * soportan navegadores basados en Chromium (no Firefox ni Safari) — de ahí el feature-detect
 * en tiempo de ejecución (los tipos ya están en el DOM lib, pero el método puede no existir).
 */
export function isAudioOutputSelectionSupported(): boolean {
  return typeof HTMLMediaElement !== 'undefined' && typeof HTMLMediaElement.prototype.setSinkId === 'function';
}

/** No hace nada si el navegador no soporta setSinkId, si no hay preferencia guardada (null =
 * dispositivo predeterminado del sistema), o si el elemento ya está mandando a ese destino. */
export function applyAudioOutputPreference(el: HTMLMediaElement, deviceId: string | null): void {
  if (!deviceId || typeof el.setSinkId !== 'function' || el.sinkId === deviceId) {
    return;
  }
  void el.setSinkId(deviceId).catch(() => {});
}
