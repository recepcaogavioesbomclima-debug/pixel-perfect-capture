import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { Nav } from "@/components/Nav";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/auth")({
  head: () => ({
    meta: [
      { title: "Entrar · Gaviões 24h Bom Clima" },
      { name: "description", content: "Acesso dos atendentes para receber alertas e assumir conversas do WhatsApp." },
      { property: "og:title", content: "Entrar · Gaviões 24h Bom Clima" },
      { property: "og:description", content: "Acesso dos atendentes da Academia Gaviões 24h." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: AuthPage,
});

const input = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    if (mode === "in") {
      const { error } = await supabase.auth.signInWithPassword({ email, password });
      setBusy(false);
      if (error) return setMsg("E-mail ou senha incorretos.");
      navigate({ to: "/" });
    } else {
      const { error } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin },
      });
      setBusy(false);
      if (error) return setMsg(error.message);
      setMsg("Conta criada. Confirme pelo link enviado ao seu e-mail e depois entre.");
      setMode("in");
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <main className="mx-auto max-w-sm px-5 py-12">
        <h1 className="mb-1 text-xl font-semibold">{mode === "in" ? "Entrar como atendente" : "Criar conta de atendente"}</h1>
        <p className="mb-5 text-sm text-muted-foreground">
          Atendentes conectados recebem os alertas de novas mensagens e podem assumir conversas.
        </p>
        <form onSubmit={submit} className="grid gap-3 rounded-xl border border-border bg-card p-5">
          <input className={input} type="email" required placeholder="E-mail" value={email} onChange={(e) => setEmail(e.target.value)} />
          <input className={input} type="password" required minLength={6} placeholder="Senha" value={password} onChange={(e) => setPassword(e.target.value)} />
          <button disabled={busy} className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50">
            {busy ? "Aguarde..." : mode === "in" ? "Entrar" : "Criar conta"}
          </button>
          {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
        </form>
        <button onClick={() => setMode(mode === "in" ? "up" : "in")} className="mt-4 text-sm text-primary underline">
          {mode === "in" ? "Ainda não tem conta? Criar conta" : "Já tenho conta"}
        </button>
      </main>
    </div>
  );
}
