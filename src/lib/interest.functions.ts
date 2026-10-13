import { createServerFn } from "@tanstack/react-start";

export const listLeadInterest = createServerFn({ method: "GET" }).handler(async () => {
  const { getDb } = await import("./db.server");
  const db = getDb() as any;
  const { data, error } = await db
    .from("lead_interest")
    .select("phone, score, level, intent, objection, trend, hot, analyzed_at, last_error")
    .not("analyzed_at", "is", null)
    .order("score", { ascending: false })
    .limit(300);
  if (error) throw new Error(error.message);
  const phones = (data ?? []).map((r: any) => r.phone);
  const { data: leads } = phones.length
    ? await db.from("leads").select("phone, name").in("phone", phones)
    : { data: [] };
  const names = new Map((leads ?? []).map((l: any) => [l.phone, l.name]));
  return (data ?? []).map((r: any) => ({ ...r, name: (names.get(r.phone) as string | null) ?? null }));
});

export const getLeadInterest = createServerFn({ method: "GET" })
  .inputValidator((d: { phone: string }) => ({ phone: String(d.phone).slice(0, 40) }))
  .handler(async ({ data }) => {
    const { getDb } = await import("./db.server");
    const db = getDb() as any;
    const [{ data: current }, { data: history }] = await Promise.all([
      db.from("lead_interest").select("*").eq("phone", data.phone).maybeSingle(),
      db
        .from("lead_interest_history")
        .select("id, score, previous_score, level, intent, objection, trend, hot, reason, reasons, created_at")
        .eq("phone", data.phone)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    return { current: current ?? null, history: history ?? [] };
  });

export const getInterestSettings = createServerFn({ method: "GET" }).handler(async () => {
  const { getDb } = await import("./db.server");
  const { data } = await (getDb() as any).from("interest_settings").select("*").eq("id", true).maybeSingle();
  return data as { hot_threshold: number; trend_window: number; trend_min_delta: number; context_messages: number } | null;
});

export const saveInterestSettings = createServerFn({ method: "POST" })
  .inputValidator((d: { hotThreshold: number; trendWindow: number }) => ({
    hotThreshold: Math.min(100, Math.max(1, Math.round(Number(d.hotThreshold) || 80))),
    trendWindow: Math.min(10, Math.max(1, Math.round(Number(d.trendWindow) || 3))),
  }))
  .handler(async ({ data }) => {
    const { getDb } = await import("./db.server");
    const db = getDb() as any;
    const { error } = await db
      .from("interest_settings")
      .update({ hot_threshold: data.hotThreshold, trend_window: data.trendWindow, updated_at: new Date().toISOString() })
      .eq("id", true);
    if (error) throw new Error(error.message);
    // reavalia o indicador LEAD QUENTE com o novo limite
    await db.from("lead_interest").update({ hot: true }).gte("score", data.hotThreshold);
    await db.from("lead_interest").update({ hot: false }).lt("score", data.hotThreshold);
    return { ok: true };
  });
