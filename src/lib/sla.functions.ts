import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Painel do SLA: atualiza os níveis de alerta e devolve ciclos + configuração. */
export const getSlaDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { days?: number }) => ({ days: Math.min(90, Math.max(1, Number(d?.days) || 7)) }))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await (supabaseAdmin as any).rpc("sla_tick");
    const since = new Date(Date.now() - data.days * 86_400_000).toISOString();
    const sb = context.supabase as any;
    const [{ data: settings }, { data: cycles, error }, { data: events }] = await Promise.all([
      sb.from("sla_settings").select("*").eq("id", true).maybeSingle(),
      sb.from("sla_cycles").select("*").or(`status.eq.OPEN,started_at.gte.${since}`).order("started_at", { ascending: false }).limit(500),
      sb.from("sla_events").select("*").gte("created_at", since).order("created_at", { ascending: false }).limit(50),
    ]);
    if (error) throw new Error(error.message);
    const phones = [...new Set((cycles ?? []).map((c: any) => c.phone))];
    const { data: leads } = phones.length
      ? await (supabaseAdmin as any).from("leads").select("phone, name").in("phone", phones)
      : { data: [] };
    const names: Record<string, string> = {};
    for (const l of leads ?? []) if (l.name) names[l.phone] = l.name;
    return { settings, cycles: cycles ?? [], events: events ?? [], names, now: new Date().toISOString() };
  });

const settingsSchema = z.object({
  first_response_s: z.number().int().min(10).max(86400),
  ongoing_s: z.number().int().min(10).max(86400),
  priority_s: z.number().int().min(10).max(86400),
  warn_pct: z.number().int().min(10).max(99),
  critical_mult: z.number().min(1.1).max(10),
  continuous: z.boolean(),
  biz_start_hour: z.number().int().min(0).max(23),
  biz_end_hour: z.number().int().min(1).max(24),
  biz_days: z.array(z.number().int().min(0).max(6)).min(1),
  alerts_enabled: z.boolean(),
  target_pct: z.number().int().min(1).max(100),
});

export const saveSlaSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => settingsSchema.parse(d))
  .handler(async ({ data, context }) => {
    if (data.biz_end_hour <= data.biz_start_hour) throw new Error("O fim do expediente deve ser depois do início.");
    const { error } = await (context.supabase as any)
      .from("sla_settings")
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq("id", true);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const closeSlaCycle = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ phone: z.string().min(8).max(40), reason: z.string().max(200).default("Encerrado") }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: ok, error } = await (context.supabase as any).rpc("sla_close", { _phone: data.phone, _reason: data.reason });
    if (error) throw new Error(error.message);
    return { ok: Boolean(ok) };
  });
