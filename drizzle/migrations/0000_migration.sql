CREATE TABLE public.whatsapp_sessions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'whapi',
  channel_id text,
  connected_number text,
  status text NOT NULL DEFAULT 'DISCONNECTED',
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.whatsapp_sessions TO service_role;
ALTER TABLE public.whatsapp_sessions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.leads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text,
  phone text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.leads TO service_role;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_message_id text,
  phone text NOT NULL,
  direction text NOT NULL,
  content text,
  type text NOT NULL DEFAULT 'text',
  status text NOT NULL DEFAULT 'PENDING',
  error text,
  idempotency_key text,
  chat_id text,
  execution_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX messages_provider_message_id_key ON public.messages (provider_message_id) WHERE provider_message_id IS NOT NULL;
CREATE UNIQUE INDEX messages_idempotency_key_key ON public.messages (idempotency_key) WHERE idempotency_key IS NOT NULL;
CREATE INDEX messages_phone_idx ON public.messages (phone);
GRANT ALL ON public.messages TO service_role;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.automations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  status text NOT NULL DEFAULT 'INACTIVE',
  trigger text NOT NULL DEFAULT 'LEAD_CREATED',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.automations TO service_role;
ALTER TABLE public.automations ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.automation_steps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id uuid NOT NULL REFERENCES public.automations(id) ON DELETE CASCADE,
  order_index integer NOT NULL,
  type text NOT NULL,
  config jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX automation_steps_automation_idx ON public.automation_steps (automation_id, order_index);
GRANT ALL ON public.automation_steps TO service_role;
ALTER TABLE public.automation_steps ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.automation_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  automation_id uuid NOT NULL REFERENCES public.automations(id) ON DELETE CASCADE,
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  phone text NOT NULL,
  status text NOT NULL DEFAULT 'PENDING',
  current_step integer NOT NULL DEFAULT 0,
  next_run_at timestamptz NOT NULL DEFAULT now(),
  attempts integer NOT NULL DEFAULT 0,
  replied boolean NOT NULL DEFAULT false,
  last_error text,
  started_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz,
  pending_reply_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX automation_executions_due_idx ON public.automation_executions (status, next_run_at);
CREATE INDEX automation_executions_phone_idx ON public.automation_executions (phone);
CREATE UNIQUE INDEX automation_executions_automation_lead_key ON public.automation_executions (automation_id, lead_id) WHERE lead_id IS NOT NULL;
GRANT ALL ON public.automation_executions TO service_role;
ALTER TABLE public.automation_executions ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.automation_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  execution_id uuid REFERENCES public.automation_executions(id) ON DELETE CASCADE,
  step_id uuid,
  event text NOT NULL,
  status text,
  data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX automation_logs_execution_idx ON public.automation_logs (execution_id, created_at DESC);
CREATE INDEX automation_logs_created_idx ON public.automation_logs (created_at DESC);
GRANT ALL ON public.automation_logs TO service_role;
ALTER TABLE public.automation_logs ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider_event_id text NOT NULL UNIQUE,
  event_type text,
  payload jsonb,
  processed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.webhook_events TO service_role;
ALTER TABLE public.webhook_events ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.send_window (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  start_hour integer NOT NULL DEFAULT 8,
  end_hour integer NOT NULL DEFAULT 20,
  days integer[] NOT NULL DEFAULT ARRAY[1,2,3,4,5,6],
  tz_offset_minutes integer NOT NULL DEFAULT -180,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.send_window TO service_role;
ALTER TABLE public.send_window ENABLE ROW LEVEL SECURITY;
INSERT INTO public.send_window (id) VALUES (true);

DO $$
DECLARE target_automation_id uuid;
BEGIN
  INSERT INTO public.automations (name, status, trigger)
  VALUES ('TESTE — LEAD FOLLOW-UP', 'ACTIVE', 'LEAD_CREATED')
  RETURNING id INTO target_automation_id;
  INSERT INTO public.automation_steps (automation_id, order_index, type, config) VALUES
    (target_automation_id, 0, 'SEND_MESSAGE', jsonb_build_object('message', '🦅 Olá! Tudo bem? Aqui é da Academia Gaviões 24h - Bom Clima. Como podemos te ajudar?')),
    (target_automation_id, 1, 'WAIT', jsonb_build_object('seconds', 10)),
    (target_automation_id, 2, 'CHECK_CONDITION', jsonb_build_object('replied', true, 'ifTrue', 'END', 'ifFalse', 'CONTINUE')),
    (target_automation_id, 3, 'SEND_MESSAGE', jsonb_build_object('message', '🦅 Oi! Passando para saber se ainda podemos ajudar você.')),
    (target_automation_id, 4, 'END_AUTOMATION', '{}'::jsonb);
END
$$;

create extension if not exists pg_cron;
create extension if not exists pg_net;
create table public.worker_auth (id boolean primary key default true check (id), token text not null);
grant all on public.worker_auth to service_role;
alter table public.worker_auth enable row level security;
insert into public.worker_auth (id, token) values (true, encode(extensions.gen_random_bytes(24),'hex'));

CREATE TABLE public.intent_responses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  intent text NOT NULL UNIQUE,
  examples text NOT NULL DEFAULT '',
  response text NOT NULL DEFAULT '',
  alternatives text[] NOT NULL DEFAULT '{}',
  priority integer NOT NULL DEFAULT 0,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.intent_responses TO service_role;
ALTER TABLE public.intent_responses ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.business_info (
  id boolean PRIMARY KEY DEFAULT true,
  content text NOT NULL DEFAULT '',
  fallback_reply text NOT NULL DEFAULT 'Claro! 😊 Me conta o que você gostaria de saber sobre a Gaviões Bom Clima que eu te ajudo.',
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.business_info TO service_role;
ALTER TABLE public.business_info ENABLE ROW LEVEL SECURITY;
INSERT INTO public.business_info (id) VALUES (true);

INSERT INTO public.intent_responses (intent, examples, priority) VALUES
('Saudação','Oi; Olá; Bom dia; Boa tarde',10),
('Preço','Quanto custa?; Qual o valor?; Quanto fica?',9),
('Planos','Quais planos vocês têm?; E o mensal?',9),
('Horários','Vocês funcionam 24 horas?; Que horas abre?',8),
('Endereço','Onde fica?; Qual o endereço?',8),
('Aulas e modalidades','Tem aula de quê?; Tem funcional?',6),
('Estrutura','Como é a academia?; Tem vestiário?',5),
('Estacionamento','Tem estacionamento?',5),
('Wellhub / TotalPass','Aceita Gympass?; Aceita TotalPass?',6),
('Matrícula','Como faço matrícula?; Me manda o link',8),
('Visita / conhecer a unidade','Quero conhecer; Posso treinar hoje?',7),
('Personal trainer','Tem personal?',5),
('Formas de pagamento','Aceita cartão?; Tem pix?',5),
('Cancelamento','Como cancelo?',5),
('Agradecimento','Obrigado; Valeu; Tá bom',3),
('Não quer mais receber mensagens','Pare; Não quero mais; Sair',10);

CREATE TABLE public.global_reply_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  enabled boolean NOT NULL DEFAULT true,
  reply_new_leads boolean NOT NULL DEFAULT true,
  reply_existing boolean NOT NULL DEFAULT true,
  context_messages int NOT NULL DEFAULT 20,
  min_interval_seconds int NOT NULL DEFAULT 5,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.global_reply_settings TO service_role;
ALTER TABLE public.global_reply_settings ENABLE ROW LEVEL SECURITY;
INSERT INTO public.global_reply_settings (id) VALUES (true);

CREATE TABLE public.contact_ai (
  phone text PRIMARY KEY,
  paused boolean NOT NULL DEFAULT false,
  pending_reply_at timestamptz,
  last_reply_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.contact_ai TO service_role;
ALTER TABLE public.contact_ai ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.lead_interest (
  phone text PRIMARY KEY,
  score int NOT NULL DEFAULT 0,
  level text NOT NULL DEFAULT 'MUITO BAIXO',
  intent text NOT NULL DEFAULT 'INDEFINIDO',
  objection text,
  trend text NOT NULL DEFAULT 'ESTAVEL',
  reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  hot boolean NOT NULL DEFAULT false,
  pending_at timestamptz,
  analyzed_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.lead_interest TO service_role;
ALTER TABLE public.lead_interest ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.lead_interest_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  score int NOT NULL,
  level text NOT NULL,
  intent text NOT NULL,
  objection text,
  reason text,
  source_message_id text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX lead_interest_history_phone_idx ON public.lead_interest_history (phone, created_at DESC);
CREATE UNIQUE INDEX lead_interest_history_source_key ON public.lead_interest_history (source_message_id) WHERE source_message_id IS NOT NULL;
GRANT ALL ON public.lead_interest_history TO service_role;
ALTER TABLE public.lead_interest_history ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.interest_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  hot_threshold int NOT NULL DEFAULT 80,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.interest_settings TO service_role;
ALTER TABLE public.interest_settings ENABLE ROW LEVEL SECURITY;
INSERT INTO public.interest_settings (id) VALUES (true);

CREATE TABLE public.evolution_config (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  api_url text NOT NULL DEFAULT '',
  api_key text NOT NULL DEFAULT '',
  instance_name text NOT NULL DEFAULT 'gavioes-bom-clima',
  enabled boolean NOT NULL DEFAULT false,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.evolution_config TO service_role;
ALTER TABLE public.evolution_config ENABLE ROW LEVEL SECURITY;