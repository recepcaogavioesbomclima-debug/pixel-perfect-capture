import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Nav } from "@/components/Nav";
import { getEvolutionSettings, saveEvolutionSettings, testEvolution } from "@/lib/evolution.functions";

export const Route = createFileRoute("/configuracoes")({
  head: () => ({
    meta: [
      { title: "Configurações · Evolution API — Gaviões 24h Bom Clima" },
      { name: "description", content: "Configure o servidor Evolution API usado para conectar o WhatsApp da academia." },
      { property: "og:title", content: "Configurações · Evolution API — Gaviões 24h" },
      { property: "og:description", content: "Servidor, chave e instância do WhatsApp via Evolution API." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Settings,
});

function Settings() {
  const load = useServerFn(getEvolutionSettings);
  const save = useServerFn(saveEvolutionSettings);
  const test = useServerFn(testEvolution);
  const [apiUrl, setApiUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [masked, setMasked] = useState("");
  const [instanceName, setInstanceName] = useState("gavioes-bom-clima");
  const [enabled, setEnabled] = useState(true);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    load().then((s) => {
      if (!s) return;
      setApiUrl(s.apiUrl);
      setInstanceName(s.instanceName);
      setEnabled(s.enabled);
      setMasked(s.apiKeyMasked);
    });
  }, [load]);

  async function onSave() {
    setBusy(true);
    setMsg(null);
    try {
      await save({ data: { apiUrl, apiKey: apiKey || undefined, instanceName, enabled } });
      setApiKey("");
      const r = await test();
      setMsg({ ok: r.ok, text: `Salvo. ${r.message}` });
      const s = await load();
      if (s) setMasked(s.apiKeyMasked);
    } catch (e: any) {
      setMsg({ ok: false, text: String(e?.message ?? e) });
    } finally {
      setBusy(false);
    }
  }

  async function onTest() {
    setBusy(true);
    const r = await test();
    setMsg({ ok: r.ok, text: r.message });
    setBusy(false);
  }

  const input = "w-full rounded-md border border-border bg-background px-3 py-2 text-sm";
  return (
    <div className="min-h-screen bg-background text-foreground">
      <Nav />
      <main className="mx-auto max-w-2xl space-y-5 px-5 py-8">
        <h1 className="text-2xl font-semibold">WhatsApp · Evolution API</h1>
        <p className="text-sm text-muted-foreground">
          Quando ativada, a Evolution API passa a ser usada para QR Code, envio, recebimento e automações. Enquanto
          estiver desativada ou sem configuração, o sistema continua usando a conexão atual.
        </p>
        <div className="space-y-4 rounded-lg border border-border bg-card p-5">
          <label className="block space-y-1 text-sm">
            <span>URL da Evolution API</span>
            <input className={input} value={apiUrl} onChange={(e) => setApiUrl(e.target.value)} placeholder="https://meu-servidor.com" />
          </label>
          <label className="block space-y-1 text-sm">
            <span>API Key {masked && <span className="text-muted-foreground">(atual: {masked} — deixe vazio para manter)</span>}</span>
            <input type="password" className={input} value={apiKey} onChange={(e) => setApiKey(e.target.value)} autoComplete="off" />
          </label>
          <label className="block space-y-1 text-sm">
            <span>Nome da instância</span>
            <input className={input} value={instanceName} onChange={(e) => setInstanceName(e.target.value)} />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
            Usar Evolution API como provedor do WhatsApp
          </label>
          <div className="flex gap-2">
            <button disabled={busy} onClick={onSave} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
              Salvar e conectar
            </button>
            <button disabled={busy} onClick={onTest} className="rounded-md border border-border px-4 py-2 text-sm disabled:opacity-50">
              Testar conexão
            </button>
          </div>
          {msg && <p className={`text-sm ${msg.ok ? "text-primary" : "text-destructive"}`}>{msg.text}</p>}
        </div>
        <p className="text-sm text-muted-foreground">
          Depois de salvar, volte à tela WhatsApp para gerar o QR Code, ver o status, desconectar e registrar o webhook.
        </p>
      </main>
    </div>
  );
}
