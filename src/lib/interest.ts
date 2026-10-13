/** Regras puras do Score Inteligente de Interesse (sem acesso a banco/IA). */

export const LOGIC_VERSION = "v1";

export const INTENTS = [
  "CURIOSIDADE",
  "PESQUISANDO",
  "COMPARANDO",
  "INTERESSADO",
  "QUER VISITAR",
  "QUER SE MATRICULAR",
  "PRONTO PARA COMPRAR",
  "SEM INTERESSE",
  "INDEFINIDO",
] as const;

export const OBJECTIONS = [
  "PREÇO",
  "FORMA DE PAGAMENTO",
  "HORÁRIO",
  "LOCALIZAÇÃO",
  "DISTÂNCIA",
  "CONDIÇÕES DO PLANO",
  "PRECISA PENSAR",
  "PRECISA CONSULTAR OUTRA PESSOA",
  "SEM INTERESSE",
  "OUTRA",
  "NENHUMA",
] as const;

export type Trend = "AUMENTANDO" | "ESTAVEL" | "DIMINUINDO";
export interface Reason {
  text: string;
  evidence: string | null;
}
export interface Analysis {
  score: number;
  intent: (typeof INTENTS)[number];
  objection: (typeof OBJECTIONS)[number];
  reasons: Reason[];
}

export function levelFor(score: number): string {
  if (score <= 20) return "MUITO BAIXO";
  if (score <= 40) return "BAIXO";
  if (score <= 60) return "MÉDIO";
  if (score <= 80) return "ALTO";
  return "MUITO ALTO";
}

export function isHot(score: number, threshold: number) {
  return score >= threshold;
}

/**
 * Tendencia: compara o score atual com a media das ultimas `window` analises.
 * Variacoes menores que `minDelta` contam como ESTAVEL.
 */
export function computeTrend(previous: number[], current: number, window = 3, minDelta = 8): Trend {
  const recent = previous.slice(0, Math.max(1, window));
  if (!recent.length) return "ESTAVEL";
  const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
  const diff = current - avg;
  if (diff >= minDelta) return "AUMENTANDO";
  if (diff <= -minDelta) return "DIMINUINDO";
  return "ESTAVEL";
}

/** Valida e normaliza a saida da IA. Retorna null se for invalida. */
export function validateAnalysis(raw: unknown): Analysis | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as { score?: unknown; intent?: unknown; objection?: unknown; reasons?: unknown };
  const n = Number(r.score);
  if (!Number.isFinite(n)) return null;
  const score = Math.min(100, Math.max(0, Math.round(n)));
  const intent = INTENTS.includes(r.intent as never) ? (r.intent as Analysis["intent"]) : "INDEFINIDO";
  const objection = OBJECTIONS.includes(r.objection as never)
    ? (r.objection as Analysis["objection"])
    : "NENHUMA";
  const reasons = Array.isArray(r.reasons)
    ? (r.reasons as any[])
        .filter((x) => x && typeof x.text === "string" && x.text.trim())
        .slice(0, 6)
        .map((x) => ({
          text: String(x.text).slice(0, 200),
          evidence: typeof x.evidence === "string" && x.evidence.trim() ? String(x.evidence).slice(0, 300) : null,
        }))
    : [];
  return {
    score,
    intent,
    objection,
    reasons: reasons.length ? reasons : [{ text: "Evidências insuficientes na conversa.", evidence: null }],
  };
}

/** Limita oscilacoes bruscas: no maximo 40 pontos por analise, exceto desinteresse explicito. */
export function smoothScore(previous: number | null, next: number, intent: string) {
  if (previous == null || intent === "SEM INTERESSE") return next;
  const maxStep = 40;
  return Math.min(previous + maxStep, Math.max(previous - maxStep, next));
}
