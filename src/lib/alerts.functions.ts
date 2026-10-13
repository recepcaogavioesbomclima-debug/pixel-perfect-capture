import { createServerFn } from "@tanstack/react-start";

/**
 * Alertas recentes de mensagens recebidas (gerados pelo gatilho em messages).
 * Usado pelo painel para exibir o bump mesmo sem atendente logado; a
 * temperatura vem junto, mas é opcional (AINDA NÃO ANALISADO quando ausente).
 */
export const listRecentAlerts = createServerFn({ method: "GET" })
  .inputValidator((d: { since?: string | null }) => ({
    since: d?.since && !Number.isNaN(Date.parse(d.since)) ? new Date(d.since).toISOString() : null,
  }))
  .handler(async ({ data }) => {
    const serverNow = new Date().toISOString();
    if (!data.since) return { serverNow, alerts: [] as RecentAlert[] };
    const { getDb } = await import("./db.server");
    const db = getDb() as any;
    // nunca volta mais de 60s: alertas antigos não devem reaparecer
    const floor = new Date(Math.max(Date.parse(data.since), Date.now() - 60_000)).toISOString();
    const { data: rows, error } = await db
      .from("inbound_alerts")
      .select("id, message_id, phone, contact_name, preview, received_at")
      .gt("received_at", floor)
      .order("received_at", { ascending: true })
      .limit(20);
    if (error) {
      console.error("[ALERTS] falha ao ler inbound_alerts:", error.message);
      throw new Error("Falha ao buscar alertas");
    }
    const phones = [...new Set((rows ?? []).map((r: any) => r.phone))];
    const { data: temps } = phones.length
      ? await db.from("lead_interest").select("phone, score, level, hot, analyzed_at").in("phone", phones)
      : { data: [] };
    const byPhone = new Map((temps ?? []).filter((t: any) => t.analyzed_at).map((t: any) => [t.phone, t]));
    const alerts: RecentAlert[] = (rows ?? []).map((r: any) => {
      const t: any = byPhone.get(r.phone);
      return { ...r, temp: t ? { score: t.score, level: t.level, hot: t.hot } : null };
    });
    return { serverNow, alerts };
  });

export interface RecentAlert {
  id: string;
  message_id: string;
  phone: string;
  contact_name: string | null;
  preview: string | null;
  received_at: string;
  temp: { score: number; level: string; hot: boolean } | null;
}
