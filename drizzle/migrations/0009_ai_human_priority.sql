ALTER TABLE public.contact_ai
  ADD COLUMN IF NOT EXISTS ai_state text NOT NULL DEFAULT 'ACTIVE',
  ADD COLUMN IF NOT EXISTS paused_by_name text,
  ADD COLUMN IF NOT EXISTS paused_at timestamptz,
  ADD COLUMN IF NOT EXISTS pause_reason text,
  ADD COLUMN IF NOT EXISTS pause_epoch bigint NOT NULL DEFAULT 0;
UPDATE public.contact_ai SET ai_state = CASE WHEN assigned_to IS NOT NULL THEN 'PAUSED_HUMAN' ELSE 'PAUSED_MANAGER' END, pause_reason = COALESCE(pause_reason,'Pausa anterior') WHERE paused;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS sender text;

CREATE TABLE public.ai_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  action text NOT NULL,
  actor text,
  reason text,
  data jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX ai_events_phone_idx ON public.ai_events(phone, created_at DESC);
GRANT SELECT ON public.ai_events TO authenticated;
GRANT ALL ON public.ai_events TO service_role;
ALTER TABLE public.ai_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Attendants read ai events" ON public.ai_events FOR SELECT TO authenticated USING (true);

-- Pausa atômica: incrementa a época (invalida respostas já geradas), cancela filas da conversa.
CREATE OR REPLACE FUNCTION public.ai_pause(_phone text, _kind text, _reason text)
RETURNS TABLE (changed boolean, ai_state text, paused_by_name text, paused_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); nm text := COALESCE(auth.jwt()->>'email','Atendente'); st text; was boolean;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF _kind NOT IN ('HUMAN','MANAGER') THEN RAISE EXCEPTION 'invalid kind'; END IF;
  st := CASE WHEN _kind='MANAGER' THEN 'PAUSED_MANAGER' ELSE 'PAUSED_HUMAN' END;
  INSERT INTO public.contact_ai (phone) VALUES (_phone) ON CONFLICT (phone) DO NOTHING;
  SELECT c.paused INTO was FROM public.contact_ai c WHERE c.phone=_phone FOR UPDATE;
  UPDATE public.contact_ai c SET paused=true, ai_state=st, pending_reply_at=NULL, pause_epoch=c.pause_epoch+1,
    paused_by_name=CASE WHEN was THEN c.paused_by_name ELSE nm END,
    paused_at=CASE WHEN was THEN c.paused_at ELSE now() END,
    pause_reason=CASE WHEN was AND _kind='HUMAN' THEN c.pause_reason ELSE left(_reason,200) END,
    updated_at=now()
  WHERE c.phone=_phone;
  UPDATE public.automation_executions SET pending_reply_at=NULL WHERE phone=_phone AND pending_reply_at IS NOT NULL;
  UPDATE public.messages SET status='CANCELLED', error='Cancelada: atendimento humano'
    WHERE phone=_phone AND direction='OUT' AND status='PENDING' AND COALESCE(sender,'') IN ('AI','AUTOMATION');
  IF NOT was THEN
    INSERT INTO public.ai_events(phone,action,actor,reason) VALUES (_phone, CASE WHEN _kind='MANAGER' THEN 'MANAGER_PAUSE' ELSE 'HUMAN_PAUSE' END, nm, left(_reason,200));
  END IF;
  RETURN QUERY SELECT NOT COALESCE(was,false), c.ai_state, c.paused_by_name, c.paused_at FROM public.contact_ai c WHERE c.phone=_phone;
END $$;

CREATE OR REPLACE FUNCTION public.ai_reactivate(_phone text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE uid uuid := auth.uid(); nm text := COALESCE(auth.jwt()->>'email','Atendente');
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  UPDATE public.contact_ai c SET paused=false, ai_state='ACTIVE', assigned_to=NULL, assigned_name=NULL, assigned_at=NULL,
    paused_by_name=NULL, paused_at=NULL, pause_reason=NULL, pause_epoch=c.pause_epoch+1, pending_reply_at=NULL, updated_at=now()
  WHERE c.phone=_phone AND c.paused;
  IF NOT FOUND THEN RETURN false; END IF;
  INSERT INTO public.ai_events(phone,action,actor,reason) VALUES (_phone,'REACTIVATED',nm,'Reativação manual');
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.ai_pause(text,text,text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.ai_reactivate(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.ai_pause(text,text,text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.ai_reactivate(text) TO authenticated;

ALTER PUBLICATION supabase_realtime ADD TABLE public.ai_events;