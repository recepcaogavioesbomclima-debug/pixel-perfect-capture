import { createFileRoute } from "@tanstack/react-router";

import { getDb } from "@/lib/db.server";
import { runDueExecutions } from "@/lib/engine.server";

/**
 * Worker do motor: processa execucoes cujo nextRunAt ja venceu.
 * Chamado pelo agendador do banco a cada minuto e tambem pela interface.
 * Autenticacao: token do webhook (env) ou token do worker guardado no banco.
 */
export const Route = createFileRoute("/api/public/hooks/automation-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = new URL(request.url).searchParams.get("token");
        if (!token) return new Response("unauthorized", { status: 401 });

        let authorized = token === process.env["WHAPI_WEBHOOK_TOKEN"];
        if (!authorized) {
          const { data } = await getDb().from("worker_auth").select("token").eq("id", true).maybeSingle();
          authorized = Boolean(data?.token) && data!.token === token;
        }
        if (!authorized) return new Response("unauthorized", { status: 401 });

        const result = await runDueExecutions();
        return Response.json(result);
      },
    },
  },
});
