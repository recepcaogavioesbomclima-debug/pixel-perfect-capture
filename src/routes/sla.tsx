import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";

import { Nav } from "@/components/Nav";
import { supabase } from "@/integrations/supabase/client";
import { DEFAULT_SLA, alertLevel, complianceRate, elapsedSeconds, fmtDuration, type SlaSettings } from "@/lib/sla";
import { closeSlaCycle, getSlaDashboard, saveSlaSettings } from "@/lib/sla.functions";

export const Route = createFileRoute("/sla")({
  head: () => ({
    meta: [
      { title: "Prazos de Atendimento (SLA) · Gaviões 24h" },
      { name: "description", content: "Acompanhe em tempo real quanto cada lead espera por uma resposta humana." },
      { property: "og:title", content: "Prazos de Atendimento (SLA) · Gaviões 24h" },
      { property: "og:description", content: "Esperas abertas, atrasos e cumprimento de prazo por atendente." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: SlaPage,
});

const LEVEL = [
  { label: "No prazo", cls: "bg-primary/15 text-primary" },
  { label: "Atenção", cls: "bg-chart-4/15 text-chart-4" },
  { label: "Atrasado", cls: "bg-destructive/15 text-destructive" },
  { label: "Crítico", cls: "bg-destructive text-destructive-foreground" },
];
const FINAL: Record<string, string> = { ON_TIME: "No prazo", LATE: "Atrasado", CRITICAL: "Crítico", CLOSED: "Encerrado" };
const DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

function SlaPage() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSignedIn(!!s));
    return () => data.subscription.unsubscribe();
  }, []);
  return (
    <div className="min-h-dvh bg-background">
      <Nav />
      <main className="mx-auto max-w-5xl space-y-6 px-5 py-6">
        <h1 className="text-2xl font-semibold">Prazos de atendimento</h1>
        {signedIn === false && <p className="text-sm text-muted-foreground">Entre como atendente para ver os prazos.</p>}
        {signedIn && <Dashboard />}
      </main>
    </div>
  );
}

function Dashboard() {
  const qc = useQueryClient();
  const [days, setDays] = useState(7);
  const fetchFn = useServerFn(getSlaDashboard);
  const closeFn = useServerFn(closeSlaCycle);
  const [tick, setTick] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setTick(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const { data, error } = useQuery({ queryKey: ["sla", days], queryFn: () => fetchFn({ data: { days } }), refetchInterval: 15000 });
  if (error) return <p className="text-sm text-destructive">{(error as Error).message}</p>;
  if (!data) return <p className="text-sm text-muted-foreground">Carregando…</p>;
  const s: SlaSettings = { ...DEFAULT_SLA, ...(data.settings ?? {}), critical_mult: Number(data.settings?.critical_mult ?? 2) };
  const open = data.cycles.filter((c: any) => c.status === "OPEN");
  const done = data.cycles.filter((c: any) => c.status !== "OPEN");
  const rate = complianceRate(done);
  const waits = done.map((c: any) => c.wait_s).filter((w: any) => w != null);
  const avg = waits.length ? Math.round(waits.reduce((a: number, b: number) => a + b, 0) / waits.length) : null;
  const byAtt: Record<string, { total: number; ok: number; sum: number }> = {};
  for (const c of done) {
    if (!c.human_reply_by) continue;
    const a = (byAtt[c.human_reply_by] ??= { total: 0, ok: 0, sum: 0 });
    a.total++;
    a.sum += c.wait_s ?? 0;
    if (c.final_status === "ON_TIME") a.ok++;
  }
  const name = (p: string) => data.names[p] ?? p;

  return (
    <>
      <div className="flex gap-2">
        {[1, 7, 30].map((d) => (
          <button key={d} onClick={() => setDays(d)} className={`rounded-md border px-3 py-1 text-sm ${d === days ? "border-primary text-primary" : "border-input"}`}>
            {d === 1 ? "Hoje" : `${d} dias`}
          </button>
        ))}
      </div>
      <div className="grid gap-3 sm:grid-cols-4">
        <Card label="Esperando agora" value={String(open.length)} />
        <Card label="Cumprimento do prazo" value={rate == null ? "—" : `${rate}%`} hint={`meta ${s.target_pct}%`} bad={rate != null && rate < s.target_pct} />
        <Card label="Tempo médio de resposta" value={fmtDuration(avg)} />
        <Card label="Atendidos fora do prazo" value={String(done.filter((c: any) => c.final_status === "LATE" || c.final_status === "CRITICAL").length)} />
      </div>

      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-3 font-semibold">Esperando resposta</h2>
        {!open.length && <p className="text-sm text-muted-foreground">Ninguém esperando. 🎉</p>}
        <ul className="divide-y divide-border">
          {open
            .map((c: any) => ({ c, e: elapsedSeconds(s, new Date(c.started_at), new Date(tick)) }))
            .sort((a: any, b: any) => b.e / b.c.deadline_s - a.e / a.c.deadline_s)
            .map(({ c, e }: any) => {
              const lvl = alertLevel(s, e, c.deadline_s);
              return (
                <li key={c.id} className="flex flex-wrap items-center gap-3 py-2 text-sm">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${LEVEL[lvl].cls}`}>{LEVEL[lvl].label}</span>
                  <span className="font-medium">{name(c.phone)}</span>
                  <span className="text-muted-foreground">{c.priority ? "🔥 prioridade" : c.kind === "FIRST" ? "1º contato" : "em andamento"} · {c.in_count} msg</span>
                  <span className="ml-auto tabular-nums">{fmtDuration(e)} / {fmtDuration(c.deadline_s)}</span>
                  <button
                    onClick={async () => { await closeFn({ data: { phone: c.phone, reason: "Encerrado pelo atendente" } }); qc.invalidateQueries({ queryKey: ["sla"] }); }}
                    className="rounded-md border border-input px-2 py-0.5 text-xs hover:bg-accent"
                  >
                    Encerrar
                  </button>
                </li>
              );
            })}
        </ul>
      </section>

      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-3 font-semibold">Por atendente</h2>
        {!Object.keys(byAtt).length && <p className="text-sm text-muted-foreground">Sem respostas no período.</p>}
        <table className="w-full text-sm">
          <tbody>
            {Object.entries(byAtt).map(([n, a]) => (
              <tr key={n} className="border-t border-border">
                <td className="py-1.5">{n}</td>
                <td>{a.total} respostas</td>
                <td>{Math.round((a.ok / a.total) * 100)}% no prazo</td>
                <td>média {fmtDuration(Math.round(a.sum / a.total))}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="rounded-xl border border-border bg-card p-4">
        <h2 className="mb-3 font-semibold">Histórico</h2>
        <ul className="divide-y divide-border text-sm">
          {done.slice(0, 30).map((c: any) => (
            <li key={c.id} className="flex flex-wrap gap-3 py-1.5">
              <span className="w-24 text-muted-foreground">{new Date(c.started_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}</span>
              <span className="font-medium">{name(c.phone)}</span>
              <span>{FINAL[c.final_status] ?? c.final_status}</span>
              <span className="ml-auto text-muted-foreground">{fmtDuration(c.wait_s)} {c.human_reply_by ? `· ${c.human_reply_by}` : c.close_reason ? `· ${c.close_reason}` : ""}</span>
            </li>
          ))}
        </ul>
      </section>

      <SettingsForm initial={s} />
    </>
  );
}

function Card({ label, value, hint, bad }: { label: string; value: string; hint?: string; bad?: boolean }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`mt-1 text-2xl font-semibold ${bad ? "text-destructive" : ""}`}>{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

function SettingsForm({ initial }: { initial: SlaSettings }) {
  const qc = useQueryClient();
  const saveFn = useServerFn(saveSlaSettings);
  const [f, setF] = useState(initial);
  const [msg, setMsg] = useState<string | null>(null);
  const num = (k: keyof SlaSettings, label: string, mult = 1) => (
    <label className="text-sm">
      {label}
      <input type="number" className="mt-1 w-full rounded-md border border-input bg-background px-2 py-1" value={(f[k] as number) / mult}
        onChange={(e) => setF({ ...f, [k]: Number(e.target.value) * mult })} />
    </label>
  );
  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <h2 className="mb-3 font-semibold">Configurar prazos</h2>
      <div className="grid gap-3 sm:grid-cols-3">
        {num("first_response_s", "1º contato (minutos)", 60)}
        {num("ongoing_s", "Conversa em andamento (minutos)", 60)}
        {num("priority_s", "Lead quente (minutos)", 60)}
        {num("warn_pct", "Avisar ao atingir (% do prazo)")}
        {num("critical_mult", "Crítico a partir de (x o prazo)")}
        {num("target_pct", "Meta de cumprimento (%)")}
      </div>
      <label className="mt-3 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={f.continuous} onChange={(e) => setF({ ...f, continuous: e.target.checked })} />
        Contar 24h (desmarque para contar só no horário de atendimento)
      </label>
      {!f.continuous && (
        <div className="mt-2 grid gap-3 sm:grid-cols-3">
          {num("biz_start_hour", "Início (hora)")}
          {num("biz_end_hour", "Fim (hora)")}
          <div className="flex flex-wrap items-end gap-1 text-sm">
            {DAYS.map((d, i) => (
              <button key={d} type="button" onClick={() => setF({ ...f, biz_days: f.biz_days.includes(i) ? f.biz_days.filter((x) => x !== i) : [...f.biz_days, i].sort() })}
                className={`rounded px-2 py-1 ${f.biz_days.includes(i) ? "bg-primary text-primary-foreground" : "border border-input"}`}>{d}</button>
            ))}
          </div>
        </div>
      )}
      <label className="mt-2 flex items-center gap-2 text-sm">
        <input type="checkbox" checked={f.alerts_enabled} onChange={(e) => setF({ ...f, alerts_enabled: e.target.checked })} />
        Registrar alertas de atraso
      </label>
      <div className="mt-3 flex items-center gap-3">
        <button
          onClick={async () => {
            try {
              const { tz_offset_minutes: _t, ...rest } = f;
              await saveFn({ data: rest });
              setMsg("Prazos salvos.");
              qc.invalidateQueries({ queryKey: ["sla"] });
            } catch (e) {
              setMsg((e as Error).message);
            }
          }}
          className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
        >
          Salvar
        </button>
        {msg && <span className="text-sm text-muted-foreground">{msg}</span>}
      </div>
    </section>
  );
}
