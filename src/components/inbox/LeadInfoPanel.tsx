import { ChevronDown, X } from "lucide-react";
import { useState } from "react";

import { cn } from "@/lib/utils";
import type { Lead } from "@/lib/inbox-types";
import { Avatar, HandlerPill, ScoreBar, StatusPill, TempBadge, formatPhone, formatTime } from "./indicators";

const fmtDate = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });

export function LeadInfoPanel({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  const last = lead.messages.at(-1);
  return (
    <aside className="flex h-full flex-col bg-card">
      <div className="flex items-center justify-between border-b border-border px-4 py-3">
        <h3 className="text-sm font-semibold">Informações do lead</h3>
        <button onClick={onClose} aria-label="Fechar" className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent"><X className="h-4 w-4" /></button>
      </div>
      <div className="scrollbar-thin flex-1 overflow-y-auto">
        <div className="flex flex-col items-center gap-2 border-b border-border px-4 py-5 text-center">
          <Avatar name={lead.name} tone={lead.avatarColor} size={72} />
          <div>
            <p className="font-display text-base font-semibold">{lead.name}</p>
            <p className="text-xs text-muted-foreground">{formatPhone(lead.phone)}</p>
          </div>
          <div className="mt-1 w-full rounded-xl bg-background p-3">
            <div className="flex items-center justify-between">
              <TempBadge t={lead.temperature} size="lg" />
              <span className="font-display text-2xl font-bold tabular-nums">{lead.score}<span className="text-sm font-medium text-muted-foreground">/100</span></span>
            </div>
            <div className="mt-2"><ScoreBar score={lead.score} t={lead.temperature} /></div>
          </div>
        </div>

        <dl className="grid grid-cols-2 gap-x-3 gap-y-3 border-b border-border px-4 py-4 text-xs">
          <Field k="Status"><StatusPill s={lead.status} /></Field>
          <Field k="Atendimento"><HandlerPill h={lead.handler} name={lead.attendant} /></Field>
          <Field k="Data de entrada">{fmtDate(lead.enteredAt)}</Field>
          <Field k="Origem">{lead.origin}</Field>
          <Field k="Responsável">{lead.attendant ?? "—"}</Field>
          <Field k="Última interação">{last ? formatTime(last.at) : "—"}</Field>
          <Field k="Mensagens">{lead.messages.length}</Field>
          <Field k="Automação">{lead.automation.name ?? "Nenhuma"}</Field>
        </dl>

        <Section title="Interesse" defaultOpen>
          <Row k="Pontuação" v={`${lead.score}/100`} />
          <Row k="Temperatura" v={<TempBadge t={lead.temperature} />} />
          <p className="mt-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Motivos</p>
          <ul className="mt-1 space-y-1">
            {lead.scoreReasons.map((r) => (
              <li key={r} className="flex gap-2 text-xs"><span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-primary" />{r}</li>
            ))}
          </ul>
        </Section>
        <Section title="Automação">
          <Row k="Atual" v={lead.automation.name ?? "—"} />
          <Row k="Etapa" v={lead.automation.step ?? "—"} />
          <Row k="Última ação" v={lead.automation.lastAction ?? "—"} />
          <Row k="Próxima ação" v={lead.automation.nextAction ?? "—"} />
        </Section>
        <Section title="Histórico">
          <ol className="relative ml-1 space-y-3 border-l border-border pl-4">
            {[...lead.history].reverse().map((h, i) => (
              <li key={i} className="relative text-xs">
                <span className={cn("absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full border-2 border-card", i === 0 ? "bg-primary" : "bg-muted-foreground/40")} />
                <p className="font-medium">{h.label}</p>
                <p className="text-muted-foreground">{fmtDate(h.at)} · {new Date(h.at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}</p>
              </li>
            ))}
          </ol>
        </Section>
      </div>
    </aside>
  );
}

function Field({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="mb-1 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{k}</dt>
      <dd className="font-medium">{children}</dd>
    </div>
  );
}

function Row({ k, v }: { k: string; v: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1 text-xs">
      <span className="text-muted-foreground">{k}</span>
      <span className="text-right font-medium">{v}</span>
    </div>
  );
}

function Section({ title, children, defaultOpen }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(!!defaultOpen);
  return (
    <div className="border-b border-border">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center justify-between px-4 py-3 text-xs font-semibold uppercase tracking-wider hover:bg-accent">
        {title}
        <ChevronDown className={cn("h-4 w-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open && <div className="animate-msg-in px-4 pb-4">{children}</div>}
    </div>
  );
}
