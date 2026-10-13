import { createClient } from "@supabase/supabase-js";

/** Cliente de banco somente-servidor (service role). Nunca importar no cliente. */
export function getDb() {
  return createClient(
    process.env["SUPABASE_URL"]!,
    process.env["SUPABASE_SERVICE_ROLE_KEY"]!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export async function log(
  event: string,
  status: string,
  data?: unknown,
  executionId?: string | null,
  stepId?: string | null,
) {
  const db = getDb();
  await db.from("automation_logs").insert({
    execution_id: executionId ?? null,
    step_id: stepId ?? null,
    event,
    status,
    data: (data ?? null) as never,
  });
  console.log(`[${event}] ${status}`, data ? JSON.stringify(data).slice(0, 500) : "");
}

/**
 * Normaliza telefone para o formato exigido pelo provedor: somente digitos,
 * sempre com DDI. Numeros brasileiros sem DDI (10 ou 11 digitos) recebem "55".
 */
export function normalizePhone(input: string): string {
  let digits = (input ?? "").replace(/\D/g, "");
  if (digits.startsWith("00")) digits = digits.slice(2);
  // numero nacional brasileiro: DDD (2) + 8 ou 9 digitos
  if (digits.length === 10 || digits.length === 11) digits = `55${digits}`;
  return digits;
}
