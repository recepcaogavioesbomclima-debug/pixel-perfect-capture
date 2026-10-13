import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";

import { getLeadInterest } from "@/lib/interest.functions";

const fmt = (v: string | null) => (v ? new Date(v).toLocaleString("pt-BR") : "—");
const TREND: Record<string, string> = { AUMENTANDO: "↑ AUMENTANDO", ESTAVEL: "→ ESTÁVEL", DIMINUINDO: "↓ DIMINUINDO" };

export function levelTone(score: number) {
  if (score > 80) return "bg-primary";
  if (score > 60) return "bg-chart-2";
  if (score > 40) return "bg-chart-4";
  if (score > 20) return "bg-chart-5";
  return "bg-muted-foreground";
}

export function InterestPanel({ phone }: { phone: string }) {
  const fn = useServerFn(getLeadInterest);
  const q = useQuery({ queryKey: ["lead-interest", phone], queryFn: () => fn({ data: { phone } }), refetchInterval: 10000 });

  const Field = ({ k, v }: { k: string; v: React.ReactNode }) => (
    <div>
      <div className="text-xs uppercase text-muted-foreground">{k}</div>
      <div className="text-sm font-medium">{v}</div>
    </div>
  );

  let body: React.ReactNode;
  if (q.isLoading) body = <p className="text-sm text-muted-foreground">Carregando análise…</p>;
  else if (q.isError) body = <p className="text-sm text-destructive">Não foi possível carregar a análise.</p>;
  else if (!q.data?.current?.analyzed_at)
    body = <p className="text-sm text-muted-foreground">Ainda não há análise para este lead. Ela aparece após a próxima mensagem dele.</p>;
  else {
    const c = q.data.current;
    body = (
      <>
        <div className="mb-4">
          <div className="mb-1 flex items-baseline justify-between">
            <span className="text-2xl font-semibold">{c.score}/100</span>
            <span className="text-sm text-muted-foreground">{c.level}</span>
          </div>
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-muted">
            <div className={`h-full ${levelTone(c.score)}`} style={{ width: `${c.score}%` }} />
          </div>
        </div>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field k="Nível" v={c.level} />
          <Field k="Intenção" v={c.intent} />
          <Field k="Tendência" v={TREND[c.trend] ?? c.trend} />
          <Field k="Objeção" v={c.objection ?? "NENHUMA"} />
          <Field k="Lead quente" v={c.hot ? "🔥 SIM" : "NÃO"} />
          <Field k="Última análise" v={fmt(c.analyzed_at)} />
        </div>
        {c.last_error ? <p className="mt-3 text-xs text-destructive">Última tentativa falhou ({c.last_error}); mantido o último score válido.</p> : null}
        <h3 className="mb-2 mt-5 text-sm font-semibold">Motivos da pontuação</h3>
        <ul className="space-y-1.5 text-sm">
          {(c.reasons ?? []).map((r: any, i: number) => (
            <li key={i}>
              • {r.text}
              {r.evidence ? <span className="text-muted-foreground"> — “{r.evidence}”</span> : null}
            </li>
          ))}
        </ul>
        <h3 className="mb-2 mt-5 text-sm font-semibold">Histórico de evolução</h3>
        <ol className="space-y-2 border-l border-border pl-4 text-sm">
          {q.data.history.map((h: any) => (
            <li key={h.id} className="relative">
              <span className={`absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full ${levelTone(h.score)}`} />
              <span className="text-muted-foreground">{fmt(h.created_at)}</span> · <b>{h.score}</b> {h.level} · {h.intent}
              {h.objection ? ` · objeção ${h.objection}` : ""}
              {h.reason ? <div className="text-muted-foreground">{h.reason}</div> : null}
            </li>
          ))}
        </ol>
      </>
    );
  }

  return (
    <section className="rounded-xl border border-border bg-card p-5">
      <h2 className="mb-4 text-base font-semibold">Análise de Interesse</h2>
      {body}
    </section>
  );
}
