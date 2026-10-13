import { createServerFn } from "@tanstack/react-start";

const ACTIVE = ["PENDING", "RUNNING", "WAITING", "PAUSED", "FAILED", "CONVERSING"];

/** Fila baseada exclusivamente nas execucoes reais do banco. */
export const listLeadsQueue = createServerFn({ method: "GET" }).handler(async () => {
  const { getDb } = await import("./db.server");
  const db = getDb();
  const { data: executions } = await db
    .from("automation_executions")
    .select("*")
    .in("status", ACTIVE)
    .order("next_run_at", { ascending: true })
    .limit(200);
  const execs = executions ?? [];
  const ids = execs.map((e) => e.id);
  const leadIds = execs.map((e) => e.lead_id).filter(Boolean) as string[];
  const autoIds = [...new Set(execs.map((e) => e.automation_id))];

  const [leads, automations, steps, messages] = await Promise.all([
    leadIds.length ? db.from("leads").select("id, name, phone").in("id", leadIds) : { data: [] },
    autoIds.length ? db.from("automations").select("id, name").in("id", autoIds) : { data: [] },
    autoIds.length
      ? db.from("automation_steps").select("*").in("automation_id", autoIds).order("order_index")
      : { data: [] },
    ids.length
      ? db
          .from("messages")
          .select("execution_id, content, created_at, status")
          .in("execution_id", ids)
          .eq("direction", "OUT")
          .eq("status", "SENT")
          .order("created_at", { ascending: false })
      : { data: [] },
  ]);

  return execs.map((e) => {
    const autoSteps = ((steps.data ?? []) as any[]).filter((s) => s.automation_id === e.automation_id);
    const sendSteps = autoSteps.filter((s) => s.type === "SEND_MESSAGE");
    const next = autoSteps.slice(e.current_step).find((s) => s.type === "SEND_MESSAGE");
    const sent = ((messages.data ?? []) as any[]).filter((m) => m.execution_id === e.id);
    const lead = ((leads.data ?? []) as any[]).find((l) => l.id === e.lead_id);
    return {
      id: e.id,
      status: e.status,
      replied: e.replied,
      replyPending: Boolean((e as any).pending_reply_at),
      currentStep: e.current_step,
      totalSteps: autoSteps.length,
      nextRunAt: e.next_run_at,
      lastError: e.last_error,
      leadName: lead?.name ?? null,
      phone: e.phone,
      automationName: ((automations.data ?? []) as any[]).find((a) => a.id === e.automation_id)?.name ?? "—",
      sentCount: sent.length,
      lastMessage: sent[0]?.content ?? null,
      lastSentAt: sent[0]?.created_at ?? null,
      nextMessage: next ? String(next.config?.message ?? "") : null,
      nextMessageIndex: next ? sendSteps.indexOf(next) + 1 : null,
    };
  });
});

export const getExecutionHistory = createServerFn({ method: "GET" })
  .inputValidator((data: { id: string }) => data)
  .handler(async ({ data }) => {
    const { getDb } = await import("./db.server");
    const { data: logs } = await getDb()
      .from("automation_logs")
      .select("id, event, status, data, created_at")
      .eq("execution_id", data.id)
      .order("created_at", { ascending: true })
      .limit(200);
    return logs ?? [];
  });

export const setExecutionStatus = createServerFn({ method: "POST" })
  .inputValidator((data: { id: string; action: "PAUSE" | "RESUME" | "CANCEL" | "TAKEOVER" }) => data)
  .handler(async ({ data }) => {
    const { getDb, log } = await import("./db.server");
    const db = getDb();
    const now = new Date().toISOString();
    const patch: Record<string, unknown> =
      data.action === "TAKEOVER"
        ? { status: "TAKEN_OVER", pending_reply_at: null, completed_at: now, updated_at: now }
        : data.action === "PAUSE"
        ? { status: "PAUSED", updated_at: now }
        : data.action === "RESUME"
          ? { status: "WAITING", next_run_at: now, updated_at: now }
          : { status: "CANCELLED", completed_at: now, updated_at: now };
    const from =
      data.action === "RESUME"
        ? ["PAUSED"]
        : data.action === "TAKEOVER"
          ? ["PENDING", "WAITING", "RUNNING", "PAUSED", "FAILED", "CONVERSING"]
          : ["PENDING", "WAITING", "PAUSED", "FAILED", "CONVERSING"];
    const { data: rows, error } = await db
      .from("automation_executions")
      .update(patch as never)
      .eq("id", data.id)
      .in("status", from)
      .select("id");
    if (error) throw error;
    if (!rows?.length) return { ok: false, error: "Estado atual não permite esta ação (pode estar processando)." };
    await log({ PAUSE: "EXECUTION_PAUSED_BY_USER", RESUME: "EXECUTION_RESUMED_BY_USER", CANCEL: "EXECUTION_CANCELLED_BY_USER", TAKEOVER: "ATTENDANCE_TAKEN_OVER" }[data.action], "OK", {}, data.id);
    return { ok: true, error: null as string | null };
  });
