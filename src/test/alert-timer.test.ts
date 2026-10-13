import { describe, expect, it } from "vitest";

import { ALERT_SECONDS, secondsLeft } from "@/lib/alert-timer";

describe("alerta de nova mensagem", () => {
  it("dura exatamente 5 segundos", () => {
    expect(ALERT_SECONDS).toBe(5);
  });
  it("começa com 5 segundos", () => {
    expect(secondsLeft(1000, 1000)).toBe(5);
  });
  it("ainda visível aos 4,9 segundos", () => {
    expect(secondsLeft(0, 4900)).toBe(1);
  });
  it("chega a zero depois de 5 segundos", () => {
    expect(secondsLeft(1000, 6000)).toBe(0);
  });
  it("calcula certo ao voltar de segundo plano", () => {
    expect(secondsLeft(0, 2200)).toBe(3);
    expect(secondsLeft(0, 60000)).toBe(0);
  });
});
