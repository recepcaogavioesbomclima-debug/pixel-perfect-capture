/**
 * Escolhe o provedor ativo: Evolution API quando configurada e habilitada,
 * senao Whapi (mantido como reserva ate a Evolution estar no ar).
 */
import { WhatsAppProvider as Whapi, isProviderConfigured as whapiConfigured } from "./whatsapp-provider.server";
import { createEvolutionProvider, getEvolutionConfig } from "./evolution-provider.server";

async function resolve() {
  const cfg = await getEvolutionConfig().catch(() => null);
  if (cfg?.enabled) return createEvolutionProvider(cfg);
  return Whapi;
}

export async function activeProviderName(): Promise<"evolution" | "whapi"> {
  return (await resolve()).name;
}

export async function isAnyProviderConfigured(): Promise<boolean> {
  const cfg = await getEvolutionConfig().catch(() => null);
  return Boolean(cfg?.enabled) || whapiConfigured();
}

export const ActiveProvider = {
  getStatus: async (wakeup = true) => (await resolve()).getStatus(wakeup),
  getQRCode: async () => (await resolve()).getQRCode(),
  checkNumber: async (phone: string) => (await resolve()).checkNumber(phone),
  sendMessage: async (to: string, body: string) => (await resolve()).sendMessage(to, body),
  disconnect: async () => (await resolve()).disconnect(),
  setWebhook: async (url: string) => (await resolve()).setWebhook(url),
};
