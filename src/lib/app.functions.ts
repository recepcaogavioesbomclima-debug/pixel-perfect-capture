import { createServerFn } from "@tanstack/react-start";

export interface SessionState {
  configured: boolean;
  status: string;
  rawStatus: string | null;
  connectedNumber: string | null;
  lastError: string | null;
  webhookUrl: string | null;
  webhookConfigured: boolean;
}

/** Status REAL da sessao, consultado no provedor e persistido no banco. */
export const getSession = createServerFn({ method: "GET" }).handler(async (): Promise<SessionState> => {
  const { getDb, log } = await import("./db.server");
  const { ActiveProvider: WhatsAppProvider, isAnyProviderConfigured } = await import("./active-provider.server");
  const db = getDb();
  const webhookToken = process.env["WHAPI_WEBHOOK_TOKEN"] ?? null;

  const base: SessionState = {
    configured: await isAnyProviderConfigured(),
    status: "DISCONNECTED",
    rawStatus: null,
    connectedNumber: null,
    lastError: null,
    webhookUrl: null,
    webhookConfigured: Boolean(webhookToken),
  };

  if (!base.configured) {
    base.lastError =
      "Token do provedor ausente. Crie um canal em whapi.cloud e salve o token como WHAPI_API_TOKEN.";
    return base;
  }

  try {
    const health = await WhatsAppProvider.getStatus(true);
    const { data: existing } = await db.from("whatsapp_sessions").select("id").limit(1).maybeSingle();
    const row = {
      provider: "whapi",
      channel_id: health.channelId,
      connected_number: health.connectedNumber,
      status: health.status,
      last_error: null,
      updated_at: new Date().toISOString(),
    };
    if (existing) await db.from("whatsapp_sessions").update(row).eq("id", existing.id);
    else await db.from("whatsapp_sessions").insert(row);

    return {
      ...base,
      status: health.status,
      rawStatus: health.rawStatus,
      connectedNumber: health.connectedNumber,
    };
  } catch (error: any) {
    await log("SESSION_STATUS_ERROR", "ERROR", { error: String(error?.message ?? error) });
    return { ...base, status: "ERROR", lastError: String(error?.message ?? error) };
  }
});

/** QR Code REAL do provedor. */
export const getQrCode = createServerFn({ method: "POST" }).handler(async () => {
  const { log } = await import("./db.server");
  const { ActiveProvider: WhatsAppProvider } = await import("./active-provider.server");
  try {
    const health = await WhatsAppProvider.getStatus(true);
    if (health.status === "CONNECTED") {
      return { connected: true, dataUrl: null as string | null, error: null as string | null };
    }
    const qr = await WhatsAppProvider.getQRCode();
    await log("QR_GENERATED", "OK", {});
    return { connected: false, dataUrl: qr.dataUrl, error: null as string | null };
  } catch (error: any) {
    const message = String(error?.message ?? error);
    await log("QR_ERROR", "ERROR", { error: message });
    return { connected: false, dataUrl: null as string | null, error: message };
  }
});

export const disconnectSession = createServerFn({ method: "POST" }).handler(async () => {
  const { getDb, log } = await import("./db.server");
  const { ActiveProvider: WhatsAppProvider } = await import("./active-provider.server");
  await WhatsAppProvider.disconnect();
  await getDb()
    .from("whatsapp_sessions")
    .update({ status: "DISCONNECTED", connected_number: null, updated_at: new Date().toISOString() })
    .not("id", "is", null);
  await log("SESSION_DISCONNECTED", "OK", {});
  return { ok: true };
});

/** Registra a URL real do webhook no canal do provedor. */
export const registerWebhook = createServerFn({ method: "POST" })
  .inputValidator((data: { origin: string }) => data)
  .handler(async ({ data }) => {
    const { log } = await import("./db.server");
    const { ActiveProvider: WhatsAppProvider, activeProviderName } = await import("./active-provider.server");
    const token = process.env["WHAPI_WEBHOOK_TOKEN"];
    if (!token) return { ok: false, error: "WHAPI_WEBHOOK_TOKEN nao configurado", url: null };
    const hook = (await activeProviderName()) === "evolution" ? "evolution" : "whapi";
    // Endereco fixo DESTE projeto (o antigo apontava para outro projeto e as mensagens nunca chegavam).
    // O endereco de preview com login bloqueia o provedor, por isso nao usamos data.origin.
    void data;
    const PUBLIC_ORIGIN = "https://project--77f782c8-f988-4460-926c-43834c0925c2.lovable.app";
    const url = `${PUBLIC_ORIGIN}/api/public/hooks/${hook}?token=${token}`;
    try {
      await WhatsAppProvider.setWebhook(url);
      await log("WEBHOOK_REGISTERED", "OK", { url: url.split("?")[0] });
      return { ok: true, error: null as string | null, url: url.split("?")[0]! };
    } catch (error: any) {
      const message = String(error?.message ?? error);
      await log("WEBHOOK_REGISTER_FAILED", "ERROR", { error: message });
      return { ok: false, error: message, url: null };
    }
  });

/* ------------------------------- Automacoes ------------------------------- */

export const listAutomations = createServerFn({ method: "GET" }).handler(async () => {
  const { getDb } = await import("./db.server");
  const db = getDb();
  const { data: automations } = await db
    .from("automations")
    .select("*")
    .order("created_at", { ascending: false });
  const { data: steps } = await db
    .from("automation_steps")
    .select("*")
    .order("order_index", { ascending: true });
  return {
    automations: automations ?? [],
    steps: steps ?? [],
  };
});

export const saveAutomation = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      id?: string;
      name: string;
      status: string;
      steps: { type: string; config: Record<string, unknown> }[];
    }) => data,
  )
  .handler(async ({ data }) => {
    const { getDb, log } = await import("./db.server");
    const db = getDb();
    let automationId = data.id;
    // Tempo de espera sempre em segundos inteiros (unidade única do motor).
    const steps = data.steps.map((step) =>
      step.type === "WAIT"
        ? { ...step, config: { ...step.config, seconds: Math.max(1, Math.round(Number(step.config?.["seconds"]) || 0)) } }
        : step,
    );
    if (automationId) {
      const { error: upErr } = await db
        .from("automations")
        .update({ name: data.name, status: data.status, updated_at: new Date().toISOString() })
        .eq("id", automationId);
      if (upErr) throw upErr;
      const { error: delErr } = await db.from("automation_steps").delete().eq("automation_id", automationId);
      if (delErr) throw delErr;
    } else {
      const { data: created, error } = await db
        .from("automations")
        .insert({ name: data.name, status: data.status, trigger: "LEAD_CREATED" })
        .select("id")
        .single();
      if (error) throw error;
      automationId = created.id;
    }
    if (steps.length) {
      const { error } = await db.from("automation_steps").insert(
        steps.map((step, index) => ({
          automation_id: automationId!,
          order_index: index,
          type: step.type,
          config: step.config as never,
        })),
      );
      if (error) throw error;
    }

    // Execuções já esperando: recalcula o próximo envio com o novo tempo,
    // contado a partir do momento em que a espera começou.
    let rescheduled = 0;
    const { data: waiting } = await db
      .from("automation_executions")
      .select("id, current_step")
      .eq("automation_id", automationId!)
      .eq("status", "WAITING");
    for (const ex of waiting ?? []) {
      const prev = steps[ex.current_step - 1];
      if (!prev || prev.type !== "WAIT") continue;
      const { data: lg } = await db
        .from("automation_logs")
        .select("created_at")
        .eq("execution_id", ex.id)
        .eq("event", "WAIT_SCHEDULED")
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (!lg) continue;
      const seconds = Number(prev.config["seconds"]);
      const next = new Date(new Date(lg.created_at).getTime() + seconds * 1000).toISOString();
      await db
        .from("automation_executions")
        .update({ next_run_at: next, updated_at: new Date().toISOString() })
        .eq("id", ex.id)
        .eq("status", "WAITING");
      await log("WAIT_RESCHEDULED", "OK", { seconds, nextRunAt: next }, ex.id);
      rescheduled++;
    }

    await log("AUTOMATION_SAVED", "OK", { automationId, steps: steps.length, rescheduled });
    return { id: automationId!, rescheduled };
  });

export const deleteAutomation = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const { getDb } = await import("./db.server");
    await getDb().from("automations").delete().eq("id", data.id);
    return { ok: true };
  });

/* --------------------------------- Leads --------------------------------- */

export const createLead = createServerFn({ method: "POST" })
  .inputValidator((data: { name: string; phone: string }) => data)
  .handler(async ({ data }) => {
    const { getDb, log, normalizePhone } = await import("./db.server");
    const { triggerLeadCreated, runDueExecutions } = await import("./engine.server");
    const phone = normalizePhone(data.phone);
    if (phone.length < 10) throw new Error("Telefone invalido. Use DDI+DDD+numero, ex: 5511999999999");
    const db = getDb();
    const { data: lead, error } = await db
      .from("leads")
      .insert({ name: data.name || null, phone })
      .select("id")
      .single();
    if (error) throw error;
    await log("LEAD_CREATED", "OK", { leadId: lead.id, phone });
    const triggerResult = await triggerLeadCreated(lead.id, phone);
    const processing = await runDueExecutions();
    return {
      leadId: lead.id,
      executions: triggerResult.created.length,
      automationsFound: triggerResult.found,
      executionIds: triggerResult.created,
      reason: triggerResult.reason,
      processedSteps: processing.processed,
    };
  });

/* ------------------------------- Execucoes -------------------------------- */

export const listExecutions = createServerFn({ method: "GET" }).handler(async () => {
  const { getDb } = await import("./db.server");
  const db = getDb();
  const { data: executions } = await db
    .from("automation_executions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(100);
  const { data: logs } = await db
    .from("automation_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(200);
  const { data: automations } = await db.from("automations").select("id, name");
  return { executions: executions ?? [], logs: logs ?? [], automations: automations ?? [] };
});

export const tickNow = createServerFn({ method: "POST" }).handler(async () => {
  const { runDueExecutions } = await import("./engine.server");
  return runDueExecutions();
});

/* ------------------------------ TESTE-GAVIOES ----------------------------- */

/** Envio manual REAL (mesma funcao usada pelo motor de automacao). */
export const testWhatsAppSend = createServerFn({ method: "POST" })
  .inputValidator((data: { phone: string; message?: string }) => data)
  .handler(async ({ data }) => {
    const { normalizePhone } = await import("./db.server");
    const { sendMessageIdempotent } = await import("./engine.server");

    const phone = normalizePhone(data.phone);
    const content = (data.message ?? "").trim() || "🦅 TESTE DE ENVIO — Gaviões Bom Clima";
    if (phone.length < 12) {
      return {
        ok: false,
        phone,
        providerMessageId: null as string | null,
        error: `Numero invalido apos normalizacao: "${phone}". Use DDI+DDD+numero (ex.: 5511999999999).`,
      };
    }

    try {
      const sent = await sendMessageIdempotent({
        phone,
        content,
        idempotencyKey: `manual:${Date.now()}:${phone}`,
      });
      return {
        ok: true,
        phone,
        providerMessageId: sent.providerMessageId ?? null,
        error: null as string | null,
      };
    } catch (error: any) {
      return {
        ok: false,
        phone,
        providerMessageId: null as string | null,
        error: String(error?.message ?? error),
      };
    }
  });

const TEST_MESSAGES = [
  "🦅 TESTE 1 — Conexão do WhatsApp realizada com sucesso.",
  "💬 TESTE 2 — O sistema conseguiu enviar uma mensagem.",
  "📲 TESTE 3 — O envio automático está funcionando.",
  "🤖 TESTE 4 — O módulo de automação está funcionando.",
  "✅ TESTE 5 — Gaviões Bom Clima: teste concluído.",
];

export const runGavioesTest = createServerFn({ method: "POST" })
  .inputValidator((data: { phone: string }) => data)
  .handler(async ({ data }) => {
    const { normalizePhone, log } = await import("./db.server");
    const { sendMessageIdempotent } = await import("./engine.server");
    const { ActiveProvider: WhatsAppProvider } = await import("./active-provider.server");

    const phone = normalizePhone(data.phone);
    if (phone.length < 10) throw new Error("Telefone invalido. Use DDI+DDD+numero.");

    const health = await WhatsAppProvider.getStatus(false);
    if (health.status !== "CONNECTED") {
      return {
        ok: false,
        error: `WhatsApp nao esta conectado (status real: ${health.rawStatus || health.status}).`,
        results: [] as { label: string; ok: boolean; providerMessageId?: string; error?: string }[],
      };
    }

    const batch = Date.now();
    const results: { label: string; ok: boolean; providerMessageId?: string; error?: string }[] = [];
    for (let i = 0; i < TEST_MESSAGES.length; i += 1) {
      try {
        const sent = await sendMessageIdempotent({
          phone,
          content: TEST_MESSAGES[i]!,
          idempotencyKey: `teste-gavioes:${batch}:${i}`,
        });
        results.push({
          label: `TESTE ${i + 1}`,
          ok: true,
          providerMessageId: sent.providerMessageId ?? "",
        });
      } catch (error: any) {
        results.push({ label: `TESTE ${i + 1}`, ok: false, error: String(error?.message ?? error) });
      }
      if (i < TEST_MESSAGES.length - 1) await new Promise((resolve) => setTimeout(resolve, 2000));
    }
    await log("TESTE_GAVIOES", results.every((r) => r.ok) ? "OK" : "ERROR", { phone, results });
    return { ok: results.every((r) => r.ok), error: null as string | null, results };
  });

/* --------------------------- Horario de envio ----------------------------- */

export const getSendWindow = createServerFn({ method: "GET" }).handler(async () => {
  const { getDb } = await import("./db.server");
  const { data } = await getDb().from("send_window").select("*").eq("id", true).maybeSingle();
  return data;
});

export const saveSendWindow = createServerFn({ method: "POST" })
  .inputValidator((data: { start_hour: number; end_hour: number; days: number[] }) => data)
  .handler(async ({ data }) => {
    const { getDb } = await import("./db.server");
    await getDb()
      .from("send_window")
      .update({ ...data, updated_at: new Date().toISOString() })
      .eq("id", true);
    return { ok: true };
  });
