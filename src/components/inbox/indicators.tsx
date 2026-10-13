import { Bot, Flame, Snowflake, Thermometer, User } from "lucide-react";

import { cn } from "@/lib/utils";
import type { ConversationStatus, Handler, Temperature } from "@/lib/inbox-types";

const tempStyle: Record<Temperature, { cls: string; dot: string; Icon: typeof Flame; label: string }> = {
  QUENTE: { cls: "bg-hot/12 text-hot", dot: "bg-hot", Icon: Flame, label: "Quente" },
  MORNO: { cls: "bg-warm/15 text-warm", dot: "bg-warm", Icon: Thermometer, label: "Morno" },
  FRIO: { cls: "bg-cold/12 text-cold", dot: "bg-cold", Icon: Snowflake, label: "Frio" },
};

export function TempBadge({ t, score, size = "sm" }: { t: Temperature; score?: number; size?: "sm" | "lg" }) {
  const s = tempStyle[t];
  return (
    <span
      key={t}
      className={cn(
        "animate-pop inline-flex items-center gap-1 rounded-full font-semibold uppercase tracking-wide",
        s.cls,
        size === "sm" ? "px-2 py-0.5 text-[10px]" : "px-3 py-1 text-xs",
      )}
    >
      <s.Icon className={size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5"} />
      {s.label}
      {score !== undefined && <span className="font-display tabular-nums">· {score}</span>}
    </span>
  );
}

export function TempDot({ t }: { t: Temperature }) {
  return <span className={cn("inline-block h-2 w-2 rounded-full", tempStyle[t].dot)} />;
}

export const tempLabel = (t: Temperature) => tempStyle[t].label;

const statusStyle: Record<ConversationStatus, { dot: string; label: string }> = {
  ONLINE: { dot: "bg-online", label: "Online" },
  AGUARDANDO: { dot: "bg-waiting", label: "Aguardando" },
  ENCERRADO: { dot: "bg-hot", label: "Encerrado" },
};

export function StatusPill({ s }: { s: ConversationStatus }) {
  const st = statusStyle[s];
  return (
    <span key={s} className="animate-pop inline-flex items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 text-[11px] font-medium text-muted-foreground">
      <span className={cn("h-1.5 w-1.5 rounded-full", st.dot)} />
      {st.label}
    </span>
  );
}

export function HandlerPill({ h, name }: { h: Handler; name?: string | null }) {
  const human = h === "HUMANO";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium",
        human ? "bg-secondary text-secondary-foreground" : "bg-muted text-bot",
      )}
    >
      {human ? <User className="h-3 w-3" /> : <Bot className="h-3 w-3" />}
      {human ? name ?? "Humano" : "Automação"}
    </span>
  );
}

const avatarTones = ["bg-secondary text-secondary-foreground", "bg-primary text-primary-foreground", "bg-cold text-primary-foreground", "bg-warm text-secondary"];

export function Avatar({ name, tone, size = 44, handler }: { name: string; tone: number; size?: number; handler?: Handler }) {
  const initials = name.split(" ").map((p) => p[0]).slice(0, 2).join("").toUpperCase();
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div className={cn("flex h-full w-full items-center justify-center rounded-full font-display text-sm font-semibold", avatarTones[tone % avatarTones.length])}>
        {initials}
      </div>
      {handler && (
        <span className="absolute -bottom-0.5 -right-0.5 flex h-5 w-5 items-center justify-center rounded-full border-2 border-card bg-card text-muted-foreground">
          {handler === "HUMANO" ? <User className="h-3 w-3 text-foreground" /> : <Bot className="h-3 w-3" />}
        </span>
      )}
    </div>
  );
}

export function ScoreBar({ score, t }: { score: number; t: Temperature }) {
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
      <div className={cn("h-full rounded-full transition-all duration-500", tempStyle[t].dot)} style={{ width: `${score}%` }} />
    </div>
  );
}

export function formatTime(iso: string) {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString())
    return d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const y = new Date(now);
  y.setDate(now.getDate() - 1);
  if (d.toDateString() === y.toDateString()) return "Ontem";
  return d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
}

export function formatPhone(p: string) {
  const m = p.match(/^55(\d{2})(\d{4,5})(\d{4})$/);
  return m ? `+55 (${m[1]}) ${m[2]}-${m[3]}` : p;
}
