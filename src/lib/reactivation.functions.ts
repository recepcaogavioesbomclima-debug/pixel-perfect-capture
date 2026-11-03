import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Campanhas e itens (somente leitura, como o atendente logado). */
export const getReactivation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id?: string | null }) => ({ id: d?.id ?? null }))
  .handler(async ({ data, context }) => {
    const sb = context.supabase;
    const { data: campaigns, error } = await sb
      .from("reactivation_campaigns").select("*").order("created_at", { ascending: false }).limit(20);
    if (error) throw new Error(error.message);
    const id = data.id ?? campaigns?.[0]?.id ?? null;
    if (!id) return { campaigns: campaigns ?? [], items: [], current: null };
    const { data: items, error: e2 } = await sb
      .from("reactivation_items")
      .select("id,phone,name,decision,confidence,reason,stage,evidence,message,status,error,sent_at,review_action")
      .eq("campaign_id", id).order("confidence", { ascending: false, nullsFirst: false }).limit(1000);
    if (e2) throw new Error(e2.message);
    return { campaigns: campaigns ?? [], items: items ?? [], current: id };
  });

export const createReactivation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), interval: z.number().int().min(5).max(3600) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: id, error } = await context.supabase.rpc("reactivation_create", { _date: data.date, _interval: data.interval });
    if (error) throw new Error(error.message);
    return { id };
  });

export const controlReactivation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ id: z.string().uuid(), action: z.enum(["SEND", "PAUSE", "RESUME", "CANCEL"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: ok, error } = await context.supabase.rpc("reactivation_control", { _id: data.id, _action: data.action });
    if (error) throw new Error(error.message);
    return { ok };
  });

export const reviewReactivation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ item: z.string().uuid(), send: z.boolean(), message: z.string().max(1500) }).parse(d))
  .handler(async ({ data, context }) => {
    if (data.send && !data.message.trim()) throw new Error("Escreva a mensagem antes de aprovar");
    const { data: ok, error } = await context.supabase.rpc("reactivation_review", { _item: data.item, _send: data.send, _message: data.message });
    if (error) throw new Error(error.message);
    return { ok };
  });

/** Avança a fila com a tela aberta (o agendador faz o mesmo a cada minuto). */
export const tickReactivation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { runReactivationWorker } = await import("./reactivation.server");
    return runReactivationWorker();
  });
