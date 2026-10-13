// Tipos de apresentação. Espelham as tabelas reais (messages, contact_ai,
// lead_interest, inbound_alerts) para que a tela possa ser ligada às funções
// existentes do sistema sem alterar a lógica do backend.

export type Temperature = "QUENTE" | "MORNO" | "FRIO";
export type ConversationStatus = "ONLINE" | "AGUARDANDO" | "ENCERRADO";
export type Handler = "AUTOMACAO" | "HUMANO";
export type MessageStatus = "PENDING" | "SENT" | "DELIVERED" | "READ" | "FAILED";

export interface ChatMessage {
  id: string;
  direction: "IN" | "OUT";
  content: string;
  at: string; // ISO
  status?: MessageStatus;
  author?: string; // "Automação" ou nome do atendente
}

export interface HistoryItem {
  at: string;
  label: string;
}

export interface Lead {
  phone: string;
  name: string;
  avatarColor: number;
  origin: string;
  enteredAt: string;
  temperature: Temperature;
  score: number;
  scoreReasons: string[];
  status: ConversationStatus;
  handler: Handler;
  attendant: string | null;
  unread: number;
  typing?: boolean;
  automation: {
    name: string | null;
    step: string | null;
    lastAction: string | null;
    nextAction: string | null;
  };
  history: HistoryItem[];
  messages: ChatMessage[];
}
