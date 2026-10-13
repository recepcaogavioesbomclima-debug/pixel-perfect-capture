ALTER TABLE public.contact_ai
  ADD COLUMN assigned_to uuid,
  ADD COLUMN assigned_name text,
  ADD COLUMN assigned_at timestamptz;

CREATE TABLE public.inbound_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL UNIQUE REFERENCES public.messages(id) ON DELETE CASCADE,
  phone text NOT NULL,
  contact_name text,
  preview text,
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX inbound_alerts_received_idx ON public.inbound_alerts (received_at DESC);
GRANT SELECT ON public.inbound_alerts TO authenticated;
GRANT ALL ON public.inbound_alerts TO service_role;
ALTER TABLE public.inbound_alerts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Atendentes leem alertas" ON public.inbound_alerts FOR SELECT TO authenticated USING (true);

CREATE TABLE public.handoff_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  user_id uuid NOT NULL,
  user_name text,
  action text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.handoff_log TO service_role;
ALTER TABLE public.handoff_log ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.create_inbound_alert()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NEW.direction = 'IN' THEN
    INSERT INTO public.inbound_alerts (message_id, phone, contact_name, preview, received_at)
    VALUES (
      NEW.id, NEW.phone,
      (SELECT name FROM public.leads WHERE phone = NEW.phone AND name IS NOT NULL ORDER BY created_at DESC LIMIT 1),
      left(coalesce(NEW.content, ''), 280),
      NEW.created_at
    )
    ON CONFLICT (message_id) DO NOTHING;
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER messages_inbound_alert AFTER INSERT ON public.messages
FOR EACH ROW EXECUTE FUNCTION public.create_inbound_alert();

-- Assumir: atomico, apenas um atendente por conversa
CREATE OR REPLACE FUNCTION public.claim_conversation(_phone text, _name text)
RETURNS TABLE (ok boolean, assigned_to uuid, assigned_name text, assigned_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid();
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  INSERT INTO public.contact_ai (phone) VALUES (_phone) ON CONFLICT (phone) DO NOTHING;
  UPDATE public.contact_ai c
     SET assigned_to = uid, assigned_name = _name, assigned_at = now(),
         paused = true, pending_reply_at = NULL, updated_at = now()
   WHERE c.phone = _phone AND c.assigned_to IS NULL;
  IF FOUND THEN
    INSERT INTO public.handoff_log (phone, user_id, user_name, action) VALUES (_phone, uid, _name, 'CLAIM');
  END IF;
  RETURN QUERY SELECT (c.assigned_to = uid), c.assigned_to, c.assigned_name, c.assigned_at
    FROM public.contact_ai c WHERE c.phone = _phone;
END $$;

CREATE OR REPLACE FUNCTION public.release_conversation(_phone text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); nm text;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  UPDATE public.contact_ai
     SET assigned_to = NULL, assigned_name = NULL, assigned_at = NULL,
         paused = false, pending_reply_at = NULL, updated_at = now()
   WHERE phone = _phone AND assigned_to = uid
   RETURNING assigned_name INTO nm;
  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO public.handoff_log (phone, user_id, user_name, action) VALUES (_phone, uid, NULL, 'RELEASE');
  RETURN true;
END $$;

REVOKE ALL ON FUNCTION public.claim_conversation(text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.release_conversation(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.claim_conversation(text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.release_conversation(text) TO authenticated;
REVOKE ALL ON FUNCTION public.create_inbound_alert() FROM PUBLIC, anon, authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE public.inbound_alerts;