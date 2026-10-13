import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { Nav } from "@/components/Nav";
import { InterestPanel, levelTone } from "@/components/InterestPanel";
import { getInterestSettings, listLeadInterest, saveInterestSettings } from "@/lib/interest.functions";

export const Route = createFileRoute("/interesse")({
  head: () => ({
    meta: [
      { title: "Interesse dos Leads · Gaviões 24h Bom Clima" },
      { name: "description", content: "Score inteligente de interesse de cada lead do WhatsApp, com tendência e motivos." },
      { property: "og:title", content: "Interesse dos Leads · Gaviões 24h Bom Clima" },
      { property: "og:description", content: "Veja quem está mais perto de se matricular." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

function Page() {
  const listFn = useServerFn(listLeadInterest);
  const q = useQuery({ queryKey: ["interest-list"], queryFn: () => listFn(), refetchInterval: 10000 });
  const [phone, setPhone] = useState<string | null>(null);
  const rows = q.data ?? [];

  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <main className="mx-auto grid max-w-6xl gap-5 px-5 py-6">
        <Settings />
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-4 text-base font-semibold">Interesse dos Leads</h2>
          <table className="w-full text-left text-sm">
            <thead className="text-xs uppercase text-muted-foreground">
              <tr>
                {["Lead", "Telefone", "Score", "Nível", "Intenção", "Tendência", "Quente", "Última análise"].map((h) => (
                  <th key={h} className="py-2 pr-3">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r: any) => (
                <tr key={r.phone} onClick={() => setPhone(r.phone)} className="cursor-pointer border-t border-border hover:bg-accent/40">
                  <td className="py-2 pr-3 font-medium">{r.name || "Sem nome"}</td>
                  <td className="py-2 pr-3">{r.phone}</td>
                  <td className="py-2 pr-3">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-16 overflow-hidden rounded-full bg-muted">
                        <div className={`h-full ${levelTone(r.score)}`} style={{ width: `${r.score}%` }} />
                      </div>
                      {r.score}
                    </div>
                  </td>
                  <td className="py-2 pr-3">{r.level}</td>
                  <td className="py-2 pr-3">{r.intent}</td>
                  <td className="py-2 pr-3">{r.trend}</td>
                  <td className="py-2 pr-3">{r.hot ? "🔥" : "—"}</td>
                  <td className="py-2 pr-3">{new Date(r.analyzed_at).toLocaleString("pt-BR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {!rows.length ? (
            <p className="py-3 text-sm text-muted-foreground">
              {q.isLoading ? "Carregando…" : q.isError ? "Erro ao carregar." : "Nenhum lead analisado ainda. A análise começa quando um lead mandar mensagem."}
            </p>
          ) : null}
        </section>
        {phone ? <InterestPanel phone={phone} /> : null}
      </main>
    </div>
  );
}

function Settings() {
  const qc = useQueryClient();
  const getFn = useServerFn(getInterestSettings);
  const saveFn = useServerFn(saveInterestSettings);
  const s = useQuery({ queryKey: ["interest-settings"], queryFn: () => getFn() });
  const [hot, setHot] = useState(80);
  const [win, setWin] = useState(3);
  useEffect(() => {
    if (s.data) {
      setHot(s.data.hot_threshold);
      setWin(s.data.trend_window);
    }
  }, [s.data]);
  const save = useMutation({
    mutationFn: () => saveFn({ data: { hotThreshold: hot, trendWindow: win } }),
    onSuccess: () => qc.invalidateQueries(),
  });
  return (
    <section className="flex flex-wrap items-end gap-4 rounded-xl border border-border bg-card p-5">
      <label className="text-sm">
        <div className="text-xs uppercase text-muted-foreground">Lead quente a partir de</div>
        <input type="number" min={1} max={100} value={hot} onChange={(e) => setHot(Number(e.target.value))} className="mt-1 w-24 rounded-md border border-input bg-background px-2 py-1" />
      </label>
      <label className="text-sm">
        <div className="text-xs uppercase text-muted-foreground">Análises para tendência</div>
        <input type="number" min={1} max={10} value={win} onChange={(e) => setWin(Number(e.target.value))} className="mt-1 w-24 rounded-md border border-input bg-background px-2 py-1" />
      </label>
      <button onClick={() => save.mutate()} disabled={save.isPending} className="rounded-md bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground disabled:opacity-50">
        {save.isSuccess ? "Salvo ✓" : "Salvar"}
      </button>
    </section>
  );
}
