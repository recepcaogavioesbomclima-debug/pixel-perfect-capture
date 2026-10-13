import { useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { MessageSquareText } from "lucide-react";
import { useEffect, useState } from "react";

import { ChatPanel } from "@/components/inbox/ChatPanel";
import { LeadInfoPanel } from "@/components/inbox/LeadInfoPanel";
import { LeadList } from "@/components/inbox/LeadList";
import { supabase } from "@/integrations/supabase/client";
import { claimConversation } from "@/lib/handoff.functions";
import { listInbox, sendInboxMessage } from "@/lib/inbox.functions";
import type { Lead } from "@/lib/inbox-types";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/atendimento")({
  head: () => ({
    meta: [
      { title: "Central de Atendimento — Gaviões 24h" },
      { name: "description", content: "Atenda leads do WhatsApp com temperatura, pontuação de interesse e automação em uma só tela." },
      { property: "og:title", content: "Central de Atendimento — Gaviões 24h" },
      { property: "og:description", content: "Conversas reais, temperatura e automação dos leads em uma só tela." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Atendimento,
});

function Atendimento() {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSignedIn(!!s));
    return () => data.subscription.unsubscribe();
  }, []);
  if (signedIn === null) return null;
  return <Inbox signedIn={signedIn} />;
}

function LoginInline() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState<string | null>(null);
  return (
    <form
      className="mt-2 flex w-full max-w-xs flex-col gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        setErr(error ? "E-mail ou senha incorretos." : null);
      }}
    >
      <input className="rounded-md border border-border bg-card px-3 py-2 text-sm" placeholder="E-mail" type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      <input className="rounded-md border border-border bg-card px-3 py-2 text-sm" placeholder="Senha" type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      <button className="rounded-md bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Acessar conversas</button>
      {err && <p className="text-xs text-destructive">{err}</p>}
    </form>
  );
}

function Inbox({ signedIn }: { signedIn: boolean }) {
  const qc = useQueryClient();
  const fetchInbox = useServerFn(listInbox);
  const sendFn = useServerFn(sendInboxMessage);
  const claimFn = useServerFn(claimConversation);
  const { data: leads = [], error } = useQuery({ queryKey: ["inbox"], queryFn: () => fetchInbox(), refetchInterval: 5000, enabled: signedIn });
  useEffect(() => {
    if (!signedIn) return;
    const ch = supabase
      .channel("inbox-live")
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "inbound_alerts" }, () => qc.invalidateQueries({ queryKey: ["inbox"] }))
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [signedIn, qc]);
  const [read, setRead] = useState<Record<string, number>>({});
  const [selected, setSelected] = useState<string | null>(null);
  const [infoOpen, setInfoOpen] = useState(true);
  const [flashing] = useState<Set<string>>(new Set());
  const [notice, setNotice] = useState<string | null>(null);
  const view = leads.map((l) => (read[l.phone] !== undefined && l.messages.length <= read[l.phone] ? { ...l, unread: 0 } : l));
  const lead = view.find((l) => l.phone === selected) ?? null;
  const select = (phone: string) => {
    setSelected(phone);
    setRead((r) => ({ ...r, [phone]: leads.find((l) => l.phone === phone)?.messages.length ?? 0 }));
  };

  const patch = (phone: string, fn: (l: Lead) => Lead) =>
    qc.setQueryData<Lead[]>(["inbox"], (ls) => (ls ?? []).map((l) => (l.phone === phone ? fn(l) : l)));

  const send = async (text: string) => {
    if (!lead) return;
    const key = crypto.randomUUID();
    patch(lead.phone, (l) => ({
      ...l,
      messages: [...l.messages, { id: key, direction: "OUT", content: text, at: new Date().toISOString(), status: "PENDING", author: "Você" }],
    }));
    const r = await sendFn({ data: { phone: lead.phone, content: text, key } });
    if (!r.ok) setNotice(`Não foi possível enviar: ${r.error}`);
    qc.invalidateQueries({ queryKey: ["inbox"] });
  };

  const claim = async () => {
    if (!lead) return;
    const r = await claimFn({ data: { phone: lead.phone } });
    setNotice(r.ok ? "Você assumiu o atendimento." : `Conversa já está com ${r.assignedName ?? "outro atendente"}.`);
    qc.invalidateQueries({ queryKey: ["inbox"] });
  };

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-background">
      {(notice || error) && (
        <button onClick={() => setNotice(null)} className="bg-primary-soft px-4 py-2 text-left text-sm text-foreground">
          {notice ?? String((error as Error).message)}
        </button>
      )}
      <div className="flex min-h-0 flex-1">
        <div className={cn("h-full w-full shrink-0 border-r border-border md:w-[340px] lg:w-[380px]", lead && "hidden md:block")}>
          <LeadList leads={view} selected={selected} flashing={flashing} onSelect={select} />
        </div>
        <main className={cn("h-full min-w-0 flex-1", !lead && "hidden md:block")}>
          {lead ? (
            <ChatPanel lead={lead} onBack={() => setSelected(null)} onInfo={() => setInfoOpen((o) => !o)} infoOpen={infoOpen} onSend={send} onClaim={claim} />
          ) : (
            <div className="chat-bg flex h-full flex-col items-center justify-center gap-3 p-8 text-center">
              <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-send">
                <MessageSquareText className="h-8 w-8" />
              </div>
              <h2 className="text-xl font-semibold">Central de Atendimento</h2>
              <p className="max-w-sm text-sm text-muted-foreground">
                {!signedIn
                  ? "Acesse com sua conta de atendente para carregar as conversas reais."
                  : leads.length
                    ? "Selecione uma conversa para ver as mensagens, a temperatura e quem está atendendo o lead."
                    : "Nenhuma conversa ainda. Conecte o WhatsApp para começar a receber mensagens."}
              </p>
              {!signedIn && <LoginInline />}
            </div>
          )}
        </main>
        {lead && infoOpen && (
          <div className="fixed inset-0 z-30 animate-msg-in xl:static xl:z-auto xl:h-full xl:w-[340px] xl:shrink-0 xl:border-l xl:border-border">
            <div className="absolute inset-0 bg-secondary/40 xl:hidden" onClick={() => setInfoOpen(false)} />
            <div className="absolute inset-y-0 right-0 w-full max-w-sm shadow-soft xl:static xl:max-w-none xl:shadow-none">
              <LeadInfoPanel lead={lead} onClose={() => setInfoOpen(false)} />
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
