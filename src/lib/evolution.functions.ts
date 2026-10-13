import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/** Le a configuracao sem nunca devolver a API Key completa. */
export const getEvolutionSettings = createServerFn({ method: "GET" }).handler(async () => {
  const { getEvolutionConfig } = await import("./evolution-provider.server");
  const cfg = await getEvolutionConfig();
  if (!cfg) return null;
  return {
    apiUrl: cfg.api_url,
    instanceName: cfg.instance_name,
    enabled: cfg.enabled,
    apiKeyMasked: cfg.api_key ? `••••${cfg.api_key.slice(-4)}` : "",
  };
});

export const saveEvolutionSettings = createServerFn({ method: "POST" })
  .inputValidator((d) =>
    z
      .object({
        apiUrl: z.string().url().max(300),
        apiKey: z.string().max(300).optional(),
        instanceName: z.string().regex(/^[a-zA-Z0-9_-]{2,60}$/),
        enabled: z.boolean(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { getDb, log } = await import("./db.server");
    const { getEvolutionConfig } = await import("./evolution-provider.server");
    const current = await getEvolutionConfig();
    // Vazio = usa o segredo EVOLUTION_API_KEY guardado no servidor.
    const apiKey = data.apiKey?.trim() || current?.api_key || "";
    if (!apiKey) throw new Error("Informe a API Key ou salve o segredo EVOLUTION_API_KEY.");
    const { error } = await (getDb() as any).from("evolution_config").upsert({
      id: true,
      api_url: data.apiUrl.replace(/\/$/, ""),
      api_key: apiKey,
      instance_name: data.instanceName,
      enabled: data.enabled,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error(error.message);
    await log("EVOLUTION_CONFIG_SAVED", "OK", { apiUrl: data.apiUrl, instance: data.instanceName, enabled: data.enabled });
    return { ok: true };
  });

/** Testa a conexao REAL com o servidor Evolution configurado. */
export const testEvolution = createServerFn({ method: "POST" }).handler(async () => {
  const { getEvolutionConfig, createEvolutionProvider } = await import("./evolution-provider.server");
  const cfg = await getEvolutionConfig();
  if (!cfg) return { ok: false, message: "Evolution API ainda nao configurada." };
  try {
    const p = createEvolutionProvider(cfg);
    await p.ensureInstance();
    const h = await p.getStatus();
    return { ok: true, message: `Servidor respondeu. Instancia "${cfg.instance_name}" estado: ${h.rawStatus || h.status}.` };
  } catch (e: any) {
    return { ok: false, message: String(e?.message ?? e) };
  }
});
