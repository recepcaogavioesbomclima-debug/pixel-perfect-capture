export const ALERT_SECONDS = 5;

/** Segundos restantes, calculados pelo relógio (funciona mesmo com a aba em segundo plano). */
export function secondsLeft(shownAt: number, now: number, total = ALERT_SECONDS): number {
  const left = Math.ceil((shownAt + total * 1000 - now) / 1000);
  return Math.max(0, Math.min(total, left));
}
