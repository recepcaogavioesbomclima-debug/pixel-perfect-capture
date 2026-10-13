import { getDb, log, normalizePhone } from "./db.server";
import { ProviderNotConfiguredError } from "./whatsapp-provider.server";
import { ActiveProvider as WhatsAppProvider } from "./active-provider.server";

const MAX_ATTEMPTS = 3;
const RETRY_BACKOFF_SECONDS = [60, 300, 900];

export type StepType =
  | "SEND_MESSAGE"
  | "WAIT"
  | "CHECK_CONDITION"
  | "END_AUTOMATION"
  | "PAUSE_AUTOMATION"
  | "RESUME_AUTOMATION";

interface StepRow {
  id: string;
  order_index: number;
  type: StepType;
  config: Record<string, any>;
}

interface ExecutionRow {
  id: string;
  automation_id: string;
  phone: string;
  status: string;
  current_step: number;
  attempts: number;
  replied: boolean;
}


/** Atendente humano assumiu a conversa: automacao nao envia nada. */
async function isHumanHandling(phone: string): Promise<boolean> {
  const { data } = await (getDb() as any).from("contact_ai").select("assigned_to").eq("phone", normalizePhone(phone)).maybeSingle();
  return Boolean(data?.assigned_to);
}

/** Janela de horario permitido. Retorna null se pode enviar agora. */
async function nextAllowedTime(now = new Date()): Promise<Date | null> {
  const db = getDb();
  const { data } = await db.from("send_window").select("*").eq("id", true).maybeSingle();
  if (!data) return null;
  const offset = data.tz_offset_minutes as number;
  const days = data.days as number[];
  const startHour = data.start_hour as number;
  const endHour = data.end_hour as number;

  for (let i = 0; i < 8 * 24; i += 1) {
    const candidate = new Date(now.getTime() + i * 60 * 60 * 1000);
    const local = new Date(candidate.getTime() + offset * 60 * 1000);
    const day = local.getUTCDay();
    const hour = local.getUTCHours();
    if (!days.includes(day)) continue;
    if (i === 0 && hour >= startHour && hour < endHour) return null;
    if (hour >= startHour && hour < endHour) {
      // inicio da proxima hora permitida
      const aligned = new Date(candidate.getTime());
      aligned.setUTCMinutes(0, 0, 0);
      return aligned;
    }
  }
  return new Date(now.getTime() + 60 * 60 * 1000);
}

/** Inicia a automacao ativa para o gatilho LEAD_CREATED. */
export async function triggerLeadCreated(leadId: string, phone: string) {
  const db = getDb();
  const normalizedPhone = normalizePhone(phone);
  console.log(`[LEAD_CREATED] Lead ID: ${leadId} Phone: ${normalizedPhone}`);
  const { data: automations, error: searchError } = await db
    .from("automations")
    .select("id, name, status, trigger")
    .eq("status", "ACTIVE")
    .eq("trigger", "LEAD_CREATED");
  if (searchError) throw searchError;

  const found = automations?.length ?? 0;
  console.log(`[SEARCH AUTOMATIONS] Trigger: LEAD_CREATED Active automations found: ${found}`);
  await log("SEARCH_AUTOMATIONS", found ? "OK" : "WARN", {
    leadId,
    phone: normalizedPhone,
    trigger: "LEAD_CREATED",
    activeAutomationsFound: found,
    automations: (automations ?? []).map((automation) => ({
      id: automation.id,
      name: automation.name,
      status: automation.status,
    })),
    reason: found ? null : "NO ACTIVE AUTOMATION FOUND",
  });

  const created: string[] = [];
  for (const automation of automations ?? []) {
    // idempotencia: uma execucao ativa por automacao + lead
    const { data: existing } = await db
      .from("automation_executions")
      .select("id")
      .eq("automation_id", automation.id)
      .eq("lead_id", leadId)
      .maybeSingle();
    if (existing) continue;

    const { data: execution, error } = await db
      .from("automation_executions")
      .insert({
        automation_id: automation.id,
        lead_id: leadId,
        phone: normalizedPhone,
        status: "PENDING",
        current_step: 0,
        next_run_at: new Date().toISOString(),
      })
      .select("id")
      .single();
    if (error?.code === "23505") continue;
    if (error) throw error;
    created.push(execution.id);
    console.log(
      `[START EXECUTION] Automation: ${automation.name} Execution ID: ${execution.id} Status: PENDING`,
    );
    await log(
      "AUTOMATION_STARTED",
      "OK",
      {
        leadId,
        phone: normalizedPhone,
        trigger: "LEAD_CREATED",
        automationId: automation.id,
        automationName: automation.name,
        automationStatus: automation.status,
        executionId: execution.id,
        executionStatus: "PENDING",
        currentStep: 0,
      },
      execution.id,
    );
  }
  return { found, created, reason: found ? null : "NO ACTIVE AUTOMATION FOUND" };
}

const REPLY_DEBOUNCE_MS = 5000;

/**
 * Mensagem INBOUND do cliente: marca resposta, interrompe os follow-ups e
 * agenda (com agrupamento de 5s) uma resposta automatica. A execucao fica
 * em CONVERSING ate o consultor assumir, o cliente sair ou ser cancelada.
 */
export async function handleInboundReply(phone: string, content: string) {
  const db = getDb();
  const normalized = normalizePhone(phone);
  // Score de interesse: agenda analise independente (nao afeta a resposta)
  const { scheduleInterest } = await import("./interest.server");
  await scheduleInterest(normalized);
  const { data: executions } = await db
    .from("automation_executions")
    .select("id, status")
    .eq("phone", normalized)
    .in("status", ["PENDING", "WAITING", "RUNNING", "PAUSED", "CONVERSING"]);

  for (const execution of executions ?? []) {
    const patch: Record<string, unknown> = {
      replied: true,
      pending_reply_at: new Date(Date.now() + REPLY_DEBOUNCE_MS).toISOString(),
      updated_at: new Date().toISOString(),
    };
    // PAUSED = pausado pelo usuario: registra, mas nao responde
    if (execution.status === "PAUSED") delete patch["pending_reply_at"];
    else patch["status"] = "CONVERSING";
    await db.from("automation_executions").update(patch as never).eq("id", execution.id);
    await log("REPLY_DETECTED", "OK", { phone: normalized, content }, execution.id);
  }
  if ((executions ?? []).length) return executions!.length;
  return scheduleGlobalReply(normalized, content);
}

/** Resposta Inteligente Global: contato fora de automacao. Mesma base de conhecimento. */
async function scheduleGlobalReply(phone: string, content: string) {
  const db = getDb() as any;
  const { data: cfg } = await db.from("global_reply_settings").select("*").eq("id", true).maybeSingle();
  if (!cfg?.enabled) {
    await log("GLOBAL_REPLY_SKIPPED", "OK", { phone, reason: "desativada" });
    return 0;
  }
  const { data: contact } = await db.from("contact_ai").select("*").eq("phone", phone).maybeSingle();
  if (contact?.paused) {
    await log("GLOBAL_REPLY_SKIPPED", "OK", { phone, reason: "IA pausada para o contato" });
    return 0;
  }
  const { count } = await db.from("messages").select("id", { count: "exact", head: true }).eq("phone", phone);
  const isNew = (count ?? 0) <= 1 && !contact;
  if (isNew ? !cfg.reply_new_leads : !cfg.reply_existing) {
    await log("GLOBAL_REPLY_SKIPPED", "OK", { phone, reason: isNew ? "novos contatos desativado" : "contatos existentes desativado" });
    return 0;
  }
  const delay = Math.max(5, Number(cfg.min_interval_seconds) || 5) * 1000;
  await db.from("contact_ai").upsert({
    phone,
    paused: false,
    pending_reply_at: new Date(Date.now() + delay).toISOString(),
    updated_at: new Date().toISOString(),
  });
  await log("GLOBAL_REPLY_SCHEDULED", "OK", { phone, content, isNew });
  return 1;
}

async function runGlobalReplies(limit = 10) {
  const db = getDb() as any;
  const { decideReply } = await import("./ai-reply.server");
  const { data: cfg } = await db.from("global_reply_settings").select("*").eq("id", true).maybeSingle();
  if (!cfg?.enabled) return 0;
  const { data: due } = await db
    .from("contact_ai")
    .select("phone, pending_reply_at")
    .eq("paused", false)
    .not("pending_reply_at", "is", null)
    .lte("pending_reply_at", new Date().toISOString())
    .limit(limit);
  let replied = 0;
  for (const row of due ?? []) {
    const { data: locked } = await db
      .from("contact_ai")
      .update({ pending_reply_at: null })
      .eq("phone", row.phone)
      .eq("pending_reply_at", row.pending_reply_at)
      .select("phone")
      .maybeSingle();
    if (!locked) continue;
    const { data: lastIn } = await db
      .from("messages").select("id").eq("phone", row.phone).eq("direction", "IN")
      .order("created_at", { ascending: false }).limit(1).maybeSingle();
    if (!lastIn) continue;
    try {
      let decision;
      try {
        decision = await decideReply(row.phone, Number(cfg.context_messages) || 20);
      } catch (aiError: any) {
        const { data: info } = await db.from("business_info").select("fallback_reply").eq("id", true).maybeSingle();
        await log("AI_FAILED_USING_FALLBACK", "WARN", { phone: row.phone, error: String(aiError?.message ?? aiError) });
        decision = { intent: "Sem contexto", reply: info?.fallback_reply || "Claro! 😊 Me conta o que você gostaria de saber.", optOut: false, needsHuman: false };
      }
      const { data: still } = await db.from("contact_ai").select("paused").eq("phone", row.phone).maybeSingle();
      if (still?.paused) continue;
      const sent = await sendMessageIdempotent({
        phone: row.phone,
        content: decision.reply,
        idempotencyKey: `inbound-reply:${lastIn.id}`,
      });
      await db.from("contact_ai").update({ last_reply_at: new Date().toISOString(), paused: Boolean(decision.optOut) }).eq("phone", row.phone);
      await log("GLOBAL_REPLY_SENT", "OK", { phone: row.phone, intent: decision.intent, reply: decision.reply, providerMessageId: sent.providerMessageId, needsHuman: decision.needsHuman });
      replied += 1;
    } catch (error: any) {
      await log("GLOBAL_REPLY_FAILED", "ERROR", { phone: row.phone, error: String(error?.message ?? error) });
    }
  }
  return replied;
}

/** Responde automaticamente as conversas cujo agrupamento ja venceu. */
export async function runPendingReplies(limit = 10) {
  const db = getDb();
  const { decideReply } = await import("./ai-reply.server");
  let replied = 0;
  const { data: due } = await (db as any)
    .from("automation_executions")
    .select("id, phone, pending_reply_at")
    .eq("status", "CONVERSING")
    .not("pending_reply_at", "is", null)
    .lte("pending_reply_at", new Date().toISOString())
    .limit(limit);

  for (const row of due ?? []) {
    // lock: so quem limpar o pending_reply_at processa (evita respostas duplicadas)
    const { data: locked } = await (db as any)
      .from("automation_executions")
      .update({ pending_reply_at: null })
      .eq("id", row.id)
      .eq("pending_reply_at", row.pending_reply_at)
      .select("id")
      .maybeSingle();
    if (!locked) continue;
    if (await isHumanHandling(row.phone)) {
      await log("AUTO_REPLY_SKIPPED", "OK", { phone: row.phone, reason: "atendimento humano" }, row.id);
      continue;
    }

    const { data: lastIn } = await db
      .from("messages")
      .select("id")
      .eq("phone", row.phone)
      .eq("direction", "IN")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (!lastIn) continue;

    try {
      await log("AUTO_REPLY_ANALYSING", "RUNNING", { phone: row.phone }, row.id);
      let decision;
      try {
        decision = await decideReply(row.phone);
      } catch (aiError: any) {
        // IA indisponivel: envia a resposta generica em vez de ficar calado
        const { data: info } = await (db as any).from("business_info").select("fallback_reply").eq("id", true).maybeSingle();
        await log("AI_FAILED_USING_FALLBACK", "WARN", { error: String(aiError?.message ?? aiError) }, row.id);
        decision = { intent: "Sem contexto", reply: info?.fallback_reply || "Claro! 😊 Me conta o que você gostaria de saber.", optOut: false, needsHuman: false };
      }
      // consultor pode ter assumido durante a analise
      const { data: still } = await db.from("automation_executions").select("status").eq("id", row.id).maybeSingle();
      if (still?.status !== "CONVERSING") continue;
      const sent = await sendMessageIdempotent({
        phone: row.phone,
        content: decision.reply,
        // 1 resposta por mensagem recebida, mesmo com varias execucoes do mesmo numero
        idempotencyKey: `inbound-reply:${lastIn.id}`,
        executionId: row.id,
      });
      await log("AUTO_REPLY_SENT", "OK", { intent: decision.intent, reply: decision.reply, providerMessageId: sent.providerMessageId, needsHuman: decision.needsHuman }, row.id);
      replied += 1;
      if (decision.optOut) {
        await db
          .from("automation_executions")
          .update({ status: "CANCELLED", completed_at: new Date().toISOString(), updated_at: new Date().toISOString() })
          .eq("id", row.id);
        await log("AUTOMATION_CANCELLED", "OK", { reason: "cliente pediu para nao receber mensagens" }, row.id);
      }
    } catch (error: any) {
      await db.from("automation_executions").update({ last_error: String(error?.message ?? error) }).eq("id", row.id);
      await log("AUTO_REPLY_FAILED", "ERROR", { error: String(error?.message ?? error) }, row.id);
    }
  }
  replied += await runGlobalReplies(limit).catch(() => 0);
  return replied;
}

async function loadSteps(automationId: string): Promise<StepRow[]> {
  const db = getDb();
  const { data } = await db
    .from("automation_steps")
    .select("id, order_index, type, config")
    .eq("automation_id", automationId)
    .order("order_index", { ascending: true });
  return (data ?? []) as StepRow[];
}

async function completeExecution(executionId: string, reason: string) {
  const db = getDb();
  await db
    .from("automation_executions")
    .update({
      status: "COMPLETED",
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", executionId);
  await log("AUTOMATION_COMPLETED", "OK", { reason }, executionId);
}

/** Envio real e idempotente. A chave garante 1 envio por (execucao, etapa). */
export async function sendMessageIdempotent(params: {
  phone: string;
  content: string;
  idempotencyKey: string;
  executionId?: string | null;
}): Promise<{ skipped: boolean; providerMessageId?: string; providerResponse?: unknown }> {
  const db = getDb();
  const phone = normalizePhone(params.phone);

  const { data: existing } = await db
    .from("messages")
    .select("id, status, provider_message_id")
    .eq("idempotency_key", params.idempotencyKey)
    .maybeSingle();

  if (existing && existing.status === "SENT") {
    await log("SEND_SKIPPED_DUPLICATE", "OK", { key: params.idempotencyKey }, params.executionId);
    return { skipped: true, providerMessageId: existing.provider_message_id ?? undefined };
  }

  if (!existing) {
    const { error } = await db.from("messages").insert({
      phone,
      direction: "OUT",
      content: params.content,
      type: "text",
      status: "PENDING",
      idempotency_key: params.idempotencyKey,
      execution_id: params.executionId ?? null,
    });
    // corrida: outro worker ja inseriu a mesma chave
    if (error && !`${error.message}`.includes("duplicate")) throw error;
    if (error) return { skipped: true };
  }

  try {
    const result = await WhatsAppProvider.sendMessage(phone, params.content);
    await db
      .from("messages")
      .update({
        status: "SENT",
        provider_message_id: result.providerMessageId,
        chat_id: result.chatId,
      })
      .eq("idempotency_key", params.idempotencyKey);
    await log(
      "MESSAGE_SENT",
      "OK",
      { phone, providerMessageId: result.providerMessageId },
      params.executionId,
    );
    return {
      skipped: false,
      providerMessageId: result.providerMessageId,
      providerResponse: result.raw,
    };
  } catch (error: any) {
    await db
      .from("messages")
      .update({ status: "FAILED", error: String(error?.message ?? error) })
      .eq("idempotency_key", params.idempotencyKey);
    await log("MESSAGE_SEND_FAILED", "ERROR", { phone, error: String(error?.message ?? error) }, params.executionId);
    throw error;
  }
}

/** Processa UMA etapa da execucao. */
async function processExecution(execution: ExecutionRow) {
  const db = getDb();
  const steps = await loadSteps(execution.automation_id);
  const step = steps[execution.current_step];

  if (!step) {
    await completeExecution(execution.id, "fim do fluxo");
    return;
  }

  const advance = async (nextRunAt: Date, status: string) => {
    await db
      .from("automation_executions")
      .update({
        current_step: execution.current_step + 1,
        next_run_at: nextRunAt.toISOString(),
        status,
        attempts: 0,
        last_error: null,
        updated_at: new Date().toISOString(),
      })
      .eq("id", execution.id);
  };

  switch (step.type) {
    case "SEND_MESSAGE": {
      if (await isHumanHandling(execution.phone)) {
        await db
          .from("automation_executions")
          .update({
            status: "WAITING",
            next_run_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", execution.id);
        await log("SKIPPED_HUMAN_HANDLING", "OK", { phone: execution.phone }, execution.id, step.id);
        return;
      }
      const allowedAt = await nextAllowedTime();
      if (allowedAt) {
        await db
          .from("automation_executions")
          .update({
            status: "WAITING",
            next_run_at: allowedAt.toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", execution.id);
        await log("RESCHEDULED_OUT_OF_WINDOW", "OK", { nextRunAt: allowedAt }, execution.id, step.id);
        return;
      }
      const content = String(step.config?.["message"] ?? "");
      if (!content.trim()) throw new Error("Etapa SEND_MESSAGE sem mensagem configurada");
      const normalizedRecipient = normalizePhone(execution.phone);
      const debug = {
        automationId: execution.automation_id,
        executionId: execution.id,
        executionStatus: "RUNNING",
        currentStep: execution.current_step,
        stepId: step.id,
        stepType: step.type,
        recipientBeforeNormalization: execution.phone,
        recipientAfterNormalization: normalizedRecipient,
        messageContent: content,
        calling: "sendMessageIdempotent (mesma função do envio manual)",
      };
      console.log(`[AUTOMATION DEBUG] ${JSON.stringify(debug)}`);
      await log("AUTOMATION_DEBUG", "STARTED", debug, execution.id, step.id);
      const sent = await sendMessageIdempotent({
        phone: execution.phone,
        content,
        idempotencyKey: `exec:${execution.id}:step:${step.id}`,
        executionId: execution.id,
      });
      if (!sent.providerMessageId) {
        throw new Error("Envio sem confirmação: o provedor não retornou o ID da mensagem");
      }
      await log(
        "AUTOMATION_DEBUG",
        "CONFIRMED",
        {
          ...debug,
          sendResult: sent.skipped ? "ALREADY_SENT" : "SENT",
          providerMessageId: sent.providerMessageId,
          providerResponse: sent.providerResponse ?? "confirmação já persistida",
        },
        execution.id,
        step.id,
      );
      await log(
        "STEP_EXECUTED",
        "OK",
        { type: step.type, providerMessageId: sent.providerMessageId },
        execution.id,
        step.id,
      );
      await advance(new Date(), "PENDING");
      return;
    }
    case "WAIT": {
      const seconds = Number(step.config?.["seconds"] ?? 0);
      const nextRunAt = new Date(Date.now() + seconds * 1000);
      await advance(nextRunAt, "WAITING");
      await log("WAIT_SCHEDULED", "OK", { seconds, nextRunAt }, execution.id, step.id);
      return;
    }
    case "CHECK_CONDITION": {
      const { data: fresh } = await db
        .from("automation_executions")
        .select("replied")
        .eq("id", execution.id)
        .single();
      const replied = Boolean(fresh?.replied);
      const expected = step.config?.["replied"] !== false;
      const matched = replied === expected;
      const action = matched
        ? String(step.config?.["ifTrue"] ?? "END")
        : String(step.config?.["ifFalse"] ?? "CONTINUE");
      await log("CONDITION_CHECKED", "OK", { replied, matched, action }, execution.id, step.id);
      if (action === "END") {
        await completeExecution(execution.id, "condicao atendida");
        return;
      }
      await advance(new Date(), "PENDING");
      return;
    }
    case "END_AUTOMATION": {
      await completeExecution(execution.id, "etapa END_AUTOMATION");
      return;
    }
    case "PAUSE_AUTOMATION": {
      await db
        .from("automation_executions")
        .update({
          status: "PAUSED",
          current_step: execution.current_step + 1,
          updated_at: new Date().toISOString(),
        })
        .eq("id", execution.id);
      await log("AUTOMATION_PAUSED", "OK", {}, execution.id, step.id);
      return;
    }
    case "RESUME_AUTOMATION": {
      await advance(new Date(), "PENDING");
      return;
    }
    default:
      throw new Error(`Tipo de etapa desconhecido: ${step.type}`);
  }
}

/** Worker: processa todas as execucoes vencidas. Chamado pelo agendador. */
export async function runDueExecutions(limit = 20) {
  const db = getDb();
  let processed = 0;
  let dueFound = 0;
  while (processed < limit) {
    const { data: rowData, error: dueError } = await db
      .from("automation_executions")
      .select("id, automation_id, phone, status, current_step, attempts, replied")
      .in("status", ["PENDING", "WAITING"])
      .lte("next_run_at", new Date().toISOString())
      .order("next_run_at", { ascending: true })
      .limit(1)
      .maybeSingle();
    if (dueError) throw dueError;
    if (!rowData) break;
    dueFound += 1;
    const row = rowData as ExecutionRow;
    // lock otimista: so processa quem conseguir mudar o status
    const { data: locked } = await db
      .from("automation_executions")
      .update({ status: "RUNNING", updated_at: new Date().toISOString() })
      .eq("id", row.id)
      .in("status", ["PENDING", "WAITING"])
      .select("id")
      .maybeSingle();
    if (!locked) continue;

    console.log(
      `[AUTOMATION DEBUG] Execution ID: ${row.id} Status: RUNNING Current step: ${row.current_step}`,
    );
    await log(
      "EXECUTION_STEP_STARTED",
      "RUNNING",
      { executionId: row.id, currentStep: row.current_step },
      row.id,
    );

    try {
      await processExecution(row);
      processed += 1;
    } catch (error: any) {
      const attempts = row.attempts + 1;
      const message = String(error?.message ?? error);
      if (error instanceof ProviderNotConfiguredError || attempts >= MAX_ATTEMPTS) {
        await db
          .from("automation_executions")
          .update({
            status: "FAILED",
            attempts,
            last_error: message,
            updated_at: new Date().toISOString(),
          })
          .eq("id", row.id);
        await log("EXECUTION_FAILED", "ERROR", { attempts, error: message }, row.id);
      } else {
        const delay = RETRY_BACKOFF_SECONDS[attempts - 1] ?? 900;
        await db
          .from("automation_executions")
          .update({
            status: "WAITING",
            attempts,
            last_error: message,
            next_run_at: new Date(Date.now() + delay * 1000).toISOString(),
            updated_at: new Date().toISOString(),
          })
          .eq("id", row.id);
        await log("RETRY_SCHEDULED", "WARN", { attempts, delay, error: message }, row.id);
      }
    }
  }
  const replies = await runPendingReplies().catch(() => 0);
  const { runPendingInterest } = await import("./interest.server");
  const interest = await runPendingInterest().catch(() => 0);
  return { due: dueFound, processed, replies, interest };
}
