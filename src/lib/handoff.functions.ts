import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const phoneSchema = z.object({ phone: z.string().min(8).max(40) });

/** Assume a conversa. O banco garante que só um atendente fica com ela. */
export const claimConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => phoneSchema.parse(d))
  .handler(async ({ data, context }) => {
    const claims = context.claims as { email?: string } | undefined;
    const name = claims?.email ?? "Atendente";
    const { data: rows, error } = await context.supabase.rpc("claim_conversation", {
      _phone: data.phone,
      _name: name,
    });
    if (error) throw new Error(error.message);
    const row = (rows as any[])?.[0];
    const { log } = await import("./db.server");
    await log(row?.ok ? "HUMAN_HANDOFF_CLAIMED" : "HUMAN_HANDOFF_DENIED", row?.ok ? "OK" : "WARN", {
      phone: data.phone,
      by: name,
      assignedTo: row?.assigned_name ?? null,
    });
    return {
      ok: Boolean(row?.ok),
      assignedName: (row?.assigned_name ?? null) as string | null,
      assignedAt: (row?.assigned_at ?? null) as string | null,
    };
  });

/** Encerra o atendimento manual e devolve a conversa para a IA. */
export const releaseConversation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d) => phoneSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { data: ok, error } = await context.supabase.rpc("release_conversation", { _phone: data.phone });
    if (error) throw new Error(error.message);
    const { log } = await import("./db.server");
    await log(ok ? "HUMAN_HANDOFF_RELEASED" : "HUMAN_HANDOFF_RELEASE_DENIED", ok ? "OK" : "WARN", { phone: data.phone });
    return { ok: Boolean(ok) };
  });
