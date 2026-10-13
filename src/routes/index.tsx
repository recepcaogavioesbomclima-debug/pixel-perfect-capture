import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";

import { Nav, StatusBadge } from "@/components/Nav";
import {
  createLead,
  disconnectSession,
  getQrCode,
  getSession,
  registerWebhook,
  runGavioesTest,
  testWhatsAppSend,
} from "@/lib/app.functions";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Academia Gaviões 24h — Bom Clima" },
      {
        name: "description",
        content:
          "Atendimento da Academia Gaviões 24h — Bom Clima pelo WhatsApp, com respostas e acompanhamento automatizados.",
      },
      { property: "og:title", content: "Academia Gaviões 24h — Bom Clima" },
      {
        property: "og:description",
        content: "Atendimento da Academia Gaviões 24h — Bom Clima pelo WhatsApp.",
      },
      { property: "og:type", content: "website" },
      {
        property: "og:url",
        content: "https://automacaogavioesbomclima.lovable.app/",
      },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: "Academia Gaviões 24h — Bom Clima" },
      {
        name: "twitter:description",
        content: "Atendimento da Academia Gaviões 24h — Bom Clima pelo WhatsApp.",
      },
    ],
    links: [
      {
        rel: "canonical",
        href: "https://automacaogavioesbomclima.lovable.app/",
      },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "HealthClub",
          name: "Academia Gaviões 24h — Bom Clima",
          url: "https://automacaogavioesbomclima.lovable.app/",
          sameAs: ["https://www.instagram.com/academiagavioes24hbomclima/"],
        }),
      },
    ],
  }),
  component: Page,
});

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h2 className="mb-4 text-base font-semibold text-foreground">{title}</h2>
      {children}
    </section>
  );
}

function Page() {
  const queryClient = useQueryClient();
  const sessionFn = useServerFn(getSession);
  const qrFn = useServerFn(getQrCode);
  const disconnectFn = useServerFn(disconnectSession);
  const webhookFn = useServerFn(registerWebhook);
  const leadFn = useServerFn(createLead);
  const testFn = useServerFn(runGavioesTest);

  const session = useQuery({
    queryKey: ["session"],
    queryFn: () => sessionFn(),
    refetchInterval: 5000,
  });

  const [qr, setQr] = useState<{ dataUrl: string | null; error: string | null; at: number } | null>(
    null,
  );
  const [qrAgeSeconds, setQrAgeSeconds] = useState(0);

  const qrMutation = useMutation({
    mutationFn: () => qrFn(),
    onSuccess: (data) => {
      setQr({ dataUrl: data.dataUrl, error: data.error, at: Date.now() });
      setQrAgeSeconds(0);
      queryClient.invalidateQueries({ queryKey: ["session"] });
    },
  });

  const connected = session.data?.status === "CONNECTED";

  useEffect(() => {
    if (!qr?.dataUrl || connected) return;
    const id = setInterval(() => setQrAgeSeconds((value) => value + 1), 1000);
    return () => clearInterval(id);
  }, [qr?.dataUrl, connected]);

  useEffect(() => {
    if (connected && qr) setQr(null);
  }, [connected, qr]);

  const qrExpired = Boolean(qr?.dataUrl) && qrAgeSeconds >= 25;

  const disconnectMutation = useMutation({
    mutationFn: () => disconnectFn(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["session"] }),
  });

  const webhookMutation = useMutation({
    mutationFn: () => webhookFn({ data: { origin: window.location.origin } }),
  });

  const [leadName, setLeadName] = useState("");
  const [leadPhone, setLeadPhone] = useState("");
  const leadMutation = useMutation({ mutationFn: () => leadFn({ data: { name: leadName, phone: leadPhone } }) });

  const [testPhone, setTestPhone] = useState("");
  const testMutation = useMutation({ mutationFn: () => testFn({ data: { phone: testPhone } }) });

  const sendFn = useServerFn(testWhatsAppSend);
  const [sendPhone, setSendPhone] = useState("");
  const [sendText, setSendText] = useState("🦅 TESTE DE ENVIO — Gaviões Bom Clima");
  const sendMutation = useMutation({
    mutationFn: () => sendFn({ data: { phone: sendPhone, message: sendText } }),
  });

  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <main className="mx-auto grid max-w-5xl gap-5 px-5 py-6">
        <Card title="Sessão do WhatsApp">
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <StatusBadge status={session.data?.status ?? "..."} />
            {session.data?.rawStatus ? (
              <span className="text-muted-foreground">provedor: {session.data.rawStatus}</span>
            ) : null}
            {session.data?.connectedNumber ? (
              <span className="text-foreground">número: {session.data.connectedNumber}</span>
            ) : null}
          </div>
          {session.data?.lastError ? (
            <p className="mt-3 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {session.data.lastError}
            </p>
          ) : null}

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              onClick={() => qrMutation.mutate()}
              disabled={qrMutation.isPending || connected}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-50"
            >
              {qrMutation.isPending ? "Gerando..." : connected ? "Conectado" : "Conectar WhatsApp"}
            </button>
            <button
              onClick={() => qrMutation.mutate()}
              disabled={qrMutation.isPending || connected}
              className="rounded-md border border-input px-4 py-2 text-sm transition-colors hover:bg-accent disabled:opacity-50"
            >
              Gerar novo QR
            </button>
            <button
              onClick={() => disconnectMutation.mutate()}
              disabled={disconnectMutation.isPending || !connected}
              className="rounded-md border border-input px-4 py-2 text-sm transition-colors hover:bg-accent disabled:opacity-50"
            >
              Desconectar
            </button>
            <button
              onClick={() => webhookMutation.mutate()}
              disabled={webhookMutation.isPending}
              className="rounded-md border border-input px-4 py-2 text-sm transition-colors hover:bg-accent disabled:opacity-50"
            >
              Registrar webhook
            </button>
          </div>

          {webhookMutation.data ? (
            <p className="mt-3 text-sm text-muted-foreground">
              {webhookMutation.data.ok
                ? `Webhook registrado: ${webhookMutation.data.url}`
                : `Falha ao registrar webhook: ${webhookMutation.data.error}`}
            </p>
          ) : null}

          {qr?.error ? (
            <p className="mt-4 rounded-md bg-destructive/10 p-3 text-sm text-destructive">{qr.error}</p>
          ) : null}

          {qr?.dataUrl && !connected ? (
            <div className="mt-4 flex flex-wrap items-center gap-5">
              <img
                src={qr.dataUrl}
                alt="QR Code do WhatsApp"
                className={`h-56 w-56 rounded-lg bg-white p-2 ${qrExpired ? "opacity-30" : ""}`}
              />
              <div className="text-sm">
                <p className="font-medium text-foreground">
                  {qrExpired ? "QR expirado" : "Aguardando leitura"}
                </p>
                <p className="mt-1 max-w-xs text-muted-foreground">
                  Abra o WhatsApp no celular, toque em Aparelhos conectados e escaneie o código.
                </p>
                {qrExpired ? (
                  <button
                    onClick={() => qrMutation.mutate()}
                    className="mt-3 rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground"
                  >
                    Gerar novo QR
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
        </Card>

        <Card title="Envio manual (teste real)">
          <p className="text-sm text-muted-foreground">
            Envia uma mensagem real pelo provedor. Só mostra sucesso quando o provedor confirma e
            devolve o ID da mensagem.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <input
              value={sendPhone}
              onChange={(event) => setSendPhone(event.target.value)}
              placeholder="5511999999999"
              className="w-56 rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <input
              value={sendText}
              onChange={(event) => setSendText(event.target.value)}
              placeholder="Mensagem"
              className="min-w-64 flex-1 rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <button
              onClick={() => sendMutation.mutate()}
              disabled={sendMutation.isPending || !sendPhone}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {sendMutation.isPending ? "Enviando..." : "Enviar mensagem"}
            </button>
          </div>
          {sendMutation.data ? (
            sendMutation.data.ok ? (
              <p className="mt-3 rounded-md bg-primary/10 p-3 text-sm text-primary">
                SENT — número {sendMutation.data.phone} · ID do provedor:{" "}
                {sendMutation.data.providerMessageId}
              </p>
            ) : (
              <p className="mt-3 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
                FAILED — {sendMutation.data.error}
              </p>
            )
          ) : null}
          {sendMutation.error ? (
            <p className="mt-3 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              FAILED — {String(sendMutation.error)}
            </p>
          ) : null}
        </Card>

        <Card title="TESTE-GAVIOES">
          <p className="text-sm text-muted-foreground">
            Envia 5 mensagens reais com 2 segundos de intervalo. Só funciona com o WhatsApp
            realmente conectado.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <input
              value={testPhone}
              onChange={(event) => setTestPhone(event.target.value)}
              placeholder="5511999999999"
              className="w-56 rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <button
              onClick={() => testMutation.mutate()}
              disabled={testMutation.isPending || !testPhone}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {testMutation.isPending ? "Enviando..." : "Executar teste"}
            </button>
          </div>
          {testMutation.data?.error ? (
            <p className="mt-3 rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {testMutation.data.error}
            </p>
          ) : null}
          {testMutation.data?.results?.length ? (
            <ul className="mt-3 space-y-1 text-sm">
              {testMutation.data.results.map((result) => (
                <li key={result.label} className={result.ok ? "text-primary" : "text-destructive"}>
                  {result.label}: {result.ok ? `confirmado (${result.providerMessageId})` : result.error}
                </li>
              ))}
            </ul>
          ) : null}
        </Card>

        <Card title="Criar lead (dispara LEAD_CREATED)">
          <div className="flex flex-wrap gap-2">
            <input
              value={leadName}
              onChange={(event) => setLeadName(event.target.value)}
              placeholder="Nome"
              className="w-48 rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <input
              value={leadPhone}
              onChange={(event) => setLeadPhone(event.target.value)}
              placeholder="5511999999999"
              className="w-56 rounded-md border border-input bg-background px-3 py-2 text-sm"
            />
            <button
              onClick={() => leadMutation.mutate()}
              disabled={leadMutation.isPending || !leadPhone}
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              Criar lead
            </button>
          </div>
          {leadMutation.data ? (
            <p
              className={`mt-3 rounded-md p-3 text-sm ${
                leadMutation.data.executions > 0
                  ? "bg-primary/10 text-primary"
                  : "bg-destructive/10 text-destructive"
              }`}
            >
              {leadMutation.data.executions > 0
                ? `Lead criado. Automações encontradas: ${leadMutation.data.automationsFound}. Automações iniciadas: ${leadMutation.data.executions}. Etapas processadas agora: ${leadMutation.data.processedSteps}.`
                : `Lead criado, mas nenhuma automação foi iniciada: ${leadMutation.data.reason ?? "NO ACTIVE AUTOMATION FOUND"}.`}
            </p>
          ) : null}
          {leadMutation.error ? (
            <p className="mt-3 text-sm text-destructive">{String(leadMutation.error)}</p>
          ) : null}
        </Card>
      </main>
    </div>
  );
}
