import { z } from 'zod';

export const decisionSchema = z.object({
  decision: z.enum(['REACTIVATE', 'REVIEW', 'DO_NOT_SEND', 'CONVERTED', 'OPT_OUT']),
  confidence: z.number().int().min(0).max(100),
  reason: z.string().min(1), stage: z.string(),
  evidence: z.array(z.string()), message: z.string().max(1500),
});
export type ReactivationDecision = z.infer<typeof decisionSchema>;
export interface ConversationMessage { id: string; direction: string; content: string | null; created_at: string; }
export function validateDecision(raw: unknown, history: ConversationMessage[]): ReactivationDecision {
  const d = decisionSchema.parse(raw);
  const validEvidence = d.evidence.every(e => history.some(m => m.direction === 'IN' && m.content?.includes(e)));
  if (d.decision === 'REACTIVATE' && (!validEvidence || !d.evidence.length || d.confidence < 80 || !d.message.trim())) {
    return { ...d, decision: 'REVIEW', reason: 'Evidência ou confiança insuficiente: revisão necessária' };
  }
  return d;
}
export function canQueue(decision: string, status: string, message: string | null) {
  return decision === 'REACTIVATE' && status === 'ANALYZED' && Boolean(message?.trim());
}
export function confirmedSend(status: string, providerId: string | null) {
  return ['SENT', 'DELIVERED', 'READ'].includes(status) && Boolean(providerId);
}
export const decisionLabels: Record<string, string> = {
  PENDING: 'Aguardando análise', REACTIVATE: 'Reativar', REVIEW: 'Revisar', DO_NOT_SEND: 'Não disparar', CONVERTED: 'Convertido — não disparar', OPT_OUT: 'Opt-out', BLOCKED: 'Contato protegido',
};
export const blockLabels: Record<string, string> = {
  CONVERTED: 'Já possui matrícula/plano', OPT_OUT: 'Pediu para não receber mensagens', HUMAN_ACTIVE: 'Atendimento humano ativo', CONTACT_PAUSED: 'Contato pausado', CONVERSATION_ACTIVE: 'Conversa aguardando atendimento', PENDING_TASK: 'Tarefa pendente', MANUAL_FOLLOWUP: 'Retorno manual programado', AUTOMATION_ACTIVE: 'Automação ativa ou pausada', ALREADY_REACTIVATED: 'Já recebeu ou tem reativação reservada', NEW_INTERACTION: 'Nova interação após a análise', NOT_AUTHORIZED: 'Disparo não autorizado',
};