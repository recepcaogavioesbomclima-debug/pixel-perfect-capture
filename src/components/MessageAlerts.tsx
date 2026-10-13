import { useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { MessageCircle, Volume2, VolumeX, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import { ALERT_SECONDS, secondsLeft } from "@/lib/alert-timer";
import { listRecentAlerts } from "@/lib/alerts.functions";
import { claimConversation } from "@/lib/handoff.functions";

interface Alert {
  id: string;
  phone: string;
  contact_name: string | null;
  preview: string | null;
  received_at: string;
  shownAt: number;
  temp?: { score: number; level: string; hot: boolean } | null;
  state: "idle" | "claiming" | "claimed" | "taken" | "error";
  note?: string;
}

const SEEN_KEY = "gavioes-alerts-seen";
const SOUND_KEY = "gavioes-alerts-sound";

function loadSeen(): Set<string> {
  try {
    return new Set(JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]"));
  } catch {
    return new Set();
  }
}
function saveSeen(seen: Set<string>) {
  localStorage.setItem(SEEN_KEY, JSON.stringify([...seen].slice(-300)));
}

function beep() {
  try {
    const ctx = new AudioContext();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = 880;
    g.gain.setValueAtTime(0.08, ctx.currentTime);
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.35);
    o.connect(g).connect(ctx.destination);
    o.start();
    o.stop(ctx.currentTime + 0.35);
  } catch {
    /* som indisponível */
  }
}

export function MessageAlerts() {
  const [signedIn, setSignedIn] = useState(false);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [sound, setSound] = useState(false);
  const soundRef = useRef(false);
  const claimFn = useServerFn(claimConversation);
  const navigate = useNavigate();
  const qc = useQueryClient();

  useEffect(() => {
    const on = localStorage.getItem(SOUND_KEY) === "1";
    setSound(on);
    soundRef.current = on;
    supabase.auth.getSession().then(({ data }) => setSignedIn(Boolean(data.session)));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, session) => setSignedIn(Boolean(session)));
    return () => sub.subscription.unsubscribe();
  }, []);

  // Um único ponto de entrada para o bump: deduplicado pelo ID do alerta
  // (um alerta por mensagem recebida, criado pelo gatilho do banco).
  const seenRef = useRef<Set<string> | null>(null);
  const ingest = useCallback(
    (row: { id: string; phone: string; contact_name: string | null; preview: string | null; received_at: string; temp?: Alert["temp"] }, via: string) => {
      const seen = (seenRef.current ??= loadSeen());
      console.info(`[ALERTS] D) evento recebido no navegador via ${via}`, row.id, row.phone);
      if (seen.has(row.id)) return;
      seen.add(row.id);
      saveSeen(seen);
      console.info("[ALERTS] E/F) handler executado, bump adicionado", row.id);
      setNow(Date.now());
      setAlerts((cur) => (cur.some((x) => x.id === row.id) ? cur : [...cur, { ...row, temp: row.temp ?? null, shownAt: Date.now(), state: "idle" }]));
      if (!row.temp) {
        fetchTemp(row.phone).then((t) => t && setAlerts((cur) => cur.map((x) => (x.id === row.id ? { ...x, temp: t } : x))));
      }
      qc.invalidateQueries({ queryKey: ["global-reply"] });
      if (soundRef.current) beep();
    },
    [qc],
  );
  const fetchTemp = async (phone: string) => {
    const { data } = await supabase.from("lead_interest").select("score, level, hot").eq("phone", phone).maybeSingle();
    return data ?? null;
  };

  // Entrega principal: consulta o servidor a cada 2s (funciona com ou sem login)
  const pollFn = useServerFn(listRecentAlerts);
  useEffect(() => {
    let cursor: string | null = null;
    let stop = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const run = async () => {
      try {
        const r = await pollFn({ data: { since: cursor } });
        for (const a of r.alerts) ingest(a, "consulta");
        // sobreposição de 10s para não perder nada na virada; duplicatas são ignoradas
        cursor = new Date(Date.parse(r.serverNow) - 10_000).toISOString();
      } catch (e) {
        console.error("[ALERTS] falha ao consultar alertas:", e);
      }
      if (!stop) timer = setTimeout(run, 2000);
    };
    run();
    return () => {
      stop = true;
      clearTimeout(timer);
    };
  }, [pollFn, ingest]);

  // Entrega instantânea extra para atendentes logados (tempo real)
  useEffect(() => {
    if (!signedIn) return;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let channel: ReturnType<typeof supabase.channel>;
    const subscribe = () => {
      channel = supabase
        .channel(`inbound-alerts-${Date.now()}`)
        .on("postgres_changes", { event: "INSERT", schema: "public", table: "inbound_alerts" }, (payload) => {
          ingest(payload.new as any, "tempo real");
        })
        .subscribe((status) => {
          console.info("[ALERTS] tempo real:", status);
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            clearTimeout(retry);
            retry = setTimeout(() => {
              supabase.removeChannel(channel);
              subscribe();
            }, 3000);
          }
        });
    };
    subscribe();
    return () => {
      clearTimeout(retry);
      supabase.removeChannel(channel);
    };
  }, [signedIn, ingest]);

  useEffect(() => {
    if (!alerts.length) return;
    const tick = () => setNow(Date.now());
    const t = setInterval(tick, 250);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [alerts.length]);

  // remove alertas expirados (exceto os que estão mostrando o resultado)
  useEffect(() => {
    setAlerts((cur) => {
      const next = cur.filter((a) => a.state === "claiming" || secondsLeft(a.shownAt, now) > 0);
      return next.length === cur.length ? cur : next;
    });
  }, [now]);

  const update = (id: string, patch: Partial<Alert>) =>
    setAlerts((cur) => cur.map((a) => (a.id === id ? { ...a, ...patch } : a)));

  const claim = async (a: Alert) => {
    if (!signedIn) {
      // assumir exige saber QUEM é o atendente
      setAlerts((cur) => cur.filter((x) => x.id !== a.id));
      navigate({ to: "/auth" });
      return;
    }
    update(a.id, { state: "claiming" });
    try {
      const r = await claimFn({ data: { phone: a.phone } });
      qc.invalidateQueries({ queryKey: ["global-reply"] });
      if (r.ok) {
        setAlerts((cur) => cur.filter((x) => x.phone !== a.phone));
        navigate({ to: "/respostas", hash: `contato-${a.phone}` });
      } else {
        update(a.id, { state: "taken", note: `Já assumido por ${r.assignedName ?? "outro atendente"}`, shownAt: Date.now() - 2000 });
      }
    } catch (e: any) {
      update(a.id, { state: "error", note: String(e?.message ?? "Falha ao assumir"), shownAt: Date.now() - 2000 });
    }
  };

  const toggleSound = () => {
    const v = !sound;
    setSound(v);
    soundRef.current = v;
    localStorage.setItem(SOUND_KEY, v ? "1" : "0");
  };

  useEffect(() => {
    if (alerts.length) console.info("[ALERTS] G) bumps renderizados:", alerts.map((a) => a.id).join(", "));
  }, [alerts]);

  return (
    <>
      <button
        onClick={toggleSound}
        title={sound ? "Desativar som dos alertas" : "Ativar som dos alertas"}
        className="alert-sound-toggle"
      >
        {sound ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />}
      </button>
      <div className={alerts.length ? "alert-overlay" : "alert-overlay alert-overlay-empty"} aria-live="assertive">
        {alerts.map((a) => {
          const left = secondsLeft(a.shownAt, now);
          return (
            <div key={a.id} className="alert-card" role="alert">
              <div className="alert-progress" style={{ width: `${(left / ALERT_SECONDS) * 100}%` }} />
              <div className="flex items-start gap-3">
                <div className="alert-icon">
                  <MessageCircle className="h-5 w-5" />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold uppercase tracking-wider text-primary">Nova mensagem no WhatsApp</div>
                  <div className="mt-1 truncate text-sm font-semibold">{a.contact_name ?? a.phone}</div>
                  {a.contact_name && <div className="text-xs text-muted-foreground">{a.phone}</div>}
                  <div className="mt-1 text-xs font-semibold">
                    {a.temp
                      ? `${a.temp.hot ? "🔥 " : ""}Interesse: ${a.temp.level} · ${a.temp.score} pts`
                      : "Interesse: AINDA NÃO ANALISADO"}
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">“{a.preview || "(mídia)"}”</p>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Recebida às {new Date(a.received_at).toLocaleTimeString("pt-BR")} · Tempo para assumir: {left}s
                  </div>
                  {a.note && <div className="mt-2 text-xs font-medium text-destructive">{a.note}</div>}
                  {!signedIn && <div className="mt-2 text-xs text-muted-foreground">Para assumir, entre como atendente.</div>}
                </div>
                <button
                  onClick={() => setAlerts((cur) => cur.filter((x) => x.id !== a.id))}
                  className="text-muted-foreground hover:text-foreground"
                  aria-label="Fechar alerta"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              {a.state !== "taken" && (
                <button onClick={() => claim(a)} disabled={a.state === "claiming"} className="alert-cta">
                  {a.state === "claiming" ? "ASSUMINDO..." : "ASSUMIR ATENDIMENTO"}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}

