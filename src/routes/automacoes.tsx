import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";

import { Nav, StatusBadge } from "@/components/Nav";
import { deleteAutomation, listAutomations, saveAutomation } from "@/lib/app.functions";

export const Route = createFileRoute("/automacoes")({
  head: () => ({
    meta: [
      { title: "Automações · Gaviões 24h Bom Clima" },
      {
        name: "description",
        content: "Monte fluxos de mensagem, espera e condição para o atendimento automático.",
      },
      { property: "og:title", content: "Automações · Gaviões 24h Bom Clima" },
      {
        property: "og:description",
        content: "Editor de etapas: enviar mensagem, esperar, verificar resposta e encerrar.",
      },
    ],
  }),
  component: Page,
});

type StepType = "SEND_MESSAGE" | "WAIT" | "CHECK_CONDITION" | "END_AUTOMATION" | "PAUSE_AUTOMATION";

interface Step {
  type: StepType;
  config: Record<string, any>;
}

const DEFAULT_STEPS: Step[] = [
  {
    type: "SEND_MESSAGE",
    config: { message: "Olá! Tudo bem? Somos da Academia Gaviões 24h 🦅 Quer conhecer nossos planos?" },
  },
  { type: "WAIT", config: { seconds: 7200 } },
  { type: "CHECK_CONDITION", config: { replied: true, ifTrue: "END", ifFalse: "CONTINUE" } },
  { type: "SEND_MESSAGE", config: { message: "Passando para confirmar: posso te enviar os valores?" } },
  { type: "WAIT", config: { seconds: 7200 } },
  { type: "CHECK_CONDITION", config: { replied: true, ifTrue: "END", ifFalse: "CONTINUE" } },
  { type: "END_AUTOMATION", config: {} },
];

function Page() {
  const queryClient = useQueryClient();
  const listFn = useServerFn(listAutomations);
  const saveFn = useServerFn(saveAutomation);
  const deleteFn = useServerFn(deleteAutomation);

  const query = useQuery({ queryKey: ["automations"], queryFn: () => listFn() });

  const [editingId, setEditingId] = useState<string | null>(null);
  const [name, setName] = useState("Boas-vindas Gaviões");
  const [status, setStatus] = useState("ACTIVE");
  const [steps, setSteps] = useState<Step[]>(DEFAULT_STEPS);

  const saveMutation = useMutation({
    mutationFn: () =>
      saveFn({ data: { ...(editingId ? { id: editingId } : {}), name, status, steps } }),
    onSuccess: () => {
      setEditingId(null);
      queryClient.invalidateQueries({ queryKey: ["automations"] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { id } }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["automations"] }),
  });

  const updateStep = (index: number, patch: Partial<Step>) =>
    setSteps((current) => current.map((step, i) => (i === index ? { ...step, ...patch } : step)));

  return (
    <div className="min-h-screen bg-background">
      <Nav />
      <main className="mx-auto grid max-w-5xl gap-5 px-5 py-6">
        <section className="rounded-xl border border-border bg-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-base font-semibold">Automações</h2>
            <Link to="/automacoes/leads" className="rounded-md border border-input px-3 py-1.5 text-sm hover:bg-accent">
              Leads em Automação →
            </Link>
          </div>
          <div className="space-y-2">
            {(query.data?.automations ?? []).map((automation: any) => {
              const count = (query.data?.steps ?? []).filter(
                (step: any) => step.automation_id === automation.id,
              ).length;
              return (
                <div
                  key={automation.id}
                  className="flex flex-wrap items-center gap-3 rounded-lg border border-border px-4 py-3 text-sm"
                >
                  <span className="font-medium">{automation.name}</span>
                  <StatusBadge status={automation.status} />
                  <span className="text-muted-foreground">{automation.trigger}</span>
                  <span className="text-muted-foreground">{count} etapas</span>
                  <div className="ml-auto flex gap-2">
                    <button
                      className="rounded-md border border-input px-3 py-1.5 text-xs hover:bg-accent"
                      onClick={() => {
                        setEditingId(automation.id);
                        setName(automation.name);
                        setStatus(automation.status);
                        setSteps(
                          (query.data?.steps ?? [])
                            .filter((step: any) => step.automation_id === automation.id)
                            .map((step: any) => ({ type: step.type, config: step.config })),
                        );
                      }}
                    >
                      Editar
                    </button>
                    <button
                      className="rounded-md border border-input px-3 py-1.5 text-xs hover:bg-accent"
                      onClick={() =>
                        saveFn({
                          data: {
                            id: automation.id,
                            name: automation.name,
                            status: automation.status === "ACTIVE" ? "INACTIVE" : "ACTIVE",
                            steps: (query.data?.steps ?? [])
                              .filter((step: any) => step.automation_id === automation.id)
                              .map((step: any) => ({ type: step.type, config: step.config })),
                          },
                        }).then(() => queryClient.invalidateQueries({ queryKey: ["automations"] }))
                      }
                    >
                      {automation.status === "ACTIVE" ? "Desativar" : "Ativar"}
                    </button>
                    <button
                      className="rounded-md border border-input px-3 py-1.5 text-xs text-destructive hover:bg-accent"
                      onClick={() => deleteMutation.mutate(automation.id)}
                    >
                      Excluir
                    </button>
                  </div>
                </div>
              );
            })}
            {!query.data?.automations?.length ? (
              <p className="text-sm text-muted-foreground">Nenhuma automação criada ainda.</p>
            ) : null}
          </div>
        </section>

        <section className="rounded-xl border border-border bg-card p-5">
          <h2 className="mb-4 text-base font-semibold">
            {editingId ? "Editar automação" : "Nova automação"}
          </h2>
          <div className="flex flex-wrap gap-2">
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="w-64 rounded-md border border-input bg-background px-3 py-2 text-sm"
              placeholder="Nome"
            />
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="ACTIVE">Ativa</option>
              <option value="INACTIVE">Inativa</option>
            </select>
            <span className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
              Gatilho: LEAD_CREATED
            </span>
          </div>

          <ol className="mt-5 space-y-3">
            {steps.map((step, index) => (
              <li key={index} className="rounded-lg border border-border p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-xs text-muted-foreground">#{index + 1}</span>
                  <select
                    value={step.type}
                    onChange={(event) =>
                      updateStep(index, { type: event.target.value as StepType, config: {} })
                    }
                    className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
                  >
                    <option value="SEND_MESSAGE">SEND_MESSAGE</option>
                    <option value="WAIT">WAIT</option>
                    <option value="CHECK_CONDITION">CHECK_CONDITION</option>
                    <option value="END_AUTOMATION">END_AUTOMATION</option>
                    <option value="PAUSE_AUTOMATION">PAUSE_AUTOMATION</option>
                  </select>
                  <button
                    className="ml-auto rounded-md border border-input px-2 py-1 text-xs hover:bg-accent"
                    onClick={() => setSteps((s) => s.filter((_, i) => i !== index))}
                  >
                    Remover
                  </button>
                </div>

                {step.type === "SEND_MESSAGE" ? (
                  <textarea
                    value={step.config["message"] ?? ""}
                    onChange={(event) =>
                      updateStep(index, { config: { ...step.config, message: event.target.value } })
                    }
                    rows={2}
                    className="mt-3 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    placeholder="Mensagem enviada ao cliente"
                  />
                ) : null}

                {step.type === "WAIT" ? (
                  <div className="mt-3 flex items-center gap-2 text-sm">
                    <input
                      type="number"
                      min={1}
                      value={Math.round((step.config["seconds"] ?? 3600) / 60)}
                      onChange={(event) =>
                        updateStep(index, {
                          config: { ...step.config, seconds: Number(event.target.value) * 60 },
                        })
                      }
                      className="w-28 rounded-md border border-input bg-background px-3 py-2"
                    />
                    <span className="text-muted-foreground">minutos de espera</span>
                  </div>
                ) : null}

                {step.type === "CHECK_CONDITION" ? (
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                    <span className="text-muted-foreground">Se cliente respondeu =</span>
                    <select
                      value={String(step.config["replied"] !== false)}
                      onChange={(event) =>
                        updateStep(index, {
                          config: { ...step.config, replied: event.target.value === "true" },
                        })
                      }
                      className="rounded-md border border-input bg-background px-2 py-1.5"
                    >
                      <option value="true">true</option>
                      <option value="false">false</option>
                    </select>
                    <span className="text-muted-foreground">então</span>
                    <select
                      value={step.config["ifTrue"] ?? "END"}
                      onChange={(event) =>
                        updateStep(index, { config: { ...step.config, ifTrue: event.target.value } })
                      }
                      className="rounded-md border border-input bg-background px-2 py-1.5"
                    >
                      <option value="END">encerrar</option>
                      <option value="CONTINUE">continuar</option>
                    </select>
                    <span className="text-muted-foreground">senão</span>
                    <select
                      value={step.config["ifFalse"] ?? "CONTINUE"}
                      onChange={(event) =>
                        updateStep(index, { config: { ...step.config, ifFalse: event.target.value } })
                      }
                      className="rounded-md border border-input bg-background px-2 py-1.5"
                    >
                      <option value="CONTINUE">continuar</option>
                      <option value="END">encerrar</option>
                    </select>
                  </div>
                ) : null}
              </li>
            ))}
          </ol>

          <div className="mt-4 flex flex-wrap gap-2">
            <button
              className="rounded-md border border-input px-3 py-2 text-sm hover:bg-accent"
              onClick={() => setSteps((s) => [...s, { type: "SEND_MESSAGE", config: { message: "" } }])}
            >
              + Etapa
            </button>
            <button
              className="rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
              disabled={saveMutation.isPending}
              onClick={() => saveMutation.mutate()}
            >
              {saveMutation.isPending ? "Salvando..." : "Salvar automação"}
            </button>
            {editingId ? (
              <button
                className="rounded-md border border-input px-3 py-2 text-sm hover:bg-accent"
                onClick={() => {
                  setEditingId(null);
                  setName("Nova automação");
                  setSteps(DEFAULT_STEPS);
                }}
              >
                Cancelar edição
              </button>
            ) : null}
          </div>
        </section>
      </main>
    </div>
  );
}
