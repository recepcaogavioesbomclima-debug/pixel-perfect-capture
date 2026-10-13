import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Nav } from "@/components/Nav";
import { tickNow } from "@/lib/app.functions";
import { getExecutionHistory, listLeadsQueue, setExecutionStatus } from "@/lib/queue.functions";

export const Route = createFileRoute("/automacoes_/leads")({
  head: () => ({
    meta: [
      { title: "Leads em Automação · Gaviões 24h Bom Clima" },
      { name: "description", content: "Fila em tempo real dos leads em automação: etapa, próxima mensagem e contagem." },
      { property: "og:title", content: "Leads em Automação · Gaviões 24h Bom Clima" },
      { property: "og:description", content: "Acompanhe cada lead, a próxima mensagem e quanto falta para o envio." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

const STATUS: Record<string, { label: string; cls: string }> = {
  WAITING: { label: "⏳ Aguardando próxima etapa", cls: "bg-chart-4/15 text-chart-4" },
  PENDING: { label: "🟢 Automação ativa", cls: "bg-primary/15 text-primary" },
  RUNNING: { label: "🟢 Automação ativa", cls: "bg-primary/15 text-primary" },
  CONVERSING: { label: "💬 Cliente respondeu", cls: "bg-chart-2/15 text-chart-2" },
  REPLYING: { label: "🤖 Respondendo automaticamente", cls: "bg-chart-2/15 text-chart-2" },
  TAKEN_OVER: { label: "👤 Atendimento assumido", cls: "bg-muted text-muted-foreground" },
  COMPLETED: { label: "✅ Automação concluída", cls: "bg-primary/15 text-primary" },
  PAUSED: { label: "⏸ Automação pausada", cls: "bg-muted text-muted-foreground" },
  FAILED: { label: "🔴 Erro", cls: "bg-destructive/15 text-destructive" },
  CANCELLED: { label: "❌ Automação cancelada", cls: "bg-muted text-muted-foreground" },
};

function Badge({ status, replyPending }: { status: string; replied?: boolean; replyPending?: boolean }) {
  const s = STATUS[status === "CONVERSING" && replyPending ? "REPLYING" : status] ?? { label: status, cls: "bg-muted" };
  return <span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${s.cls}`}>{s.label}</span>;
}

const fmt = (v: string | null) => (v ? new Date(v).toLocaleString("pt-BR") : "—");
const pad = (n: number) => String(n).padStart(2, "0");
function countdown(target: string, now: number) {
  const ms = Math.max(0, new Date(target).getTime() - now);
  const t = Math.floor(ms / 1000);
  return `${pad(Math.floor(t / 3600))}h ${pad(Math.floor((t % 3600) / 60))}min ${pad(t % 60)}s`;
}
const ticking = (s: string) => s === "WAITING" || s === "PENDING";

function Page() {
  const qc = useQueryClient();
  const listFn = useServerFn(listLeadsQueue);
  const tickFn = useServerFn(tickNow);
  const [now, setNow] = useState(() => Date.now());
  const [selected, setSelected] = useState<string | null>(null);
  const firing = useRef(false);

  const query = useQuery({ queryKey: ["leads-queue"], queryFn: () => listFn(), refetchInterval: 5000 });
  const rows = query.data ?? [];

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Ao zerar, pede ao worker (que le nextRunAt do banco) para processar e recarrega a fila.
  useEffect(() => {
    const due = rows.some((r) => ticking(r.status) && new Date(r.nextRunAt).getTime() <= now);
    if (!due || firing.current) return;
    firing.current = true;
    tickFn()
      .catch(() => null)
      .finally(() => {
        qc.invalidateQueries({ queryKey: ["leads-queue"] });
        setTimeout(() => (firing.current = false), 3000);
      });
  }, [now, rows, tickFn, qc]);

  const current = rows.find((r) => r.id === selected) ?? null;

  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <main className="mx-auto grid max-w-6xl gap-5 px-5 py-6">
        <section className="rounded-xl border border-border bg-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold">Leads em Automação</h2>
            <Link to="/automacoes" className="text-sm text-muted-foreground hover:text-foreground">
              ← Automações
            </Link>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-muted-foreground">
                <tr>
                  {["Lead", "Telefone", "Automação", "Última ação", "Próxima mensagem", "Próximo envio", "Contagem", "Status"].map((h) => (
                    <th key={h} className="py-2 pr-3">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r) => (
                  <tr
                    key={r.id}
                    onClick={() => setSelected(r.id)}
                    className="cursor-pointer border-t border-border align-top hover:bg-accent/40"
                  >
                    <td className="py-2 pr-3 font-medium">{r.leadName || "Sem nome"}</td>
                    <td className="py-2 pr-3">{r.phone}</td>
                    <td className="py-2 pr-3">{r.automationName}</td>
                    <td className="py-2 pr-3">{r.sentCount ? `Mensagem ${r.sentCount} enviada` : "Iniciada"}</td>
                    <td className="max-w-56 py-2 pr-3 text-muted-foreground">
                      {r.nextMessage ? `Mensagem ${r.nextMessageIndex}: "${r.nextMessage.slice(0, 60)}${r.nextMessage.length > 60 ? "…" : ""}"` : "Nenhuma (encerra)"}
                    </td>
                    <td className="py-2 pr-3">{ticking(r.status) ? fmt(r.nextRunAt) : "—"}</td>
                    <td className="py-2 pr-3 font-mono">{ticking(r.status) ? `⏱ ${countdown(r.nextRunAt, now)}` : "—"}</td>
                    <td className="py-2 pr-3"><Badge status={r.status} replied={r.replied} replyPending={r.replyPending} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!rows.length ? (
              <p className="py-3 text-sm text-muted-foreground">
                {query.isLoading ? "Carregando…" : "Nenhum lead em automação no momento."}
              </p>
            ) : null}
          </div>
        </section>
        {current ? <Details row={current} now={now} onClose={() => setSelected(null)} /> : null}
      </main>
    </div>
  );
}

function Details({ row, now, onClose }: { row: any; now: number; onClose: () => void }) {
  const qc = useQueryClient();
  const historyFn = useServerFn(getExecutionHistory);
  const statusFn = useServerFn(setExecutionStatus);
  const history = useQuery({
    queryKey: ["exec-history", row.id],
    queryFn: () => historyFn({ data: { id: row.id } }),
    refetchInterval: 5000,
  });
  const action = useMutation({
    mutationFn: (a: "PAUSE" | "RESUME" | "CANCEL" | "TAKEOVER") => statusFn({ data: { id: row.id, action: a } }),
    onSuccess: (res) => {
      if (!res.ok) alert(res.error);
      qc.invalidateQueries({ queryKey: ["leads-queue"] });
      qc.invalidateQueries({ queryKey: ["exec-history", row.id] });
    },
  });

  const Field = ({ k, v }: { k: string; v: React.ReactNode }) => (
    <div>
      <div className="text-xs uppercase text-muted-foreground">{k}</div>
      <div className="text-sm">{v}</div>
    </div>
  );

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-base font-semibold">Detalhes da execução</h2>
        <button onClick={onClose} className="text-sm text-muted-foreground hover:text-foreground">Fechar</button>
      </div>
      <div className="grid gap-4 sm:grid-cols-3">
        <Field k="Nome" v={row.leadName || "Sem nome"} />
        <Field k="Telefone" v={row.phone} />
        <Field k="Automação" v={row.automationName} />
        <Field k="Status" v={<Badge status={row.status} replied={row.replied} replyPending={row.replyPending} />} />
        <Field k="Última mensagem" v={row.lastMessage ?? "—"} />
        <Field k="Enviada em" v={fmt(row.lastSentAt)} />
        <Field k="Próxima mensagem" v={row.nextMessage ?? "Nenhuma"} />
        <Field k="Próximo envio" v={ticking(row.status) ? fmt(row.nextRunAt) : "—"} />
        <Field k="Tempo restante" v={ticking(row.status) ? countdown(row.nextRunAt, now) : "—"} />
      </div>
      {row.lastError ? <p className="mt-3 text-sm text-destructive">Erro: {row.lastError}</p> : null}
      <div className="mt-4 flex gap-2">
        <button
          onClick={() => confirm("Assumir este atendimento? A automação para na hora.") && action.mutate("TAKEOVER")}
          disabled={action.isPending}
          className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          Assumir atendimento
        </button>
        {row.status === "PAUSED" ? (
          <button onClick={() => action.mutate("RESUME")} disabled={action.isPending} className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-accent">
            Retomar automação
          </button>
        ) : (
          <button onClick={() => action.mutate("PAUSE")} disabled={action.isPending || row.status === "RUNNING"} className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-50">
            Pausar automação
          </button>
        )}
        <button
          onClick={() => confirm("Cancelar esta automação?") && action.mutate("CANCEL")}
          disabled={action.isPending || row.status === "RUNNING"}
          className="rounded-md border border-destructive/50 px-3 py-1.5 text-sm text-destructive hover:bg-destructive/10 disabled:opacity-50"
        >
          Cancelar automação
        </button>
      </div>
      <h3 className="mb-2 mt-5 text-sm font-semibold">Histórico</h3>
      <ul className="space-y-1 text-sm">
        {(history.data ?? []).map((h: any) => (
          <li key={h.id} className="flex gap-2 border-b border-border/60 py-1">
            <span className="text-muted-foreground">{new Date(h.created_at).toLocaleTimeString("pt-BR")}</span>
            <span className="font-medium">{h.event}</span>
            <span className={h.status === "ERROR" ? "text-destructive" : "text-primary"}>{h.status}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
