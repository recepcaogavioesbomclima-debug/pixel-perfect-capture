/**
 * Camada de integracao com o provedor de WhatsApp.
 * Implementacao atual: Whapi.Cloud (https://gate.whapi.cloud).
 *
 * O motor de automacao NUNCA fala com o provedor diretamente: ele usa apenas
 * a interface WhatsAppProvider exportada no final deste arquivo.
 */

export type SessionStatus =
  | "DISCONNECTED"
  | "CONNECTING"
  | "WAITING_QR"
  | "CONNECTED"
  | "DISCONNECTING"
  | "ERROR";

export class ProviderNotConfiguredError extends Error {
  constructor() {
    super(
      "WHAPI_API_TOKEN nao configurado. Crie um canal em whapi.cloud e salve o token do canal como segredo WHAPI_API_TOKEN.",
    );
    this.name = "ProviderNotConfiguredError";
  }
}

export class ProviderError extends Error {
  status: number;
  body: string;
  constructor(status: number, body: string) {
    super(`Provedor respondeu ${status}: ${body.slice(0, 500)}`);
    this.name = "ProviderError";
    this.status = status;
    this.body = body;
  }
}

const BASE = "https://gate.whapi.cloud";

function getToken(): string {
  const token = process.env["WHAPI_API_TOKEN"];
  if (!token) throw new ProviderNotConfiguredError();
  return token;
}

export function isProviderConfigured(): boolean {
  return Boolean(process.env["WHAPI_API_TOKEN"]);
}

async function request(
  path: string,
  init: { method?: string; body?: unknown; accept?: string } = {},
): Promise<{ status: number; json: any; text: string; buffer?: ArrayBuffer }> {
  const token = getToken();
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
    Accept: init.accept ?? "application/json",
  };
  if (init.body !== undefined) headers["Content-Type"] = "application/json";

  const requestInit: RequestInit = { method: init.method ?? "GET", headers };
  if (init.body !== undefined) requestInit.body = JSON.stringify(init.body);
  const res = await fetch(`${BASE}${path}`, requestInit);

  const contentType = res.headers.get("content-type") ?? "";
  if (contentType.startsWith("image/")) {
    const buffer = await res.arrayBuffer();
    if (!res.ok) throw new ProviderError(res.status, "erro ao obter imagem");
    return { status: res.status, json: null, text: "", buffer };
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

function mapStatus(raw: string | undefined | null): SessionStatus {
  const value = (raw ?? "").toLowerCase();
  if (!value) return "DISCONNECTED";
  if (value.includes("qr") || value.includes("pairing")) return "WAITING_QR";
  if (
    value.includes("auth") ||
    value.includes("active") ||
    value.includes("connect") ||
    value.includes("ready") ||
    value.includes("online")
  ) {
    return "CONNECTED";
  }
  if (
    value.includes("init") ||
    value.includes("launch") ||
    value.includes("load") ||
    value.includes("start") ||
    value.includes("sync")
  ) {
    return "CONNECTING";
  }
  if (value.includes("expire")) return "WAITING_QR";
  if (value.includes("fail") || value.includes("error")) return "ERROR";
  return "DISCONNECTED";
}

function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) binary += String.fromCharCode(bytes[i]!);
  // btoa existe no runtime do Worker
  return btoa(binary);
}

/** Traduz o erro real do provedor para uma mensagem clara, sem esconder o retorno. */
function describeSendError(status: number, body: string): string {
  const raw = body.slice(0, 400);
  if (status === 401 || status === 403) return `Token invalido ou sem permissao (HTTP ${status}): ${raw}`;
  if (status === 404) return `Endpoint ou recurso inexistente (HTTP 404): ${raw}`;
  if (status === 400) return `Payload ou destinatario invalido (HTTP 400): ${raw}`;
  if (status === 409) return `Sessao nao autorizada (HTTP 409): ${raw}`;
  if (status === 429) return `Limite de envio do provedor atingido (HTTP 429): ${raw}`;
  if (status >= 500) return `Provedor indisponivel (HTTP ${status}): ${raw}`;
  if (!status) return `Falha de rede/timeout ao falar com o provedor: ${raw}`;
  return `Falha no envio (HTTP ${status}): ${raw}`;
}

export interface HealthResult {
  status: SessionStatus;
  rawStatus: string;
  connectedNumber: string | null;
  channelId: string | null;
  raw: unknown;
}

export const WhatsAppProvider = {
  name: "whapi" as const,

  isConfigured: isProviderConfigured,

  /** Acorda/inicializa a sessao real no provedor e devolve o status atual. */
  async getStatus(wakeup = true): Promise<HealthResult> {
    const { json } = await request(`/health?wakeup=${wakeup ? "true" : "false"}&channel_type=web`);
    const rawStatus: string = json?.status?.text ?? json?.status ?? "";
    const connectedNumber: string | null =
      json?.user?.id ?? json?.channel?.phone ?? json?.user?.phone ?? null;
    return {
      status: mapStatus(typeof rawStatus === "string" ? rawStatus : ""),
      rawStatus: typeof rawStatus === "string" ? rawStatus : JSON.stringify(rawStatus),
      connectedNumber: connectedNumber ? String(connectedNumber).split("@")[0]! : null,
      channelId: json?.channel?.id ?? null,
      raw: json,
    };
  },

  async createSession(): Promise<HealthResult> {
    return WhatsAppProvider.getStatus(true);
  },

  /** QR Code REAL da sessao do provedor, como data URL PNG. */
  async getQRCode(): Promise<{ dataUrl: string; expiresInSeconds: number }> {
    try {
      const res = await request("/users/login/image?wakeup=true&size=400", {
        accept: "image/png",
      });
      if (res.buffer) {
        return { dataUrl: `data:image/png;base64,${toBase64(res.buffer)}`, expiresInSeconds: 20 };
      }
      const base64 = res.json?.base64 ?? res.json?.qr ?? res.json?.image;
      if (typeof base64 === "string") {
        const clean = base64.startsWith("data:") ? base64 : `data:image/png;base64,${base64}`;
        return { dataUrl: clean, expiresInSeconds: 20 };
      }
      throw new ProviderError(res.status, res.text || "resposta sem QR");
    } catch (error) {
      if (error instanceof ProviderError && error.status === 409) {
        // 409 = canal ja autenticado
        throw error;
      }
      throw error;
    }
  },

  async getConnectedNumber(): Promise<string | null> {
    const health = await WhatsAppProvider.getStatus(false);
    return health.connectedNumber;
  },

  /**
   * Verifica no provedor se o numero existe no WhatsApp.
   * Whapi: POST /contacts -> { contacts: [{ input, status: "valid"|"invalid", wa_id }] }
   */
  async checkNumber(phone: string): Promise<{ valid: boolean; waId: string | null; raw: unknown }> {
    const { json } = await request("/contacts", {
      method: "POST",
      body: { blocking: "wait", force_check: true, contacts: [phone] },
    });
    const entry = Array.isArray(json?.contacts) ? json.contacts[0] : null;
    return {
      valid: entry?.status === "valid",
      waId: entry?.wa_id ?? null,
      raw: json,
    };
  },

  /** Envio REAL. Retorna o id da mensagem confirmado pelo provedor. */
  async sendMessage(
    to: string,
    body: string,
  ): Promise<{ providerMessageId: string; chatId: string | null; raw: unknown }> {
    const endpoint = "/messages/text";
    const health = await WhatsAppProvider.getStatus(false).catch(() => null);
    const from = health?.connectedNumber ?? null;

    if (health && health.status !== "CONNECTED") {
      throw new ProviderError(
        409,
        `sessao nao autorizada para envio (status real do provedor: ${health.rawStatus || health.status})`,
      );
    }

    const check = await WhatsAppProvider.checkNumber(to).catch(() => null);
    if (check && !check.valid) {
      throw new ProviderError(
        400,
        `numero de destino invalido no WhatsApp: ${to} (verifique DDI 55 + DDD + numero)`,
      );
    }

    const payload = { to, body };
    let status = 0;
    let responseText = "";
    try {
      const res = await request(endpoint, { method: "POST", body: payload });
      status = res.status;
      responseText = res.text;
      const json = res.json;
      const providerMessageId = json?.message?.id ?? json?.id;
      if (json?.sent === false || !providerMessageId) {
        throw new ProviderError(status, `envio sem confirmacao do provedor: ${res.text}`);
      }
      console.log(
        `[WHATSAPP SEND]\nProvider: whapi\nSession: ${health?.channelId ?? "?"}\nFrom: ${from}\nTo: ${to}\nEndpoint: ${BASE}${endpoint}\nMethod: POST\nPayload: ${JSON.stringify(payload)}\nHTTP Status: ${status}\nResponse: ${responseText.slice(0, 600)}`,
      );
      return {
        providerMessageId: String(providerMessageId),
        chatId: json?.message?.chat_id ?? null,
        raw: json,
      };
    } catch (error: any) {
      const errStatus = error instanceof ProviderError ? error.status : status;
      const errBody = error instanceof ProviderError ? error.body : String(error?.message ?? error);
      console.error(
        `[WHATSAPP SEND]\nProvider: whapi\nSession: ${health?.channelId ?? "?"}\nFrom: ${from}\nTo: ${to}\nEndpoint: ${BASE}${endpoint}\nMethod: POST\nPayload: ${JSON.stringify(payload)}\nHTTP Status: ${errStatus}\nResponse: ${String(errBody).slice(0, 600)}`,
      );
      throw new ProviderError(errStatus || 0, describeSendError(errStatus, String(errBody)));
    }
  },

  async disconnect(): Promise<void> {
    await request("/users/logout", { method: "POST" });
  },

  /** Registra o webhook real do sistema no canal do provedor. */
  async setWebhook(url: string): Promise<unknown> {
    const { json } = await request("/settings", {
      method: "PATCH",
      body: {
        webhooks: [
          {
            url,
            events: [
              { type: "messages", method: "post" },
              { type: "statuses", method: "post" },
              { type: "users", method: "post" },
            ],
            mode: "body",
          },
        ],
      },
    });
    return json;
  },
};

export type WhatsAppProviderType = typeof WhatsAppProvider;
