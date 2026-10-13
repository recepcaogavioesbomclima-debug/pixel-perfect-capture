import { ArrowLeft, Bot, Check, CheckCheck, Clock, Info, Paperclip, Send, Smile, UserCheck, Zap } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import { cn } from "@/lib/utils";
import type { ChatMessage, Lead } from "@/lib/inbox-types";
import { Avatar, HandlerPill, StatusPill, TempBadge, formatPhone } from "./indicators";

const quickReplies = ["Olá! Como posso ajudar? 😊", "Nosso plano mensal é R$ 99,90", "Funcionamos 24h, todos os dias 🦅", "Quer agendar uma aula experimental grátis?"];
const emojis = ["😊", "👍", "💪", "🦅", "🔥", "🙏", "✅", "📍"];

function Ticks({ m }: { m: ChatMessage }) {
  if (m.status === "PENDING") return <Clock className="h-3 w-3 opacity-70" />;
  if (m.status === "SENT") return <Check className="h-3.5 w-3.5 opacity-80" />;
  if (m.status === "DELIVERED") return <CheckCheck className="h-3.5 w-3.5 opacity-80" />;
  if (m.status === "READ") return <CheckCheck className="h-3.5 w-3.5" />;
  return null;
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return "Hoje";
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return "Ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "long" });
}

export function ChatPanel({
  lead,
  onBack,
  onInfo,
  infoOpen,
  onSend,
  onClaim,
}: {
  lead: Lead;
  onBack: () => void;
  onInfo: () => void;
  infoOpen: boolean;
  onSend: (text: string) => void;
  onClaim: () => void;
}) {
  const [text, setText] = useState("");
  const [showQuick, setShowQuick] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const human = lead.handler === "HUMANO";

  useEffect(() => {
    scroller.current?.scrollTo({ top: scroller.current.scrollHeight, behavior: "smooth" });
  }, [lead.messages.length, lead.phone]);

  const send = (t = text) => {
    if (!t.trim()) return;
    onSend(t.trim());
    setText("");
    setShowQuick(false);
  };

  let lastDay = "";

  return (
    <div className="flex h-full flex-col">
      {/* Cabeçalho */}
      <header className="flex items-center gap-3 border-b border-border bg-card px-3 py-2.5 sm:px-5">
        <button onClick={onBack} className="rounded-lg p-1.5 text-muted-foreground hover:bg-accent md:hidden" aria-label="Voltar">
          <ArrowLeft className="h-5 w-5" />
        </button>
        <button onClick={onInfo} className="flex min-w-0 flex-1 items-center gap-3 text-left">
          <Avatar name={lead.name} tone={lead.avatarColor} size={42} />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="truncate text-[15px] font-semibold">{lead.name}</h2>
              <span className="hidden sm:inline"><TempBadge t={lead.temperature} score={lead.score} /></span>
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
              <span>{formatPhone(lead.phone)}</span>
              <StatusPill s={lead.status} />
              <HandlerPill h={lead.handler} name={lead.attendant} />
            </div>
          </div>
        </button>
        {!human && lead.status !== "ENCERRADO" && (
          <button onClick={onClaim} className="hidden items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-sm font-semibold text-primary-foreground shadow-send transition-transform hover:scale-[1.02] active:scale-95 sm:flex">
            <UserCheck className="h-4 w-4" /> Assumir atendimento
          </button>
        )}
        <button onClick={onInfo} aria-label="Informações do lead" className={cn("rounded-lg p-2 transition-colors", infoOpen ? "bg-primary-soft text-primary" : "text-muted-foreground hover:bg-accent")}>
          <Info className="h-5 w-5" />
        </button>
      </header>

      {!human && lead.status !== "ENCERRADO" && (
        <div className="flex items-center gap-2 border-b border-border bg-muted px-4 py-2 text-xs text-muted-foreground sm:hidden">
          <Bot className="h-3.5 w-3.5" /> Automação atendendo
          <button onClick={onClaim} className="ml-auto rounded-md bg-primary px-2.5 py-1 font-semibold text-primary-foreground">Assumir</button>
        </div>
      )}

      {/* Mensagens */}
      <div ref={scroller} className="chat-bg scrollbar-thin flex-1 space-y-1.5 overflow-y-auto px-3 py-4 sm:px-8">
        {lead.messages.map((m, i) => {
          const day = dayLabel(m.at);
          const showDay = day !== lastDay;
          lastDay = day;
          const out = m.direction === "OUT";
          const prev = lead.messages[i - 1];
          const grouped = prev && prev.direction === m.direction && !showDay;
          return (
            <div key={m.id}>
              {showDay && (
                <div className="my-3 flex justify-center">
                  <span className="rounded-full bg-card px-3 py-1 text-[11px] font-medium text-muted-foreground shadow-soft">{day}</span>
                </div>
              )}
              <div className={cn("animate-msg-in flex", out ? "justify-end" : "justify-start", !grouped && "pt-1.5")}>
                <div
                  className={cn(
                    "max-w-[82%] px-3 py-1.5 shadow-soft sm:max-w-[65%]",
                    out ? "rounded-2xl rounded-br-md bg-bubble-out text-bubble-out-foreground" : "rounded-2xl rounded-bl-md bg-bubble-in text-bubble-in-foreground",
                    m.status === "PENDING" && "opacity-75",
                  )}
                >
                  {out && !grouped && m.author && (
                    <p className="mb-0.5 flex items-center gap-1 text-[11px] font-semibold opacity-80">
                      {m.author === "Automação" ? <Bot className="h-3 w-3" /> : null}
                      {m.author}
                    </p>
                  )}
                  <p className="whitespace-pre-wrap break-words text-[14px] leading-relaxed">{m.content}</p>
                  <div className={cn("mt-0.5 flex items-center justify-end gap-1 text-[10px]", out ? "opacity-85" : "text-muted-foreground")}>
                    {new Date(m.at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    {out && <Ticks m={m} />}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        {lead.typing && (
          <div className="animate-msg-in flex justify-start pt-1.5">
            <div className="flex items-center gap-1 rounded-2xl rounded-bl-md bg-bubble-in px-4 py-3 shadow-soft">
              {[0, 150, 300].map((d) => (
                <span key={d} className="animate-typing h-1.5 w-1.5 rounded-full bg-muted-foreground" style={{ animationDelay: `${d}ms` }} />
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Envio */}
      <div className="border-t border-border bg-card px-3 pb-3 pt-2 sm:px-5">
        {!human && lead.status !== "ENCERRADO" && (
          <div className="mb-2 flex items-center gap-2 rounded-lg bg-muted px-3 py-1.5 text-xs text-muted-foreground">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-online opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-online" />
            </span>
            A automação está respondendo este lead. Assuma o atendimento para responder sem interferência.
          </div>
        )}
        {showQuick && (
          <div className="animate-msg-in mb-2 flex flex-wrap gap-1.5">
            {quickReplies.map((r) => (
              <button key={r} onClick={() => send(r)} className="rounded-full border border-border bg-background px-3 py-1.5 text-xs hover:border-primary hover:text-primary">
                {r}
              </button>
            ))}
          </div>
        )}
        {showEmoji && (
          <div className="animate-msg-in mb-2 flex gap-1">
            {emojis.map((e) => (
              <button key={e} onClick={() => setText((t) => t + e)} className="rounded-md p-1.5 text-lg hover:bg-accent">{e}</button>
            ))}
          </div>
        )}
        <div className="flex items-end gap-2">
          <div className="flex flex-1 items-end gap-1 rounded-2xl border border-input bg-background px-2 py-1.5 focus-within:border-primary focus-within:ring-2 focus-within:ring-ring">
            <IconBtn label="Emoji" active={showEmoji} onClick={() => setShowEmoji((v) => !v)}><Smile className="h-5 w-5" /></IconBtn>
            <IconBtn label="Anexar"><Paperclip className="h-5 w-5" /></IconBtn>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
              rows={1}
              placeholder="Digite uma mensagem"
              className="max-h-32 min-h-9 flex-1 resize-none bg-transparent px-1 py-2 text-[14px] outline-none placeholder:text-muted-foreground"
            />
            <IconBtn label="Respostas rápidas" active={showQuick} onClick={() => setShowQuick((v) => !v)}><Zap className="h-5 w-5" /></IconBtn>
          </div>
          <button
            onClick={() => send()}
            disabled={!text.trim()}
            aria-label="Enviar"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-send transition-all hover:scale-105 active:scale-95 disabled:opacity-40 disabled:shadow-none"
          >
            <Send className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
}

function IconBtn({ children, label, onClick, active }: { children: React.ReactNode; label: string; onClick?: () => void; active?: boolean }) {
  return (
    <button type="button" aria-label={label} onClick={onClick} className={cn("rounded-full p-1.5 transition-colors", active ? "text-primary" : "text-muted-foreground hover:text-foreground")}>
      {children}
    </button>
  );
}
