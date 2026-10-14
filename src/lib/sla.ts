// Regras puras do SLA (espelham as funções sla_elapsed / sla_on_message / sla_tick do banco).

export interface SlaSettings {
  first_response_s: number;
  ongoing_s: number;
  priority_s: number;
  warn_pct: number;
  critical_mult: number;
  continuous: boolean;
  biz_start_hour: number;
  biz_end_hour: number;
  biz_days: number[];
  tz_offset_minutes: number;
  alerts_enabled: boolean;
  target_pct: number;
}

export const DEFAULT_SLA: SlaSettings = {
  first_response_s: 120,
  ongoing_s: 300,
  priority_s: 60,
  warn_pct: 50,
  critical_mult: 2,
  continuous: true,
  biz_start_hour: 6,
  biz_end_hour: 22,
  biz_days: [0, 1, 2, 3, 4, 5, 6],
  tz_offset_minutes: -180,
  alerts_enabled: true,
  target_pct: 90,
};

/** Prazo do ciclo: prioridade (lead quente) > primeira resposta > conversa em andamento. */
export function deadlineFor(s: SlaSettings, kind: "FIRST" | "ONGOING", priority: boolean) {
  if (priority) return s.priority_s;
  return kind === "FIRST" ? s.first_response_s : s.ongoing_s;
}

/** Segundos contados entre dois instantes, respeitando o horário comercial quando não é contínuo. */
export function elapsedSeconds(s: SlaSettings, from: Date, to: Date): number {
  if (to <= from) return 0;
  if (s.continuous) return Math.floor((to.getTime() - from.getTime()) / 1000);
  const off = s.tz_offset_minutes * 60_000;
  const lf = from.getTime() + off;
  const lt = to.getTime() + off;
  let total = 0;
  const day = new Date(lf);
  day.setUTCHours(0, 0, 0, 0);
  for (let d = day.getTime(); d <= lt; d += 86_400_000) {
    if (!s.biz_days.includes(new Date(d).getUTCDay())) continue;
    const ws = Math.max(lf, d + s.biz_start_hour * 3_600_000);
    const we = Math.min(lt, d + s.biz_end_hour * 3_600_000);
    if (we > ws) total += (we - ws) / 1000;
  }
  return Math.floor(total);
}

/** 0 = no prazo, 1 = atenção, 2 = atrasado, 3 = crítico. */
export function alertLevel(s: SlaSettings, elapsed: number, deadline: number): 0 | 1 | 2 | 3 {
  if (elapsed >= deadline * s.critical_mult) return 3;
  if (elapsed >= deadline) return 2;
  if (elapsed >= (deadline * s.warn_pct) / 100) return 1;
  return 0;
}

export function finalStatus(s: SlaSettings, wait: number, deadline: number) {
  if (wait <= deadline) return "ON_TIME" as const;
  if (wait <= deadline * s.critical_mult) return "LATE" as const;
  return "CRITICAL" as const;
}

/** Só resposta humana confirmada encerra a espera (automação não conta). */
export function isHumanReply(idempotencyKey: string | null, status: string) {
  const confirmed = ["SENT", "DELIVERED", "READ"].includes(status);
  return confirmed && (idempotencyKey === null || idempotencyKey.startsWith("inbox:"));
}

export function complianceRate(cycles: { final_status: string | null }[]) {
  const done = cycles.filter((c) => c.final_status && c.final_status !== "CLOSED");
  if (!done.length) return null;
  return Math.round((done.filter((c) => c.final_status === "ON_TIME").length / done.length) * 100);
}

export function fmtDuration(sec: number | null | undefined) {
  if (sec == null) return "—";
  if (sec < 60) return `${sec}s`;
  const m = Math.floor(sec / 60);
  if (m < 60) return `${m}min ${sec % 60}s`;
  return `${Math.floor(m / 60)}h ${m % 60}min`;
}
