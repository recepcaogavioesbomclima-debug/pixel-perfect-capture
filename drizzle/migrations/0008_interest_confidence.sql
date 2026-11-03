ALTER TABLE public.lead_interest ADD COLUMN IF NOT EXISTS confidence integer, ADD COLUMN IF NOT EXISTS previous_level text;
ALTER TABLE public.lead_interest_history ADD COLUMN IF NOT EXISTS confidence integer, ADD COLUMN IF NOT EXISTS previous_level text;
ALTER TABLE public.interest_settings ALTER COLUMN context_messages SET DEFAULT 200;
UPDATE public.interest_settings SET context_messages = 200 WHERE context_messages < 200;