ALTER TABLE public.lead_interest
  ADD COLUMN lead_id uuid,
  ADD COLUMN chat_id text,
  ADD COLUMN previous_score int,
  ADD COLUMN last_message_id uuid,
  ADD COLUMN logic_version text NOT NULL DEFAULT 'v1',
  ADD COLUMN last_error text;

ALTER TABLE public.lead_interest_history
  ADD COLUMN previous_score int,
  ADD COLUMN trend text NOT NULL DEFAULT 'ESTAVEL',
  ADD COLUMN hot boolean NOT NULL DEFAULT false,
  ADD COLUMN reasons jsonb NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN logic_version text NOT NULL DEFAULT 'v1';

ALTER TABLE public.interest_settings
  ADD COLUMN trend_window int NOT NULL DEFAULT 3,
  ADD COLUMN trend_min_delta int NOT NULL DEFAULT 8,
  ADD COLUMN context_messages int NOT NULL DEFAULT 20;

CREATE INDEX lead_interest_pending_idx ON public.lead_interest (pending_at) WHERE pending_at IS NOT NULL;