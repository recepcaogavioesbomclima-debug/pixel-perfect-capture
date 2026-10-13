import type { Lead } from "./inbox-types";

const today = (h: number, m: number, dayOffset = 0) => {
  const d = new Date();
  d.setDate(d.getDate() - dayOffset);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};

// Dados de demonstração apenas para visualizar o novo layout.
export const demoLeads: Lead[] = [
  {
    phone: "5511987654321",
    name: "João Silva",
    avatarColor: 0,
    origin: "Instagram",
    enteredAt: today(9, 12, 2),
    temperature: "QUENTE",
    score: 87,
    scoreReasons: ["Perguntou o valor do plano", "Pediu horário de visita", "Respondeu rápido 3 vezes"],
    status: "AGUARDANDO",
    handler: "AUTOMACAO",
    attendant: null,
    unread: 2,
    typing: true,
    automation: {
      name: "Boas-vindas Gaviões",
      step: "Etapa 3 de 5 · Apresentar planos",
      lastAction: "Enviou tabela de planos",
      nextAction: "Aguardar resposta (2h)",
    },
    history: [
      { at: today(9, 12, 2), label: "Lead criado via Instagram" },
      { at: today(9, 13, 2), label: "Entrou na automação Boas-vindas" },
      { at: today(14, 30), label: "Interesse subiu para QUENTE" },
    ],
    messages: [
      { id: "j1", direction: "IN", content: "Oi, boa tarde! Vi vocês no Instagram 👋", at: today(14, 20) },
      { id: "j2", direction: "OUT", content: "Olá João! Bem-vindo à Academia Gaviões 24h — Bom Clima 🦅 Como posso ajudar?", at: today(14, 21), status: "READ", author: "Automação" },
      { id: "j3", direction: "IN", content: "Queria saber o valor do plano mensal e se tem musculação 24h", at: today(14, 31) },
      { id: "j4", direction: "IN", content: "Posso visitar hoje à noite?", at: today(14, 32) },
    ],
  },
  {
    phone: "5511912345678",
    name: "Mariana Costa",
    avatarColor: 1,
    origin: "Google",
    enteredAt: today(10, 5, 1),
    temperature: "MORNO",
    score: 58,
    scoreReasons: ["Perguntou sobre aulas coletivas", "Ainda não falou de preço"],
    status: "ONLINE",
    handler: "HUMANO",
    attendant: "Carlos",
    unread: 0,
    automation: { name: null, step: null, lastAction: "Pausada pelo atendente", nextAction: null },
    history: [
      { at: today(10, 5, 1), label: "Lead criado via Google" },
      { at: today(13, 40), label: "Carlos assumiu o atendimento" },
    ],
    messages: [
      { id: "m1", direction: "IN", content: "Vocês têm aula de spinning?", at: today(13, 35) },
      { id: "m2", direction: "OUT", content: "Temos sim, Mariana! Segunda, quarta e sexta às 19h.", at: today(13, 41), status: "READ", author: "Carlos" },
      { id: "m3", direction: "IN", content: "Legal, vou ver com meu marido 😊", at: today(13, 58) },
      { id: "m4", direction: "OUT", content: "Fiquem à vontade! Se quiserem, agendo uma aula experimental grátis.", at: today(14, 2), status: "DELIVERED", author: "Carlos" },
    ],
  },
  {
    phone: "5511955554444",
    name: "Pedro Almeida",
    avatarColor: 2,
    origin: "Indicação",
    enteredAt: today(8, 0, 6),
    temperature: "FRIO",
    score: 22,
    scoreReasons: ["Sem resposta há 4 dias"],
    status: "ENCERRADO",
    handler: "AUTOMACAO",
    attendant: null,
    unread: 0,
    automation: { name: "Reengajamento", step: "Concluída", lastAction: "Enviou último lembrete", nextAction: null },
    history: [
      { at: today(8, 0, 6), label: "Lead criado por indicação" },
      { at: today(9, 0, 1), label: "Conversa encerrada" },
    ],
    messages: [
      { id: "p1", direction: "OUT", content: "Oi Pedro! Ainda pensando em começar a treinar? 💪", at: today(9, 0, 1), status: "SENT", author: "Automação" },
    ],
  },
  {
    phone: "5511944443333",
    name: "Ana Beatriz",
    avatarColor: 3,
    origin: "Site",
    enteredAt: today(11, 15),
    temperature: "QUENTE",
    score: 79,
    scoreReasons: ["Perguntou forma de pagamento", "Quer matricular hoje"],
    status: "AGUARDANDO",
    handler: "AUTOMACAO",
    attendant: null,
    unread: 1,
    automation: { name: "Boas-vindas Gaviões", step: "Etapa 2 de 5 · Qualificação", lastAction: "Perguntou objetivo", nextAction: "Enviar planos" },
    history: [{ at: today(11, 15), label: "Lead criado via Site" }],
    messages: [
      { id: "a1", direction: "IN", content: "Aceitam Pix? Quero me matricular hoje", at: today(12, 48) },
    ],
  },
];
