import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";

import { Nav } from "@/components/Nav";
import { GlobalReplyPanel } from "@/components/GlobalReplyPanel";
import { deleteIntent, getResponsesBase, saveBusinessInfo, saveIntent } from "@/lib/responses.functions";

export const Route = createFileRoute("/respostas")({
  head: () => ({
    meta: [
      { title: "Respostas automáticas · Gaviões 24h Bom Clima" },
      { name: "description", content: "Cadastre as informações da academia e as respostas usadas no atendimento automático do WhatsApp." },
      { property: "og:title", content: "Respostas automáticas · Gaviões 24h Bom Clima" },
      { property: "og:description", content: "Base de respostas do atendimento automático pelo WhatsApp." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: Page,
});

type Intent = {
  id?: string;
  intent: string;
  examples: string;
  response: string;
  alternatives: string[];
  priority: number;
  active: boolean;
};

const input = "w-full rounded-md border border-input bg-background px-3 py-2 text-sm";

function Page() {
  const qc = useQueryClient();
  const loadFn = useServerFn(getResponsesBase);
  const infoFn = useServerFn(saveBusinessInfo);
  const saveFn = useServerFn(saveIntent);
  const delFn = useServerFn(deleteIntent);
  const query = useQuery({ queryKey: ["responses-base"], queryFn: () => loadFn() });

  const [content, setContent] = useState("");
  const [fallback, setFallback] = useState("");
  useEffect(() => {
    if (query.data) {
      setContent(query.data.content);
      setFallback(query.data.fallbackReply);
    }
  }, [query.data]);

  const infoMut = useMutation({ mutationFn: () => infoFn({ data: { content, fallbackReply: fallback } }) });
  const [editing, setEditing] = useState<Intent | null>(null);
  const saveMut = useMutation({
    mutationFn: (i: Intent) => saveFn({ data: i }),
    onSuccess: () => {
      setEditing(null);
      qc.invalidateQueries({ queryKey: ["responses-base"] });
    },
  });
  const delMut = useMutation({
    mutationFn: (id: string) => delFn({ data: { id } }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["responses-base"] }),
  });

  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <main className="mx-auto grid max-w-5xl gap-5 px-5 py-6">
        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-1 text-base font-semibold">Informações da academia</h2>
          <p className="mb-3 text-sm text-muted-foreground">
            Preços, planos, horários, endereço, link de matrícula, Wellhub/TotalPass, formas de pagamento… O atendimento
            automático usa somente o que estiver aqui e nas respostas abaixo — nada é inventado.
          </p>
          <textarea rows={8} className={input} value={content} onChange={(e) => setContent(e.target.value)} />
          <label className="mt-3 block text-sm">
            <span>Resposta genérica (quando não entender a mensagem)</span>
            <input className={`${input} mt-1`} value={fallback} onChange={(e) => setFallback(e.target.value)} />
          </label>
          <button
            onClick={() => infoMut.mutate()}
            disabled={infoMut.isPending || !fallback.trim()}
            className="mt-3 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            {infoMut.isPending ? "Salvando..." : infoMut.isSuccess ? "Salvo ✓" : "Salvar informações"}
          </button>
        </section>

        <GlobalReplyPanel />

        <section className="rounded-xl border border-border bg-card p-5">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-base font-semibold">Intenções e respostas</h2>
            <button
              onClick={() => setEditing({ intent: "", examples: "", response: "", alternatives: [], priority: 5, active: true })}
              className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-accent"
            >
              + Nova intenção
            </button>
          </div>

          {editing ? <Editor value={editing} onCancel={() => setEditing(null)} onSave={(i) => saveMut.mutate(i)} saving={saveMut.isPending} /> : null}
          {saveMut.error ? <p className="mb-3 text-sm text-destructive">{String(saveMut.error)}</p> : null}

          <div className="space-y-2">
            {(query.data?.intents ?? []).map((i) => (
              <div key={i.id} className="rounded-lg border border-border px-4 py-3 text-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{i.intent}</span>
                  <span className="text-xs text-muted-foreground">prioridade {i.priority}</span>
                  {!i.active ? <span className="rounded-full bg-muted px-2 py-0.5 text-xs">inativa</span> : null}
                  {!i.response ? <span className="rounded-full bg-destructive/15 px-2 py-0.5 text-xs text-destructive">sem resposta</span> : null}
                  <div className="ml-auto flex gap-2">
                    <button onClick={() => setEditing(i)} className="rounded-md border border-input px-3 py-1 text-xs hover:bg-accent">
                      Editar
                    </button>
                    <button
                      onClick={() => confirm(`Excluir "${i.intent}"?`) && delMut.mutate(i.id)}
                      className="rounded-md border border-input px-3 py-1 text-xs text-destructive hover:bg-accent"
                    >
                      Excluir
                    </button>
                  </div>
                </div>
                <p className="mt-1 text-muted-foreground">Exemplos: {i.examples || "—"}</p>
                {i.response ? <p className="mt-1">{i.response}</p> : null}
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

function Editor({ value, onSave, onCancel, saving }: { value: Intent; onSave: (i: Intent) => void; onCancel: () => void; saving: boolean }) {
  const [v, setV] = useState<Intent>(value);
  const [alts, setAlts] = useState(value.alternatives.join("\n"));
  return (
    <div className="mb-4 space-y-3 rounded-lg border border-primary/40 p-4 text-sm">
      <label className="block">Intenção<input className={`${input} mt-1`} value={v.intent} onChange={(e) => setV({ ...v, intent: e.target.value })} /></label>
      <label className="block">Exemplos de mensagens (separe com ;)<input className={`${input} mt-1`} value={v.examples} onChange={(e) => setV({ ...v, examples: e.target.value })} /></label>
      <label className="block">Resposta<textarea rows={3} className={`${input} mt-1`} value={v.response} onChange={(e) => setV({ ...v, response: e.target.value })} /></label>
      <label className="block">Respostas alternativas (uma por linha)<textarea rows={2} className={`${input} mt-1`} value={alts} onChange={(e) => setAlts(e.target.value)} /></label>
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2">Prioridade
          <input type="number" min={0} max={100} className="w-20 rounded-md border border-input bg-background px-2 py-1" value={v.priority} onChange={(e) => setV({ ...v, priority: Number(e.target.value) })} />
        </label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={v.active} onChange={(e) => setV({ ...v, active: e.target.checked })} />Ativa</label>
      </div>
      <div className="flex gap-2">
        <button
          disabled={saving || !v.intent.trim()}
          onClick={() => onSave({ ...v, alternatives: alts.split("\n").map((a) => a.trim()).filter(Boolean) })}
          className="rounded-md bg-primary px-4 py-2 font-medium text-primary-foreground disabled:opacity-50"
        >
          {saving ? "Salvando..." : "Salvar"}
        </button>
        <button onClick={onCancel} className="rounded-md border border-input px-4 py-2 hover:bg-accent">Cancelar</button>
      </div>
    </div>
  );
}
