/** Regra pura: um envio automático (IA/automação) só sai se nenhum humano estiver na conversa. */
export interface GuardState {
  paused?: boolean | null;
  assigned_to?: string | null;
  pause_epoch?: number | null;
  opt_out?: boolean | null;
}

export function autoSendBlockReason(s: GuardState | null, expectEpoch?: number): string | null {
  if (s?.opt_out) return "Cliente pediu para não receber mensagens";
  if (s?.assigned_to) return "Conversa assumida por um atendente";
  if (s?.paused) return "IA pausada (atendimento humano ou gerente)";
  if (expectEpoch != null && Number(s?.pause_epoch ?? 0) !== expectEpoch)
    return "Resposta gerada antes de uma pausa/reativação; descartada";
  return null;
}

export const AI_STATE_LABEL: Record<string, string> = {
  ACTIVE: "IA ATIVA",
  ANALYZING: "IA ANALISANDO",
  GENERATING: "IA GERANDO",
  SENDING: "IA ENVIANDO",
  PAUSED_HUMAN: "IA PAUSADA — CONSULTOR EM ATENDIMENTO",
  PAUSED_MANAGER: "IA PAUSADA — GERENTE",
  FINISHED: "IA FINALIZADA",
};
