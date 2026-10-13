/**
 * Provedor Evolution API (v2). Mesma interface do WhatsAppProvider do Whapi.
 * Configuracao (URL, API Key, instancia) fica na tabela evolution_config,
 * lida apenas pelo servidor com service role.
 */
import { getDb } from "./db.server";
import { ProviderError, type HealthResult, type SessionStatus } from "./whatsapp-provider.server";

export interface EvolutionConfig {
  api_url: string;
  api_key: string;
  instance_name: string;
  enabled: boolean;
}

/**
 * Config: linha da tabela evolution_config (tela Configuracoes), com
 * fallback nos segredos EVOLUTION_API_URL / EVOLUTION_API_KEY.
 */
export async function getEvolutionConfig(): Promise<EvolutionConfig | null> {
  const { data } = await (getDb() as any)
    .from("evolution_config")
    .select("api_url, api_key, instance_name, enabled")
    .eq("id", true)
    .maybeSingle();
  const envUrl = process.env["EVOLUTION_API_URL"];
  const envKey = process.env["EVOLUTION_API_KEY"];
  if (data) {
    return { ...data, api_url: data.api_url || envUrl || "", api_key: data.api_key || envKey || "" };
  }
  if (envUrl && envKey) {
    return { api_url: envUrl, api_key: envKey, instance_name: "gavioes-bom-clima", enabled: true };
  }
  return null;
}

async function call(cfg: EvolutionConfig, path: string, init: { method?: string; body?: unknown } = {}) {
  const url = `${cfg.api_url.replace(/\/$/, "")}${path}`;
  let res: Response;
  try {
    res = await fetch(url, {
      method: init.method ?? "GET",
      headers: { apikey: cfg.api_key, "Content-Type": "application/json", Accept: "application/json" },
      body: init.body !== undefined ? JSON.stringify(init.body) : null,
    });
  } catch (e: any) {
    throw new ProviderError(0, `Falha de rede ao falar com a Evolution API (${url}): ${e?.message ?? e}`);
  }
  const text = await res.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  if (!res.ok) throw new ProviderError(res.status, text);
  return { status: res.status, json, text };
}

function mapState(state: string): SessionStatus {
  const s = state.toLowerCase();
  if (s === "open") return "CONNECTED";
  if (s === "connecting") return "WAITING_QR";
  if (s === "close") return "DISCONNECTED";
  return s ? "ERROR" : "DISCONNECTED";
}

export function createEvolutionProvider(cfg: EvolutionConfig) {
  const inst = encodeURIComponent(cfg.instance_name);

  const provider = {
    name: "evolution" as const,

    async ensureInstance() {
      try {
        await call(cfg, `/instance/connectionState/${inst}`);
      } catch (e) {
        if (e instanceof ProviderError && e.status === 404) {
          await call(cfg, "/instance/create", {
            method: "POST",
            body: { instanceName: cfg.instance_name, integration: "WHATSAPP-BAILEYS", qrcode: true },
          });
        } else throw e;
      }
    },

    async getStatus(_wakeup = true): Promise<HealthResult> {
      const { json } = await call(cfg, `/instance/connectionState/${inst}`);
      const raw = String(json?.instance?.state ?? json?.state ?? "");
      let connectedNumber: string | null = null;
      if (raw === "open") {
        const list = await call(cfg, `/instance/fetchInstances?instanceName=${inst}`).catch(() => null);
        const item = Array.isArray(list?.json) ? list!.json[0] : null;
        const jid = item?.ownerJid ?? item?.instance?.owner ?? null;
        connectedNumber = jid ? String(jid).split("@")[0]! : null;
      }
      return { status: mapState(raw), rawStatus: raw, connectedNumber, channelId: cfg.instance_name, raw: json };
    },

    async getQRCode(): Promise<{ dataUrl: string; expiresInSeconds: number }> {
      await provider.ensureInstance();
      const { json, status, text } = await call(cfg, `/instance/connect/${inst}`);
      const b64 = json?.base64 ?? json?.qrcode?.base64;
      if (typeof b64 !== "string") throw new ProviderError(status, `Evolution nao retornou QR: ${text}`);
      return { dataUrl: b64.startsWith("data:") ? b64 : `data:image/png;base64,${b64}`, expiresInSeconds: 40 };
    },

    async checkNumber(phone: string) {
      const { json } = await call(cfg, `/chat/whatsappNumbers/${inst}`, {
        method: "POST",
        body: { numbers: [phone] },
      });
      const entry = Array.isArray(json) ? json[0] : null;
      return { valid: Boolean(entry?.exists), waId: entry?.jid ?? null, raw: json };
    },

    async sendMessage(to: string, body: string) {
      const health = await provider.getStatus(false).catch(() => null);
      if (health && health.status !== "CONNECTED") {
        throw new ProviderError(409, `sessao Evolution nao conectada (estado: ${health.rawStatus || health.status})`);
      }
      const check = await provider.checkNumber(to).catch(() => null);
      if (check && !check.valid) throw new ProviderError(400, `numero nao existe no WhatsApp: ${to}`);
      const endpoint = `/message/sendText/${inst}`;
      const payload = { number: to, text: body };
      const res = await call(cfg, endpoint, { method: "POST", body: payload });
      const id = res.json?.key?.id;
      console.log(
        `[WHATSAPP SEND]\nProvider: evolution\nSession: ${cfg.instance_name}\nFrom: ${health?.connectedNumber}\nTo: ${to}\nEndpoint: ${endpoint}\nMethod: POST\nPayload: ${JSON.stringify(payload)}\nHTTP Status: ${res.status}\nResponse: ${res.text.slice(0, 600)}`,
      );
      if (!id) throw new ProviderError(res.status, `envio sem confirmacao da Evolution: ${res.text}`);
      return { providerMessageId: String(id), chatId: res.json?.key?.remoteJid ?? null, raw: res.json };
    },

    async disconnect() {
      await call(cfg, `/instance/logout/${inst}`, { method: "DELETE" });
    },

    async setWebhook(url: string) {
      const { json } = await call(cfg, `/webhook/set/${inst}`, {
        method: "POST",
        body: {
          webhook: {
            enabled: true,
            url,
            webhookByEvents: false,
            webhookBase64: false,
            events: ["MESSAGES_UPSERT", "CONNECTION_UPDATE", "QRCODE_UPDATED"],
          },
        },
      });
      return json;
    },
  };
  return provider;
}
