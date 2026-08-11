const CONTROL_CHARS_REGEX = new RegExp(
  '[' + String.fromCharCode(0) + '-' + String.fromCharCode(8) +
    String.fromCharCode(11) + '-' + String.fromCharCode(12) +
    String.fromCharCode(14) + '-' + String.fromCharCode(31) + ']',
  'g',
);

/**
 * Solo quita caracteres de control (no imprimibles), preservando tab/salto de línea.
 * No hace escape de HTML: el contenido se renderiza como texto plano en React (nunca
 * dangerouslySetInnerHTML), que ya escapa automáticamente — escaparlo acá de nuevo
 * mostraría entidades literales ("AT&amp;T") en vez del texto real.
 */
export function sanitizeMessageContent(content: string): string {
  return content.replace(CONTROL_CHARS_REGEX, '').trim();
}
