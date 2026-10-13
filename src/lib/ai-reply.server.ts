/**
 * Classifica a intencao da conversa e monta a resposta usando SOMENTE a base
 * cadastrada (intent_responses + business_info). Nunca inventa informacoes.
 */
import { getDb } from "./db.server";

export interface AiDecision {
  intent: string;
  reply: string;
  optOut: boolean;
  needsHuman: boolean;
}

const MODEL = "openai/gpt-6-astra";

const REPLY_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["intent", "reply", "optOut", "needsHuman"],
  properties: {
    intent: { type: "string" },
    reply: { type: "string" },
    optOut: { type: "boolean" },
    needsHuman: { type: "boolean" },
  },
};

export async function streamResponses(input: unknown[], name = "reply", schema: unknown = REPLY_SCHEMA): Promise<string> {
  const apiKey = process.env["LOVABLE_API_KEY"];
  if (!apiKey) throw new Error("LOVABLE_API_KEY ausente");
  const res = await fetch("https://ai.gateway.lovable.dev/v1/responses", {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": apiKey, "X-Lovable-AIG-SDK": "fetch" },
    body: JSON.stringify({
      model: MODEL,
      input,
      stream: true,
      store: false,
      reasoning: { effort: "low", summary: "auto" },
      include: ["reasoning.encrypted_content"],
      text: {
        format: {
          type: "json_schema",
          name,
          strict: true,
          schema,
        },
      },
    }),
  });
  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => "");
    const err = new Error(`IA respondeu ${res.status}: ${body.slice(0, 300)}`) as Error & { status?: number };
    err.status = res.status;
    throw err;
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    const lines = buf.split("\n");
    buf = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (!data || data === "[DONE]") continue;
      try {
        const ev = JSON.parse(data);
        if (ev.type === "response.output_text.delta") text += ev.delta ?? "";
        if (ev.type === "error" || ev.type === "response.failed") {
          throw new Error(`IA falhou: ${JSON.stringify(ev).slice(0, 300)}`);
        }
      } catch (e) {
        if (e instanceof Error && e.message.startsWith("IA falhou")) throw e;
      }
    }
  }
  if (!text.trim()) throw new Error("IA retornou resposta vazia");
  return text;
}

export async function decideReply(phone: string, contextCount = 20): Promise<AiDecision> {
  const db = getDb();
  const [{ data: info }, { data: intents }, { data: history }] = await Promise.all([
    (db as any).from("business_info").select("content, fallback_reply").eq("id", true).maybeSingle(),
    (db as any).from("intent_responses").select("intent, examples, response, alternatives, priority").eq("active", true).order("priority", { ascending: false }),
    db.from("messages").select("direction, content, created_at").eq("phone", phone).order("created_at", { ascending: false }).limit(Math.min(Math.max(contextCount, 1), 50)),
  ]);
  const fallback: string = info?.fallback_reply || "Claro! 😊 Me conta o que você gostaria de saber.";
  const transcript = (history ?? [])
    .reverse()
    .map((m) => `${m.direction === "IN" ? "CLIENTE" : "ACADEMIA"}: ${m.content ?? ""}`)
    .join("\n");
  const base = (intents ?? [])
    .map((i: any) => `- ${i.intent} | exemplos: ${i.examples} | resposta cadastrada: ${i.response || "(NAO CADASTRADA)"}${i.alternatives?.length ? ` | alternativas: ${i.alternatives.join(" / ")}` : ""}`)
    .join("\n");

  const system = `Voce e o atendente automatico de WhatsApp da Academia Gavioes 24h - Bom Clima.
Responda a(s) ultima(s) mensagem(ns) do CLIENTE considerando o historico.
REGRAS:
1. Use SOMENTE as informacoes da BASE e das INFORMACOES DA ACADEMIA. Nunca invente precos, horarios, enderecos, links ou condicoes.
2. Se a intencao tiver resposta cadastrada, use-a (pode adaptar levemente ao contexto). Se a informacao pedida nao estiver cadastrada, diga que vai verificar com um consultor e marque needsHuman=true.
3. Se o cliente mandou varias mensagens seguidas, responda todas em UMA unica mensagem curta.
4. Se nao der para identificar a intencao, use exatamente a RESPOSTA GENERICA.
5. Se o cliente pedir para nao receber mais mensagens, optOut=true e responda educadamente confirmando.
6. Mensagens curtas, tom simpatico, portugues do Brasil.
Responda APENAS com JSON: {"intent": string, "reply": string, "optOut": boolean, "needsHuman": boolean}

INFORMACOES DA ACADEMIA:
${info?.content || "(nenhuma cadastrada)"}

BASE DE INTENCOES:
${base}

RESPOSTA GENERICA: ${fallback}`;

  const raw = await streamResponses([
    { role: "system", content: system },
    { role: "user", content: `HISTORICO:\n${transcript}` },
  ]);
  const match = raw.match(/\{[\s\S]*\}/);
  try {
    const parsed = JSON.parse(match ? match[0] : raw);
    return {
      intent: String(parsed.intent ?? "Sem contexto"),
      reply: String(parsed.reply || fallback),
      optOut: Boolean(parsed.optOut),
      needsHuman: Boolean(parsed.needsHuman),
    };
  } catch {
    return { intent: "Sem contexto", reply: fallback, optOut: false, needsHuman: false };
  }
}
