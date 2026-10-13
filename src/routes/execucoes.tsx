import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Nav, StatusBadge } from "@/components/Nav";
import { listExecutions, tickNow } from "@/lib/app.functions";

export const Route = createFileRoute("/execucoes")({
  head: () => ({
    meta: [
      { title: "Execuções · Gaviões 24h Bom Clima" },
      {
        name: "description",
        content: "Acompanhe cada automação em andamento, etapa atual, próxima execução e registros.",
      },
      { property: "og:title", content: "Execuções · Gaviões 24h Bom Clima" },
      {
        property: "og:description",
        content: "Status, etapa atual, próxima execução e logs detalhados de cada atendimento.",
      },
    ],
  }),
  component: Page,
});

function formatDate(value: string | null) {
  if (!value) return "—";
  return new Date(value).toLocaleString("pt-BR");
}

function Page() {
  const queryClient = useQueryClient();
  const listFn = useServerFn(listExecutions);
  const tickFn = useServerFn(tickNow);

  const query = useQuery({
    queryKey: ["executions"],
    queryFn: () => listFn(),
    refetchInterval: 10000,
  });

  const tickMutation = useMutation({
    mutationFn: () => tickFn(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["executions"] }),
  });

  const automationName = (id: string) =>
    (query.data?.automations ?? []).find((automation: any) => automation.id === id)?.name ?? id;

  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <main className="mx-auto grid max-w-5xl gap-5 px-5 py-6">
        <section className="rounded-xl border border-border bg-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold">Execuções</h2>
            <button
              onClick={() => tickMutation.mutate()}
              disabled={tickMutation.isPending}
              className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-accent disabled:opacity-50"
            >
              Processar agora
            </button>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="text-xs uppercase text-muted-foreground">
                <tr>
                  <th className="py-2 pr-3">Automação</th>
                  <th className="py-2 pr-3">Número</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Etapa</th>
                  <th className="py-2 pr-3">Respondeu</th>
                  <th className="py-2 pr-3">Próxima execução</th>
                </tr>
              </thead>
              <tbody>
                {(query.data?.executions ?? []).map((execution: any) => (
                  <tr key={execution.id} className="border-t border-border">
                    <td className="py-2 pr-3">{automationName(execution.automation_id)}</td>
                    <td className="py-2 pr-3">{execution.phone}</td>
                    <td className="py-2 pr-3">
                      <StatusBadge status={execution.status} />
                    </td>
                    <td className="py-2 pr-3">#{execution.current_step + 1}</td>
                    <td className="py-2 pr-3">{execution.replied ? "sim" : "não"}</td>
                    <td className="py-2 pr-3">{formatDate(execution.next_run_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {!query.data?.executions?.length ? (
              <p className="py-3 text-sm text-muted-foreground">Nenhuma execução ainda.</p>
            ) : null}
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-4 text-base font-semibold">Logs</h2>
          <ul className="space-y-1 text-sm">
            {(query.data?.logs ?? []).map((entry: any) => (
              <li key={entry.id} className="flex flex-wrap gap-2 border-b border-border/60 py-1.5">
                <span className="text-muted-foreground">{formatDate(entry.created_at)}</span>
                <span className="font-medium">{entry.event}</span>
                <span
                  className={
                    entry.status === "ERROR"
                      ? "text-destructive"
                      : entry.status === "WARN"
                        ? "text-chart-4"
                        : "text-primary"
                  }
                >
                  {entry.status}
                </span>
                {entry.data ? (
                  <span className="text-muted-foreground">{JSON.stringify(entry.data).slice(0, 160)}</span>
                ) : null}
              </li>
            ))}
          </ul>
          {!query.data?.logs?.length ? (
            <p className="text-sm text-muted-foreground">Sem registros ainda.</p>
          ) : null}
        </section>
      </main>
    </div>
  );
}
