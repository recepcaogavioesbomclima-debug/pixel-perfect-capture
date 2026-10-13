import { describe, expect, it } from "vitest";

import { computeTrend, isHot, levelFor, smoothScore, validateAnalysis } from "@/lib/interest";

describe("score de interesse", () => {
  it("niveis seguem a escala 0-20/21-40/41-60/61-80/81-100", () => {
    expect(levelFor(20)).toBe("MUITO BAIXO");
    expect(levelFor(21)).toBe("BAIXO");
    expect(levelFor(50)).toBe("MÉDIO");
    expect(levelFor(70)).toBe("ALTO");
    expect(levelFor(81)).toBe("MUITO ALTO");
  });

  it("lead quente ativa no limite (80) e desativa abaixo", () => {
    expect(isHot(80, 80)).toBe(true);
    expect(isHot(79, 80)).toBe(false);
  });

  it("tendencia: 58 -> 76 é AUMENTANDO; queda consistente é DIMINUINDO; pequena variação é ESTÁVEL", () => {
    expect(computeTrend([58], 76)).toBe("AUMENTANDO");
    expect(computeTrend([70, 65, 60], 30)).toBe("DIMINUINDO");
    expect(computeTrend([60], 63)).toBe("ESTAVEL");
    expect(computeTrend([], 50)).toBe("ESTAVEL");
  });

  it("saida invalida da IA é rejeitada e score fica entre 0 e 100", () => {
    expect(validateAnalysis({ intent: "X" })).toBeNull();
    expect(validateAnalysis({ score: 150, intent: "QUER SE MATRICULAR", objection: "NENHUMA", reasons: [] })!.score).toBe(100);
    expect(validateAnalysis({ score: 70, intent: "INVENTADA", objection: "PREÇO", reasons: [] })!.intent).toBe("INDEFINIDO");
  });

  it("sem motivos registra evidências insuficientes", () => {
    const a = validateAnalysis({ score: 10, intent: "INDEFINIDO", objection: "NENHUMA", reasons: [] })!;
    expect(a.reasons[0]?.text).toMatch(/insuficientes/);
  });

  it("desinteresse explicito pode derrubar o score; outros saltos são limitados", () => {
    expect(smoothScore(80, 10, "SEM INTERESSE")).toBe(10);
    expect(smoothScore(10, 95, "PRONTO PARA COMPRAR")).toBe(50);
  });
});
