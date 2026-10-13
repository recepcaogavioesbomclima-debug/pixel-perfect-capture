import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

export const getResponsesBase = createServerFn({ method: "GET" }).handler(async () => {
  const { getDb } = await import("./db.server");
  const db = getDb() as any;
  const [{ data: info }, { data: intents }] = await Promise.all([
    db.from("business_info").select("content, fallback_reply").eq("id", true).maybeSingle(),
    db.from("intent_responses").select("*").order("priority", { ascending: false }).order("intent"),
  ]);
  return {
    content: (info?.content ?? "") as string,
    fallbackReply: (info?.fallback_reply ?? "") as string,
    intents: (intents ?? []) as {
      id: string;
      intent: string;
      examples: string;
      response: string;
      alternatives: string[];
      priority: number;
      active: boolean;
    }[],
  };
});

export const saveBusinessInfo = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ content: z.string().max(20000), fallbackReply: z.string().min(1).max(1000) }).parse(d))
  .handler(async ({ data }) => {
    const { getDb } = await import("./db.server");
    const { error } = await (getDb() as any)
      .from("business_info")
      .upsert({ id: true, content: data.content, fallback_reply: data.fallbackReply, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const saveIntent = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        id: z.string().uuid().optional(),
        intent: z.string().min(1).max(100),
        examples: z.string().max(2000),
        response: z.string().max(4000),
        alternatives: z.array(z.string().max(4000)).max(10),
        priority: z.number().int().min(0).max(100),
        active: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { getDb } = await import("./db.server");
    const db = getDb() as any;
    const { id, ...row } = data;
    const { error } = id
      ? await db.from("intent_responses").update(row).eq("id", id)
      : await db.from("intent_responses").insert(row);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteIntent = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data }) => {
    const { getDb } = await import("./db.server");
    await (getDb() as any).from("intent_responses").delete().eq("id", data.id);
    return { ok: true };
  });

export const getGlobalReply = createServerFn({ method: "GET" }).handler(async () => {
  const { getDb } = await import("./db.server");
  const db = getDb() as any;
  const [{ data: cfg }, { data: msgs }, { data: contacts }] = await Promise.all([
    db.from("global_reply_settings").select("*").eq("id", true).maybeSingle(),
    db.from("messages").select("phone, created_at").eq("direction", "IN").order("created_at", { ascending: false }).limit(200),
    db.from("contact_ai").select("phone, paused, last_reply_at, assigned_name, assigned_at"),
  ]);
  const map = new Map<string, any>((contacts ?? []).map((c: any) => [c.phone, c]));
  const seen = new Set<string>();
  const recent: { phone: string; lastAt: string; paused: boolean; lastReplyAt: string | null; assignedName: string | null; assignedAt: string | null }[] = [];
  for (const m of msgs ?? []) {
    if (!m.phone || seen.has(m.phone)) continue;
    seen.add(m.phone);
    const c = map.get(m.phone);
    recent.push({ phone: m.phone, lastAt: m.created_at, paused: Boolean(c?.paused), lastReplyAt: c?.last_reply_at ?? null, assignedName: c?.assigned_name ?? null, assignedAt: c?.assigned_at ?? null });
    if (recent.length >= 30) break;
  }
  return {
    settings: cfg as { enabled: boolean; reply_new_leads: boolean; reply_existing: boolean; context_messages: number; min_interval_seconds: number },
    recent,
  };
});

export const saveGlobalReply = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z.object({
      enabled: z.boolean(),
      reply_new_leads: z.boolean(),
      reply_existing: z.boolean(),
      context_messages: z.number().int().min(1).max(50),
      min_interval_seconds: z.number().int().min(5).max(600),
    }).parse(d),
  )
  .handler(async ({ data }) => {
    const { getDb } = await import("./db.server");
    const { error } = await (getDb() as any).from("global_reply_settings").update({ ...data, updated_at: new Date().toISOString() }).eq("id", true);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const setContactAi = createServerFn({ method: "POST" })
  .inputValidator((d) => z.object({ phone: z.string().min(8).max(20), paused: z.boolean() }).parse(d))
  .handler(async ({ data }) => {
    const { getDb, log } = await import("./db.server");
    const { error } = await (getDb() as any).from("contact_ai").upsert({ phone: data.phone, paused: data.paused, pending_reply_at: null, updated_at: new Date().toISOString() });
    if (error) throw new Error(error.message);
    await log(data.paused ? "CONTACT_AI_PAUSED" : "CONTACT_AI_RESUMED", "OK", { phone: data.phone });
    return { ok: true };
  });
