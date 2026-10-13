import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Lead, MessageStatus, Temperature } from "./inbox-types";

/** Monta a lista de conversas da Central de Atendimento a partir das tabelas reais. */
export const listInbox = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async (): Promise<Lead[]> => {
    const { getDb } = await import("./db.server");
    const db = getDb();
    const [msgs, leads, ai, interest, execs] = await Promise.all([
      db.from("messages").select("id,phone,direction,content,status,created_at,execution_id").order("created_at", { ascending: false }).limit(2000),
      db.from("leads").select("phone,name,created_at"),
      db.from("contact_ai").select("phone,paused,assigned_name,assigned_at"),
      db.from("lead_interest").select("phone,score,hot,reasons,level"),
      db.from("automation_executions").select("phone,status,current_step,next_run_at,last_error,automation_id,automations(name)").order("created_at", { ascending: false }),
    ]);
    const byPhone = new Map<string, any[]>();
    for (const m of msgs.data ?? []) {
      if (!byPhone.has(m.phone)) byPhone.set(m.phone, []);
      byPhone.get(m.phone)!.push(m);
    }
    for (const l of leads.data ?? []) if (!byPhone.has(l.phone)) byPhone.set(l.phone, []);

    const result: Lead[] = [];
    let i = 0;
    for (const [phone, list] of byPhone) {
      list.sort((a, b) => a.created_at.localeCompare(b.created_at));
      const lead = (leads.data ?? []).find((l) => l.phone === phone);
      const c = (ai.data ?? []).find((x) => x.phone === phone);
      const it = (interest.data ?? []).find((x) => x.phone === phone);
      const ex: any = (execs.data ?? []).find((x) => x.phone === phone);
      const score = it?.score ?? 0;
      const temperature: Temperature = it?.hot || score >= 70 ? "QUENTE" : score >= 40 ? "MORNO" : "FRIO";
      const last = list[list.length - 1];
      const lastOutIdx = list.map((m) => m.direction).lastIndexOf("OUT");
      const unread = list.slice(lastOutIdx + 1).filter((m) => m.direction === "IN").length;
      const reasons = Array.isArray(it?.reasons) ? (it!.reasons as unknown[]).map((r: any) => (typeof r === "string" ? r : r?.reason ?? r?.label ?? JSON.stringify(r))) : [];
      result.push({
        phone,
        name: lead?.name || `+${phone}`,
        avatarColor: i++ % 6,
        origin: "WhatsApp",
        enteredAt: lead?.created_at ?? list[0]?.created_at ?? new Date().toISOString(),
        temperature,
        score,
        scoreReasons: reasons,
        status: c?.assigned_name ? "ONLINE" : last?.direction === "IN" ? "AGUARDANDO" : "ENCERRADO",
        handler: c?.assigned_name ? "HUMANO" : "AUTOMACAO",
        attendant: c?.assigned_name ?? null,
        unread,
        automation: {
          name: ex?.automations?.name ?? null,
          step: ex ? `Etapa ${ex.current_step + 1} · ${ex.status}` : null,
          lastAction: ex?.last_error ?? null,
          nextAction: ex && ["PENDING", "RUNNING", "WAITING"].includes(ex.status) ? `Próxima execução ${new Date(ex.next_run_at).toLocaleString("pt-BR")}` : null,
        },
        history: [
          ...(lead ? [{ at: lead.created_at, label: "Lead criado" }] : []),
          ...(c?.assigned_at ? [{ at: c.assigned_at, label: `${c.assigned_name} assumiu o atendimento` }] : []),
        ],
        messages: list.map((m) => ({
          id: m.id,
          direction: m.direction === "IN" ? "IN" : "OUT",
          content: m.content ?? "",
          at: m.created_at,
          status: m.direction === "OUT" ? (m.status as MessageStatus) : undefined,
          author: m.direction === "OUT" ? (m.execution_id ? "Automação" : "Atendente") : undefined,
        })),
      });
    }
    result.sort((a, b) => (b.messages.at(-1)?.at ?? b.enteredAt).localeCompare(a.messages.at(-1)?.at ?? a.enteredAt));
    return result;
  });

/** Envio real pelo mesmo caminho da automação (sendMessageIdempotent). */
export const sendInboxMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => z.object({ phone: z.string().min(8).max(40), content: z.string().min(1).max(4000), key: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { sendMessageIdempotent } = await import("./engine.server");
    try {
      await sendMessageIdempotent({ phone: data.phone, content: data.content, idempotencyKey: `inbox:${data.key}` });
      return { ok: true, error: null as string | null };
    } catch (e: any) {
      return { ok: false, error: String(e?.message ?? e) };
    }
  });
