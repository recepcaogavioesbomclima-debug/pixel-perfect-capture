import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";

const items = [
  { to: "/", label: "WhatsApp" },
  { to: "/atendimento", label: "Atendimento" },
  { to: "/automacoes", label: "Automações" },
  { to: "/automacoes/leads", label: "Leads em Automação" },
  { to: "/interesse", label: "Interesse" },
  { to: "/execucoes", label: "Execuções" },
  { to: "/respostas", label: "Respostas" },
  { to: "/configuracoes", label: "Configurações" },
] as const;

export function Nav() {
  return (
    <header className="border-b border-border bg-card">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-4 px-5 py-4">
        <span className="text-lg font-semibold tracking-tight text-primary">
          🦅 Gaviões 24h · Bom Clima
        </span>
        <nav className="flex gap-1">
          {items.map((item) => (
            <Link
              key={item.to}
              to={item.to}
              activeOptions={{ exact: item.to === "/" }}
              className="rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground [&.active]:bg-accent [&.active]:text-primary"
            >
              {item.label}
            </Link>
          ))}
        </nav>
        <AuthLink />
      </div>
    </header>
  );
}

export function StatusBadge({ status }: { status: string }) {
  const tone: Record<string, string> = {
    CONNECTED: "bg-primary/15 text-primary",
    WAITING_QR: "bg-chart-4/15 text-chart-4",
    CONNECTING: "bg-chart-4/15 text-chart-4",
    RUNNING: "bg-chart-2/15 text-chart-2",
    WAITING: "bg-chart-4/15 text-chart-4",
    PENDING: "bg-muted text-muted-foreground",
    COMPLETED: "bg-primary/15 text-primary",
    CANCELLED: "bg-muted text-muted-foreground",
    PAUSED: "bg-muted text-muted-foreground",
    FAILED: "bg-destructive/15 text-destructive",
    ERROR: "bg-destructive/15 text-destructive",
    DISCONNECTED: "bg-muted text-muted-foreground",
  };
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${
        tone[status] ?? "bg-muted text-muted-foreground"
      }`}
    >
      {status}
    </span>
  );
}

function AuthLink() {
  const [email, setEmail] = useState<string | null>(null);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setEmail(data.session?.user.email ?? null));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setEmail(s?.user.email ?? null));
    return () => data.subscription.unsubscribe();
  }, []);
  if (!email)
    return (
      <Link to="/auth" className="ml-auto rounded-md border border-input px-3 py-1.5 text-sm hover:bg-accent">
        Entrar como atendente
      </Link>
    );
  return (
    <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
      <span>👤 {email}</span>
      <button onClick={() => supabase.auth.signOut()} className="rounded-md border border-input px-2 py-1 hover:bg-accent">
        Sair
      </button>
    </div>
  );
}
