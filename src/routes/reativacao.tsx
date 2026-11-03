import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";

import { Nav } from "@/components/Nav";
import { supabase } from "@/integrations/supabase/client";
import { decisionLabels } from "@/lib/reactivation";
import {
  controlReactivation, createReactivation, getReactivation, reviewReactivation, tickReactivation,
} from "@/lib/reactivation.functions";

export const Route = createFileRoute("/reativacao")({
  head: () => ({
    meta: [
      { title: "Reativação de leads · Gaviões 24h" },
      { name: "description", content: "Analise conversas antigas, revise e autorize mensagens de reativação." },
      { property: "og:title", content: "Reativação de leads · Gaviões 24h" },
      { property: "og:description", content: "Reativação contextual com revisão do consultor antes do envio." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

const STATUS: Record<string, string> = {
  ANALYZING: "Analisando conversas", READY: "Pronta para revisão", SENDING: "Enviando",
  COMPLETED: "Concluída", PAUSED: "Pausada", CANCELLED: "Cancelada",
};

function Page() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSignedIn(!!s));
    return () => data.subscription.unsubscribe();
  }, []);
  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <main className="mx-auto max-w-5xl space-y-6 px-5 py-6">
        <h1 className="text-2xl font-semibold">Reativação de leads</h1>
        {signedIn === false ? <p className="text-muted-foreground">Entre como atendente para usar a reativação.</p> : signedIn ? <Body /> : null}
      </main>
    </div>
  );
}

function Body() {
  const qc = useQueryClient();
  const [id, setId] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const q = useQuery({ queryKey: ["reactivation", id], queryFn: () => getReactivation({ data: { id } }), refetchInterval: 5000 });
  const camp = q.data?.campaigns.find((c) => c.id === q.data?.current) ?? null;
  const active = camp && ["ANALYZING", "SENDING"].includes(camp.status);
  useEffect(() => {
    if (!active) return;
    const t = setInterval(() => tickReactivation().then(() => qc.invalidateQueries({ queryKey: ["reactivation"] })).catch(() => {}), 6000);
    return () => clearInterval(t);
  }, [active, qc]);
  const refresh = () => qc.invalidateQueries({ queryKey: ["reactivation"] });
  const onErr = (e: Error) => setMsg(e.message);

  const [date, setDate] = useState(() => new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10));
  const [interval, setInterval_] = useState(30);
  const create = useMutation({
    mutationFn: () => createReactivation({ data: { date, interval } }),
    onSuccess: (r) => { setId(r.id); setMsg("Análise iniciada. Nada será enviado sem sua autorização."); refresh(); }, onError: onErr,
  });
  const control = useMutation({
    mutationFn: (action: "SEND" | "PAUSE" | "RESUME" | "CANCEL") => controlReactivation({ data: { id: camp!.id, action } }),
    onSuccess: (r) => { setMsg(r.ok ? "Feito." : "Ação não permitida neste momento."); refresh(); }, onError: onErr,
  });

  const items = q.data?.items ?? [];
  const count = (d: string) => items.filter((i) => i.decision === d).length;
  const queued = items.filter((i) => i.decision === "REACTIVATE").length;
  const sent = items.filter((i) => i.status === "SENT").length;

  return (
    <>
      <section className="space-y-3 rounded-lg border border-border bg-card p-4">
        <h2 className="font-medium">Nova análise</h2>
        <p className="text-sm text-muted-foreground">Seleciona contatos cuja última conversa foi até a data escolhida, lê o histórico completo e sugere quem reativar. Contatos convertidos, que pediram para parar, em atendimento ou em automação são protegidos.</p>
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-sm">Conversas até<input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="ml-2 rounded-md border border-input bg-background px-2 py-1" /></label>
          <label className="text-sm">Intervalo entre envios (s)<input type="number" min={5} max={3600} value={interval} onChange={(e) => setInterval_(Number(e.target.value))} className="ml-2 w-24 rounded-md border border-input bg-background px-2 py-1" /></label>
          <button disabled={create.isPending} onClick={() => create.mutate()} className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground disabled:opacity-50">Analisar conversas</button>
        </div>
        {msg && <p className="text-sm text-primary">{msg}</p>}
      </section>

      {q.data && q.data.campaigns.length > 0 && (
        <section className="space-y-3 rounded-lg border border-border bg-card p-4">
          <div className="flex flex-wrap items-center gap-3">
            <select value={q.data.current ?? ""} onChange={(e) => setId(e.target.value)} className="rounded-md border border-input bg-background px-2 py-1 text-sm">
              {q.data.campaigns.map((c) => <option key={c.id} value={c.id}>{c.reference_date} · {STATUS[c.status] ?? c.status}</option>)}
            </select>
            {camp?.pause_reason && <span className="text-sm text-destructive">{camp.pause_reason}</span>}
            <div className="ml-auto flex gap-2">
              {camp?.status === "READY" && queued > 0 && (
                <button onClick={() => confirm(`Enviar ${queued} mensagem(ns) aprovada(s) pelo WhatsApp?`) && control.mutate("SEND")} className="rounded-md bg-primary px-3 py-1.5 text-sm text-primary-foreground">Autorizar envio ({queued})</button>
              )}
              {camp && ["ANALYZING", "SENDING"].includes(camp.status) && <button onClick={() => control.mutate("PAUSE")} className="rounded-md border border-input px-3 py-1.5 text-sm">Pausar</button>}
              {camp?.status === "PAUSED" && <button onClick={() => control.mutate("RESUME")} className="rounded-md border border-input px-3 py-1.5 text-sm">Retomar</button>}
              {camp && !["COMPLETED", "CANCELLED"].includes(camp.status) && <button onClick={() => confirm("Cancelar esta campanha?") && control.mutate("CANCEL")} className="rounded-md border border-input px-3 py-1.5 text-sm text-destructive">Cancelar</button>}
            </div>
          </div>
          <div className="flex flex-wrap gap-2 text-xs">
            {["PENDING", "REACTIVATE", "REVIEW", "DO_NOT_SEND", "CONVERTED", "OPT_OUT", "BLOCKED"].map((d) => (
              <span key={d} className="rounded-full bg-muted px-2.5 py-1">{decisionLabels[d]}: {count(d)}</span>
            ))}
            <span className="rounded-full bg-primary/15 px-2.5 py-1 text-primary">Enviadas: {sent}</span>
          </div>
          <ul className="divide-y divide-border">
            {items.map((i) => <Item key={i.id} item={i} canReview={camp?.status === "READY"} onDone={refresh} onErr={onErr} />)}
          </ul>
        </section>
      )}
    </>
  );
}

function Item({ item, canReview, onDone, onErr }: { item: any; canReview: boolean; onDone: () => void; onErr: (e: Error) => void }) {
  const [text, setText] = useState<string>(item.message ?? "");
  const review = useMutation({
    mutationFn: (send: boolean) => reviewReactivation({ data: { item: item.id, send, message: text } }),
    onSuccess: onDone, onError: onErr,
  });
  const evidence: string[] = Array.isArray(item.evidence) ? item.evidence : [];
  return (
    <li className="space-y-1 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium">{item.name || item.phone}</span>
        <span className="text-xs text-muted-foreground">{item.phone}</span>
        <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{decisionLabels[item.decision] ?? item.decision}</span>
        {item.confidence != null && <span className="text-xs text-muted-foreground">{item.confidence}%</span>}
        {item.status === "SENT" && <span className="rounded-full bg-primary/15 px-2 py-0.5 text-xs text-primary">Enviada</span>}
        {["FAILED", "UNKNOWN"].includes(item.status) && <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-xs text-destructive">{item.error ?? "Falhou"}</span>}
      </div>
      {item.reason && <p className="text-muted-foreground">{item.stage ? `${item.stage} · ` : ""}{item.reason}</p>}
      {evidence.map((e, k) => <p key={k} className="border-l-2 border-border pl-2 text-xs italic">“{e}”</p>)}
      {item.decision === "REVIEW" && canReview ? (
        <div className="space-y-2">
          <textarea value={text} onChange={(e) => setText(e.target.value)} rows={2} placeholder="Mensagem a enviar" className="w-full rounded-md border border-input bg-background p-2" />
          <div className="flex gap-2">
            <button disabled={review.isPending} onClick={() => review.mutate(true)} className="rounded-md bg-primary px-3 py-1 text-xs text-primary-foreground">Aprovar</button>
            <button disabled={review.isPending} onClick={() => review.mutate(false)} className="rounded-md border border-input px-3 py-1 text-xs">Não enviar</button>
          </div>
        </div>
      ) : item.message ? <p className="rounded-md bg-muted p-2">{item.message}</p> : null}
    </li>
  );
}
