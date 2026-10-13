import { createFileRoute } from "@tanstack/react-router";

import { getDb, log, normalizePhone } from "@/lib/db.server";
import { handleInboundReply, runPendingReplies } from "@/lib/engine.server";

/** Webhook REAL da Evolution API: /api/public/hooks/evolution?token=<WHAPI_WEBHOOK_TOKEN> */
export const Route = createFileRoute("/api/public/hooks/evolution")({
  server: {
    handlers: {
      GET: async () => new Response("ok"),
      POST: async ({ request }) => {
        const expected = process.env["WHAPI_WEBHOOK_TOKEN"];
        const token = new URL(request.url).searchParams.get("token");
        if (!expected || token !== expected) {
          console.error(`[WEBHOOK_REJECTED] ${expected ? "token invalido" : "WHAPI_WEBHOOK_TOKEN nao configurado"}`);
          return new Response("unauthorized", { status: 401 });
        }

        let payload: any;
        try {
          payload = await request.json();
        } catch {
          return new Response("invalid json", { status: 400 });
        }

        const event = String(payload?.event ?? "").toLowerCase();
        const db = getDb();
        let needsReply = false;
        const items: any[] = Array.isArray(payload?.data) ? payload.data : payload?.data ? [payload.data] : [];
        const eventId = items[0]?.key?.id ?? `${event}:${payload?.date_time ?? Date.now()}`;

        const { error: dup } = await db
          .from("webhook_events")
          .insert({ provider_event_id: `evo:${eventId}`, event_type: event, payload });
        if (dup) return new Response("duplicate");

        if (event === "messages.upsert") {
          for (const m of items) {
            if (m?.key?.fromMe) continue;
            const jid = String(m?.key?.remoteJid ?? "");
            if (!jid || jid.endsWith("@g.us")) continue;
            const phone = normalizePhone(jid.split("@")[0]!);
            const content =
              m?.message?.conversation ?? m?.message?.extendedTextMessage?.text ?? m?.messageType ?? "";
            const id = m?.key?.id ? String(m.key.id) : null;
            if (id) {
              const { data: known } = await db.from("messages").select("id").eq("provider_message_id", id).maybeSingle();
              if (known) continue;
            }
            await db.from("messages").insert({
              provider_message_id: id,
              phone,
              direction: "IN",
              content: String(content),
              type: String(m?.messageType ?? "text"),
              status: "RECEIVED",
              chat_id: jid,
            });
            console.log(`[MESSAGE_RECEIVED]\nFrom: ${phone}\nMessage ID: ${id}\nContent: ${content}`);
            await log("MESSAGE_RECEIVED", "OK", { phone, providerMessageId: id, provider: "evolution" });
            if (phone) needsReply = (await handleInboundReply(phone, String(content))) > 0 || needsReply;
          }
        } else {
          await log("EVOLUTION_EVENT", "OK", { event, state: payload?.data?.state ?? null });
        }

        await db
          .from("webhook_events")
          .update({ processed_at: new Date().toISOString() })
          .eq("provider_event_id", `evo:${eventId}`);
        if (needsReply) {
          await new Promise((r) => setTimeout(r, 5500));
          await runPendingReplies();
        }
        // Score de interesse: roda depois da resposta, falhas nao afetam o atendimento
        try {
          if (!needsReply) await new Promise((r) => setTimeout(r, 3500));
          const { runPendingInterest } = await import("@/lib/interest.server");
          await runPendingInterest();
        } catch (e) {
          console.error("[INTEREST]", e);
        }
        return Response.json({ ok: true });
      },
    },
  },
});
