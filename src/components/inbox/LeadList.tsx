import { Bot, CheckCheck, Search, SlidersHorizontal } from "lucide-react";
import { useMemo, useState } from "react";

import { cn } from "@/lib/utils";
import type { ConversationStatus, Handler, Lead, Temperature } from "@/lib/inbox-types";
import { Avatar, HandlerPill, TempDot, formatTime } from "./indicators";

type Filters = {
  unread: boolean;
  status: ConversationStatus | null;
  temp: Temperature | null;
  handler: Handler | null;
  attendant: string | null;
};

const chip = (active: boolean) =>
  cn(
    "shrink-0 rounded-full border px-3 py-1 text-xs font-medium transition-colors",
    active ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card text-muted-foreground hover:border-foreground/30 hover:text-foreground",
  );

export function LeadList({ leads, selected, flashing, onSelect }: { leads: Lead[]; selected: string | null; flashing: Set<string>; onSelect: (phone: string) => void }) {
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [f, setF] = useState<Filters>({ unread: false, status: null, temp: null, handler: null, attendant: null });
  const attendants = useMemo(() => [...new Set(leads.map((l) => l.attendant).filter(Boolean))] as string[], [leads]);
  const toggle = <K extends keyof Filters>(k: K, v: Filters[K]) => setF((p) => ({ ...p, [k]: p[k] === v ? (typeof v === "boolean" ? false : null) : v }));

  const list = leads
    .filter((l) => {
      const s = q.trim().toLowerCase();
      if (s && !l.name.toLowerCase().includes(s) && !l.phone.includes(s)) return false;
      if (f.unread && l.unread === 0) return false;
      if (f.status && l.status !== f.status) return false;
      if (f.temp && l.temperature !== f.temp) return false;
      if (f.handler && l.handler !== f.handler) return false;
      if (f.attendant && l.attendant !== f.attendant) return false;
      return true;
    })
    .sort((a, b) => +new Date(b.messages.at(-1)?.at ?? 0) - +new Date(a.messages.at(-1)?.at ?? 0));

  const activeCount = [f.status, f.temp, f.handler, f.attendant].filter(Boolean).length;
  const totalUnread = leads.reduce((n, l) => n + l.unread, 0);

  return (
    <div className="flex h-full flex-col bg-card">
      <div className="space-y-3 border-b border-border px-4 pb-3 pt-4">
        <div className="flex items-center justify-between">
          <h1 className="text-lg font-semibold tracking-tight">Conversas</h1>
          {totalUnread > 0 && <span className="rounded-full bg-primary px-2 py-0.5 text-[11px] font-bold text-primary-foreground">{totalUnread} novas</span>}
        </div>
        <div className="flex gap-2">
          <label className="flex flex-1 items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm focus-within:ring-2 focus-within:ring-ring">
            <Search className="h-4 w-4 text-muted-foreground" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar nome ou número" className="w-full bg-transparent outline-none placeholder:text-muted-foreground" />
          </label>
          <button onClick={() => setOpen((o) => !o)} aria-label="Filtros" className={cn("relative flex h-9 w-9 items-center justify-center rounded-lg border transition-colors", open ? "border-primary text-primary" : "border-border text-muted-foreground hover:text-foreground")}>
            <SlidersHorizontal className="h-4 w-4" />
            {activeCount > 0 && <span className="absolute -right-1 -top-1 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-[9px] font-bold text-primary-foreground">{activeCount}</span>}
          </button>
        </div>
        <div className="scrollbar-thin flex gap-1.5 overflow-x-auto pb-0.5">
          <button className={chip(!f.unread && activeCount === 0)} onClick={() => setF({ unread: false, status: null, temp: null, handler: null, attendant: null })}>Todas</button>
          <button className={chip(f.unread)} onClick={() => toggle("unread", true)}>Não lidas</button>
          <button className={chip(f.temp === "QUENTE")} onClick={() => toggle("temp", "QUENTE")}>🔥 Quentes</button>
          <button className={chip(f.handler === "HUMANO")} onClick={() => toggle("handler", "HUMANO")}>👤 Humano</button>
        </div>
        {open && (
          <div className="animate-msg-in space-y-2.5 rounded-xl border border-border bg-background p-3">
            <FilterRow label="Status">
              {(["ONLINE", "AGUARDANDO", "ENCERRADO"] as const).map((s) => (
                <button key={s} className={chip(f.status === s)} onClick={() => toggle("status", s)}>{s === "ONLINE" ? "🟢 Online" : s === "AGUARDANDO" ? "🟡 Aguardando" : "🔴 Encerrado"}</button>
              ))}
            </FilterRow>
            <FilterRow label="Temperatura">
              {(["QUENTE", "MORNO", "FRIO"] as const).map((t) => (
                <button key={t} className={chip(f.temp === t)} onClick={() => toggle("temp", t)}>{t === "QUENTE" ? "🔴 Quente" : t === "MORNO" ? "🟠 Morno" : "🔵 Frio"}</button>
              ))}
            </FilterRow>
            <FilterRow label="Automação">
              <button className={chip(f.handler === "AUTOMACAO")} onClick={() => toggle("handler", "AUTOMACAO")}>🤖 Automação ativa</button>
              <button className={chip(f.handler === "HUMANO")} onClick={() => toggle("handler", "HUMANO")}>👤 Atendimento humano</button>
            </FilterRow>
            {attendants.length > 0 && (
              <FilterRow label="Atendente">
                {attendants.map((a) => (
                  <button key={a} className={chip(f.attendant === a)} onClick={() => toggle("attendant", a)}>{a}</button>
                ))}
              </FilterRow>
            )}
          </div>
        )}
      </div>

      <ul className="scrollbar-thin flex-1 overflow-y-auto">
        {list.length === 0 && <li className="p-8 text-center text-sm text-muted-foreground">Nenhuma conversa encontrada.</li>}
        {list.map((l) => {
          const last = l.messages.at(-1);
          const active = l.phone === selected;
          return (
            <li key={l.phone}>
              <button
                onClick={() => onSelect(l.phone)}
                className={cn(
                  "relative flex w-full items-center gap-3 px-4 py-3 text-left transition-colors",
                  active ? "bg-primary-soft" : "hover:bg-accent",
                  flashing.has(l.phone) && "animate-lead-flash",
                )}
              >
                {active && <span className="absolute inset-y-2 left-0 w-1 rounded-r-full bg-primary" />}
                <Avatar name={l.name} tone={l.avatarColor} handler={l.handler} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className={cn("truncate text-sm", l.unread ? "font-bold" : "font-semibold")}>{l.name}</span>
                    <TempDot t={l.temperature} />
                    <span className={cn("ml-auto shrink-0 text-[11px] tabular-nums", l.unread ? "font-semibold text-primary" : "text-muted-foreground")}>
                      {last ? formatTime(last.at) : ""}
                    </span>
                  </div>
                  <div className="mt-0.5 flex items-center gap-2">
                    <p className={cn("truncate text-[13px]", l.unread ? "text-foreground" : "text-muted-foreground")}>
                      {l.typing ? (
                        <span className="font-medium text-online">digitando…</span>
                      ) : (
                        <>
                          {last?.direction === "OUT" && <CheckCheck className={cn("mr-1 inline h-3.5 w-3.5", last.status === "READ" ? "text-cold" : "text-muted-foreground")} />}
                          {last?.content}
                        </>
                      )}
                    </p>
                    {l.unread > 0 && (
                      <span key={l.unread} className="animate-pop ml-auto flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-primary px-1.5 text-[10px] font-bold text-primary-foreground">
                        {l.unread}
                      </span>
                    )}
                  </div>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <HandlerPill h={l.handler} name={l.attendant} />
                    {l.status === "AGUARDANDO" && <span className="text-[10px] font-medium text-warm">● Aguardando</span>}
                    {l.status === "ENCERRADO" && <span className="text-[10px] font-medium text-muted-foreground">Encerrado</span>}
                    {l.handler === "AUTOMACAO" && l.status !== "ENCERRADO" && <Bot className="ml-auto h-3 w-3 text-bot" />}
                  </div>
                </div>
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function FilterRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}
