import { describe, expect, it } from "vitest";

import { canQueue, confirmedSend, validateDecision } from "@/lib/reactivation";

const history = [
  { id: "1", direction: "IN", content: "Quanto custa o plano mensal?", created_at: "2026-01-01" },
  { id: "2", direction: "OUT", content: "R$ 99", created_at: "2026-01-01" },
];
const base = { decision: "REACTIVATE" as const, confidence: 90, reason: "Perguntou preço", stage: "Preço", evidence: ["Quanto custa o plano mensal?"], message: "Oi! Ainda quer saber do plano?" };

describe("reativação", () => {
  it("aceita reativar com evidência real do cliente e confiança >= 80", () => {
    expect(validateDecision(base, history).decision).toBe("REACTIVATE");
  });
  it("manda para revisão com confiança abaixo de 80", () => {
    expect(validateDecision({ ...base, confidence: 79 }, history).decision).toBe("REVIEW");
  });
  it("manda para revisão quando a evidência foi inventada", () => {
    expect(validateDecision({ ...base, evidence: ["Quero matricular hoje"] }, history).decision).toBe("REVIEW");
  });
  it("não aceita evidência tirada de mensagem da academia", () => {
    expect(validateDecision({ ...base, evidence: ["R$ 99"] }, history).decision).toBe("REVIEW");
  });
  it("só entra na fila decisão REACTIVATE analisada e com mensagem", () => {
    expect(canQueue("REACTIVATE", "ANALYZED", "Oi")).toBe(true);
    expect(canQueue("REVIEW", "ANALYZED", "Oi")).toBe(false);
    expect(canQueue("REACTIVATE", "ANALYZED", " ")).toBe(false);
  });
  it("envio só é confirmado com status do provedor e id da mensagem", () => {
    expect(confirmedSend("SENT", "abc")).toBe(true);
    expect(confirmedSend("SENT", null)).toBe(false);
    expect(confirmedSend("QUEUED", "abc")).toBe(false);
  });
});
