/** ~1 mensaje / 300ms por usuario, con ráfaga corta permitida (bucket de 5 tokens). */
const CAPACITY = 5;
const REFILL_MS = 300;

interface Bucket {
  tokens: number;
  lastRefill: number;
}

const buckets = new Map<string, Bucket>();

export function consumeMessageToken(userId: string): boolean {
  const now = Date.now();
  const bucket = buckets.get(userId) ?? { tokens: CAPACITY, lastRefill: now };

  const refillCount = Math.floor((now - bucket.lastRefill) / REFILL_MS);
  if (refillCount > 0) {
    bucket.tokens = Math.min(CAPACITY, bucket.tokens + refillCount);
    bucket.lastRefill = now;
  }

  if (bucket.tokens <= 0) {
    buckets.set(userId, bucket);
    return false;
  }

  bucket.tokens -= 1;
  buckets.set(userId, bucket);
  return true;
}

/** Se llama al desconectar la última sesión del usuario, para no acumular buckets indefinidamente en memoria. */
export function clearMessageBucket(userId: string): void {
  buckets.delete(userId);
}
