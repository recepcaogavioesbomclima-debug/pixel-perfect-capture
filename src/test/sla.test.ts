import { describe, expect, it } from "vitest";

import { DEFAULT_SLA as S, alertLevel, complianceRate, deadlineFor, elapsedSeconds, finalStatus, isHumanReply } from "@/lib/sla";

const at = (iso: string) => new Date(iso);

describe("SLA", () => {
  it("1. primeiro contato tem prazo de 2 minutos", () => expect(deadlineFor(S, "FIRST", false)).toBe(120));
  it("2. conversa em andamento tem prazo de 5 minutos", () => expect(deadlineFor(S, "ONGOING", false)).toBe(300));
  it("3. lead quente tem prazo de 1 minuto", () => expect(deadlineFor(S, "ONGOING", true)).toBe(60));
  it("4. aviso aos 50% do prazo", () => {
    expect(alertLevel(S, 59, 120)).toBe(0);
    expect(alertLevel(S, 60, 120)).toBe(1);
  });
  it("5. atrasado ao estourar o prazo", () => expect(alertLevel(S, 120, 120)).toBe(2));
  it("6. crítico ao dobrar o prazo", () => expect(alertLevel(S, 240, 120)).toBe(3));
  it("7. resposta no limite conta como no prazo", () => expect(finalStatus(S, 120, 120)).toBe("ON_TIME"));
  it("8. resposta entre 1x e 2x é atrasada; acima é crítica", () => {
    expect(finalStatus(S, 121, 120)).toBe("LATE");
    expect(finalStatus(S, 241, 120)).toBe("CRITICAL");
  });
  it("9. automação não encerra a espera; atendente sim", () => {
    expect(isHumanReply("auto:exec:1", "SENT")).toBe(false);
    expect(isHumanReply("inbox:abc", "SENT")).toBe(true);
    expect(isHumanReply(null, "DELIVERED")).toBe(true);
  });
  it("10. envio não confirmado não conta como resposta", () => expect(isHumanReply("inbox:abc", "FAILED")).toBe(false));
  it("11. fora do horário de atendimento o relógio para", () => {
    const s = { ...S, continuous: false, biz_start_hour: 8, biz_end_hour: 18 };
    // 21:00 -> 08:30 do dia seguinte (horário de Brasília) = 30 minutos contados
    expect(elapsedSeconds(s, at("2026-10-14T00:00:00Z"), at("2026-10-14T11:30:00Z"))).toBe(1800);
  });
  it("12. cumprimento ignora conversas encerradas sem resposta", () =>
    expect(complianceRate([{ final_status: "ON_TIME" }, { final_status: "LATE" }, { final_status: "CLOSED" }])).toBe(50));
});
