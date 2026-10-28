import { createFileRoute } from "@tanstack/react-router";

import { authenticateCronRequest } from "@/integrations/supabase/cron-auth";

/** Worker agendado (a cada minuto): executa as etapas vencidas sem depender da tela aberta. */
export const Route = createFileRoute("/api/public/jobs/automation-worker")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const authFailure = await authenticateCronRequest(request);
        if (authFailure) return authFailure;
        const { runDueExecutions } = await import("@/lib/engine.server");
        const { getDb } = await import("@/lib/db.server");
        const result = await runDueExecutions(50);
        await (getDb() as any).rpc("sla_tick");
        return Response.json(result);
      },
    },
  },
});
