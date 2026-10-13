/**
 * Score Inteligente de Interesse do Lead. Independente das respostas do WhatsApp:
 * apenas le mensagens e grava lead_interest / lead_interest_history.
 */
import { getDb, log, normalizePhone } from "./db.server";
import {
  INTENTS,
  LOGIC_VERSION,
  OBJECTIONS,
  computeTrend,
  isHot,
  levelFor,
  smoothScore,
  validateAnalysis,
  type Analysis,
} from "./interest";

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["score", "intent", "objection", "reasons"],
  properties: {
    score: { type: "integer" },
    intent: { type: "string", enum: [...INTENTS] },
    objection: { type: "string", enum: [...OBJECTIONS] },
    reasons: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["text", "evidence"],
        properties: { text: { type: "string" }, evidence: { type: ["string", "null"] } },
      },
    },
  },
};

/** Marca o lead para analise (debounce curto agrupa mensagens seguidas). Nunca lanca erro. */
export async function scheduleInterest(phone: string, delayMs = 3000) {
  try {
    const db = getDb() as any;
    await db.from("lead_interest").upsert(
      { phone: normalizePhone(phone), pending_at: new Date(Date.now() + delayMs).toISOString() },
      { onConflict: "phone", ignoreDuplicates: false },
    );
  } catch (e: any) {
    console.error("[INTEREST_SCHEDULE_FAILED]", e?.message ?? e);
  }
}

export type AnalyzeFn = (system: string, transcript: string) => Promise<unknown>;

const defaultAnalyze: AnalyzeFn = async (system, transcript) => {
  const { streamResponses } = await import("./ai-reply.server");
  const raw = await streamResponses(
    [
      { role: "system", content: system },
      { role: "user", content: transcript },
    ],
    "lead_interest",
    SCHEMA,
  );
  return JSON.parse(raw.match(/\{[\s\S]*\}/)?.[0] ?? raw);
};

function buildSystem(previous: { score: number; intent: string } | null) {
  return `Voce analisa o INTERESSE COMERCIAL de um lead da Academia Gavioes 24h - Bom Clima numa conversa de WhatsApp.
Considere a conversa inteira; mensagens da ACADEMIA sao apenas contexto e NUNCA contam como interesse do lead.
Escala (inteiro 0-100): 0-20 MUITO BAIXO, 21-40 BAIXO, 41-60 MEDIO, 61-80 ALTO, 81-100 MUITO ALTO.
Referencias: "Voces tem academia?"/"Tem estacionamento?" ~ BAIXO; "Quanto custa o plano mensal?" ~ MEDIO (~50);
"Gostei do plano, como faco a matricula?" ~ ALTO/MUITO ALTO; "Me manda o link para pagar" ~ MUITO ALTO (90+);
"Gostei, mas achei caro" ~ 70 com objecao PRECO; "Quero fechar, mas preciso falar com minha esposa" ~ 72 com PRECISA CONSULTAR OUTRA PESSOA;
"Nao quero, obrigado" ~ reduzir bastante, intencao SEM INTERESSE.
Regras: nao pontue alto so por palavras-chave; mais mensagens nao significa mais interesse; saudacoes e agradecimentos nao mudam muito o score;
objecao nao e desinteresse; "quero conhecer" e QUER VISITAR, nao PRONTO PARA COMPRAR; nao invente objecoes (use NENHUMA).
Motivos: 1-4 frases objetivas, cada uma com a mensagem do CLIENTE que a comprova em "evidence" (copiada literalmente). Se houver pouca informacao, diga "Evidências insuficientes".
Nao infira atributos pessoais.
${previous ? `Score anterior: ${previous.score} (intencao ${previous.intent}). O score pode subir, descer ou ficar estavel conforme as evidencias atuais.` : "Primeira analise deste lead."}`;
}

/** Analisa um lead; retorna o resultado salvo ou null (falha preserva o ultimo score). */
export async function analyzeLead(phone: string, analyze: AnalyzeFn = defaultAnalyze) {
  const db = getDb() as any;
  const [{ data: settings }, { data: current }] = await Promise.all([
    db.from("interest_settings").select("*").eq("id", true).maybeSingle(),
    db.from("lead_interest").select("*").eq("phone", phone).maybeSingle(),
  ]);
  const ctx = Math.min(Math.max(Number(settings?.context_messages) || 20, 4), 50);
  const { data: msgs } = await db
    .from("messages")
    .select("id, direction, content, chat_id, created_at")
    .eq("phone", phone)
    .order("created_at", { ascending: false })
    .limit(ctx);
  const history = ((msgs ?? []) as any[]).reverse();
  const lastIn = [...history].reverse().find((m) => m.direction === "IN");
  if (!lastIn) return null;
  // ja analisada (webhook duplicado / retry): nada a fazer
  if (current?.last_message_id === lastIn.id) return null;

  const transcript = history
    .map((m) => `${m.direction === "IN" ? "CLIENTE" : "ACADEMIA"}: ${m.content ?? ""}`)
    .join("\n");
  const prevScore: number | null = current?.analyzed_at ? current.score : null;

  let analysis: Analysis | null = null;
  try {
    analysis = validateAnalysis(
      await analyze(buildSystem(prevScore == null ? null : { score: prevScore, intent: current.intent }), `CONVERSA:\n${transcript}`),
    );
    if (!analysis) throw new Error("Saida da IA invalida");
  } catch (e: any) {
    const msg = String(e?.message ?? e).slice(0, 300);
    await db.from("lead_interest").update({ last_error: msg, updated_at: new Date().toISOString() }).eq("phone", phone);
    await log("INTEREST_ANALYSIS_FAILED", "ERROR", { phone, error: msg });
    return null;
  }

  const score = smoothScore(prevScore, analysis.score, analysis.intent);
  const { data: past } = await db
    .from("lead_interest_history")
    .select("score")
    .eq("phone", phone)
    .order("created_at", { ascending: false })
    .limit(Math.max(1, Number(settings?.trend_window) || 3));
  const trend = computeTrend(
    ((past ?? []) as any[]).map((p) => p.score),
    score,
    Number(settings?.trend_window) || 3,
    Number(settings?.trend_min_delta) || 8,
  );
  const hot = isHot(score, Number(settings?.hot_threshold) || 80);
  const level = levelFor(score);
  const objection = analysis.objection === "NENHUMA" ? null : analysis.objection;
  const now = new Date().toISOString();

  // historico com chave unica por mensagem: evita duplicar a mesma analise
  const { error: histErr } = await db.from("lead_interest_history").insert({
    phone,
    score,
    previous_score: prevScore,
    level,
    intent: analysis.intent,
    objection,
    trend,
    hot,
    reason: analysis.reasons[0]?.text ?? null,
    reasons: analysis.reasons,
    source_message_id: lastIn.id,
    logic_version: LOGIC_VERSION,
  });
  if (histErr) {
    if (String(histErr.code) === "23505") return null;
    throw histErr;
  }

  const { data: lead } = await db.from("leads").select("id").eq("phone", phone).limit(1).maybeSingle();
  const row = {
    phone,
    lead_id: lead?.id ?? null,
    chat_id: lastIn.chat_id ?? null,
    score,
    previous_score: prevScore,
    level,
    intent: analysis.intent,
    objection,
    trend,
    reasons: analysis.reasons,
    hot,
    last_message_id: lastIn.id,
    logic_version: LOGIC_VERSION,
    last_error: null,
    analyzed_at: now,
    updated_at: now,
  };
  await db.from("lead_interest").update(row).eq("phone", phone);
  await log("INTEREST_UPDATED", "OK", { phone, score, level, intent: analysis.intent, trend, hot });
  return row;
}

/** Worker: processa leads com analise pendente. Nunca lanca erro. */
export async function runPendingInterest(limit = 10) {
  let done = 0;
  try {
    const db = getDb() as any;
    const { data: due } = await db
      .from("lead_interest")
      .select("phone, pending_at")
      .not("pending_at", "is", null)
      .lte("pending_at", new Date().toISOString())
      .limit(limit);
    for (const r of due ?? []) {
      const { data: locked } = await db
        .from("lead_interest")
        .update({ pending_at: null })
        .eq("phone", r.phone)
        .eq("pending_at", r.pending_at)
        .select("phone")
        .maybeSingle();
      if (!locked) continue;
      try {
        if (await analyzeLead(r.phone)) done += 1;
      } catch (e: any) {
        await log("INTEREST_ANALYSIS_FAILED", "ERROR", { phone: r.phone, error: String(e?.message ?? e) });
      }
    }
  } catch (e: any) {
    console.error("[INTEREST_WORKER_FAILED]", e?.message ?? e);
  }
  return done;
}
