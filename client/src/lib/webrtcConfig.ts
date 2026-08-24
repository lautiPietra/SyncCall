/**
 * Sin servidor TURN propio: solo STUN público de Google para resolver la IP/puerto público de
 * cada peer. Suficiente para la mayoría de las redes hogareñas, pero un peer detrás de un NAT
 * simétrico o un firewall corporativo estricto puede no lograr conectar — limitación conocida,
 * agregar TURN queda fuera de alcance por ahora (necesitaría infraestructura propia).
 */
export const ICE_SERVERS: RTCIceServer[] = [{ urls: 'stun:stun.l.google.com:19302' }];
