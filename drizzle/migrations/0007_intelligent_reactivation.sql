CREATE TABLE public.contact_commercial (
 phone text PRIMARY KEY, converted boolean NOT NULL DEFAULT false, plan_name text, opt_out boolean NOT NULL DEFAULT false, pending_task boolean NOT NULL DEFAULT false, manual_followup_at timestamptz, updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE ON public.contact_commercial TO authenticated;
GRANT ALL ON public.contact_commercial TO service_role;
ALTER TABLE public.contact_commercial ENABLE ROW LEVEL SECURITY;
CREATE POLICY commercial_read ON public.contact_commercial FOR SELECT TO authenticated USING (true);
CREATE POLICY commercial_insert ON public.contact_commercial FOR INSERT TO authenticated WITH CHECK (true);
CREATE POLICY commercial_update ON public.contact_commercial FOR UPDATE TO authenticated USING (true) WITH CHECK (true);
CREATE TABLE public.reactivation_campaigns (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), reference_date date NOT NULL, created_by uuid NOT NULL, status text NOT NULL DEFAULT 'ANALYZING' CHECK(status IN ('ANALYZING','READY','SENDING','COMPLETED','PAUSED','CANCELLED')), interval_seconds integer NOT NULL DEFAULT 5 CHECK(interval_seconds BETWEEN 5 AND 3600), next_at timestamptz NOT NULL DEFAULT now(), lease_token uuid, lease_until timestamptz, pause_reason text, authorized_by uuid, authorized_at timestamptz, created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.reactivation_campaigns TO authenticated;
GRANT ALL ON public.reactivation_campaigns TO service_role;
ALTER TABLE public.reactivation_campaigns ENABLE ROW LEVEL SECURITY;
CREATE POLICY campaigns_read ON public.reactivation_campaigns FOR SELECT TO authenticated USING (true);
CREATE TABLE public.reactivation_items (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), campaign_id uuid NOT NULL REFERENCES public.reactivation_campaigns(id), phone text NOT NULL, name text, decision text NOT NULL DEFAULT 'PENDING' CHECK(decision IN ('PENDING','REACTIVATE','REVIEW','DO_NOT_SEND','CONVERTED','OPT_OUT','BLOCKED')), confidence integer CHECK(confidence BETWEEN 0 AND 100), reason text, stage text, evidence jsonb NOT NULL DEFAULT '[]', snapshot jsonb NOT NULL DEFAULT '[]', last_message_id uuid, analyzed_at timestamptz, message text, status text NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING','ANALYZED','QUEUED','SENDING','SENT','BLOCKED','FAILED','UNKNOWN')), reviewed_by uuid, reviewed_at timestamptz, review_action text, provider_message_id text, error text, sent_at timestamptz, UNIQUE(campaign_id,phone)
);
GRANT SELECT ON public.reactivation_items TO authenticated;
GRANT ALL ON public.reactivation_items TO service_role;
ALTER TABLE public.reactivation_items ENABLE ROW LEVEL SECURITY;
CREATE POLICY items_read ON public.reactivation_items FOR SELECT TO authenticated USING (true);
CREATE TABLE public.reactivation_deliveries (phone text PRIMARY KEY, item_id uuid NOT NULL UNIQUE REFERENCES public.reactivation_items(id), reserved_at timestamptz NOT NULL DEFAULT now(), sent_at timestamptz);
GRANT ALL ON public.reactivation_deliveries TO service_role;
ALTER TABLE public.reactivation_deliveries ENABLE ROW LEVEL SECURITY;
CREATE TABLE public.reactivation_audit (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), campaign_id uuid REFERENCES public.reactivation_campaigns(id), item_id uuid REFERENCES public.reactivation_items(id), actor uuid, action text NOT NULL, data jsonb, created_at timestamptz NOT NULL DEFAULT now());
GRANT SELECT ON public.reactivation_audit TO authenticated;
GRANT ALL ON public.reactivation_audit TO service_role;
ALTER TABLE public.reactivation_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_read ON public.reactivation_audit FOR SELECT TO authenticated USING (true);
CREATE INDEX reactivation_due ON public.reactivation_campaigns(status,next_at);
CREATE INDEX reactivation_items_campaign ON public.reactivation_items(campaign_id,status);
CREATE OR REPLACE FUNCTION public.reactivation_block(_phone text, _last uuid DEFAULT NULL) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE c public.contact_commercial; ai public.contact_ai; latest uuid;
BEGIN
 SELECT * INTO c FROM public.contact_commercial WHERE phone=_phone;
 IF c.converted THEN RETURN 'CONVERTED'; END IF;
 IF c.opt_out THEN RETURN 'OPT_OUT'; END IF;
 SELECT * INTO ai FROM public.contact_ai WHERE phone=_phone;
 IF ai.assigned_to IS NOT NULL THEN RETURN 'HUMAN_ACTIVE'; END IF;
 IF ai.paused THEN RETURN 'CONTACT_PAUSED'; END IF;
 IF ai.pending_reply_at IS NOT NULL THEN RETURN 'CONVERSATION_ACTIVE'; END IF;
 IF c.pending_task THEN RETURN 'PENDING_TASK'; END IF;
 IF c.manual_followup_at IS NOT NULL THEN RETURN 'MANUAL_FOLLOWUP'; END IF;
 IF EXISTS(SELECT 1 FROM public.automation_executions WHERE phone=_phone AND status IN ('PENDING','WAITING','RUNNING','CONVERSING','PAUSED','TAKEN_OVER')) THEN RETURN 'AUTOMATION_ACTIVE'; END IF;
 IF EXISTS(SELECT 1 FROM public.sla_cycles WHERE phone=_phone AND status='OPEN') THEN RETURN 'CONVERSATION_ACTIVE'; END IF;
 IF EXISTS(SELECT 1 FROM public.reactivation_deliveries WHERE phone=_phone) THEN RETURN 'ALREADY_REACTIVATED'; END IF;
 IF _last IS NOT NULL THEN
 SELECT id INTO latest FROM public.messages WHERE phone=_phone ORDER BY created_at DESC,id DESC LIMIT 1;
 IF latest IS DISTINCT FROM _last THEN RETURN 'NEW_INTERACTION'; END IF;
 END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.reactivation_block(text,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reactivation_block(text,uuid) TO service_role;
CREATE OR REPLACE FUNCTION public.reactivation_create(_date date,_interval integer) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE cid uuid; start_at timestamptz; end_at timestamptz;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
 IF _date >= (now() AT TIME ZONE 'America/Sao_Paulo')::date THEN RAISE EXCEPTION 'Selecione um dia anterior a hoje'; END IF;
 IF _interval NOT BETWEEN 5 AND 3600 THEN RAISE EXCEPTION 'Intervalo inválido'; END IF;
 start_at := _date::timestamp AT TIME ZONE 'America/Sao_Paulo'; end_at := (_date+1)::timestamp AT TIME ZONE 'America/Sao_Paulo';
 INSERT INTO public.reactivation_campaigns(reference_date,created_by,interval_seconds) VALUES(_date,auth.uid(),_interval) RETURNING id INTO cid;
 INSERT INTO public.reactivation_items(campaign_id,phone,name,last_message_id)
 SELECT cid,m.phone,(SELECT name FROM public.leads l WHERE l.phone=m.phone ORDER BY l.created_at DESC LIMIT 1),(SELECT id FROM public.messages x WHERE x.phone=m.phone ORDER BY x.created_at DESC,x.id DESC LIMIT 1)
 FROM public.messages m WHERE m.created_at>=start_at AND m.created_at<end_at GROUP BY m.phone;
 UPDATE public.reactivation_items i SET decision='BLOCKED',status='ANALYZED',reason='Nova interação depois da data selecionada',analyzed_at=now() WHERE i.campaign_id=cid AND EXISTS(SELECT 1 FROM public.messages m WHERE m.phone=i.phone AND m.created_at>=end_at);
 INSERT INTO public.reactivation_audit(campaign_id,actor,action) VALUES(cid,auth.uid(),'ANALYSIS_REQUESTED');
 RETURN cid;
END $$;
CREATE OR REPLACE FUNCTION public.reactivation_control(_id uuid,_action text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE s text;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
 SELECT status INTO s FROM public.reactivation_campaigns WHERE id=_id FOR UPDATE;
 IF s IS NULL THEN RAISE EXCEPTION 'Campanha não encontrada'; END IF;
 IF _action='SEND' AND s='READY' THEN
 UPDATE public.reactivation_items SET status='QUEUED' WHERE campaign_id=_id AND decision='REACTIVATE' AND status='ANALYZED' AND coalesce(message,'')<>'';
 UPDATE public.reactivation_campaigns SET status='SENDING',authorized_by=auth.uid(),authorized_at=now(),next_at=now() WHERE id=_id;
 ELSIF _action='PAUSE' AND s IN ('ANALYZING','SENDING') THEN UPDATE public.reactivation_campaigns SET status='PAUSED',pause_reason='Pausada pelo consultor' WHERE id=_id;
 ELSIF _action='RESUME' AND s='PAUSED' THEN
 IF EXISTS(SELECT 1 FROM public.reactivation_items WHERE campaign_id=_id AND status IN ('UNKNOWN','SENDING')) THEN RAISE EXCEPTION 'Envio incerto exige conferência; retomada bloqueada'; END IF;
 UPDATE public.reactivation_campaigns SET status=CASE WHEN authorized_at IS NULL THEN 'ANALYZING' ELSE 'SENDING' END,pause_reason=NULL,next_at=now() WHERE id=_id;
 ELSIF _action='CANCEL' THEN UPDATE public.reactivation_campaigns SET status='CANCELLED' WHERE id=_id;
 ELSE RAISE EXCEPTION 'Ação indisponível'; END IF;
 INSERT INTO public.reactivation_audit(campaign_id,actor,action) VALUES(_id,auth.uid(),_action);
 RETURN true;
END $$;
CREATE OR REPLACE FUNCTION public.reactivation_review(_item uuid,_send boolean,_message text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE i public.reactivation_items; s text;
BEGIN
 IF auth.uid() IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;
 SELECT * INTO i FROM public.reactivation_items WHERE id=_item FOR UPDATE;
 SELECT status INTO s FROM public.reactivation_campaigns WHERE id=i.campaign_id;
 IF i.decision<>'REVIEW' OR s<>'READY' THEN RAISE EXCEPTION 'Revisão indisponível'; END IF;
 IF _send AND (length(trim(coalesce(_message,'')))=0 OR length(_message)>1500) THEN RAISE EXCEPTION 'Preencha a mensagem'; END IF;
 UPDATE public.reactivation_items SET decision=CASE WHEN _send THEN 'REACTIVATE' ELSE 'DO_NOT_SEND' END,message=CASE WHEN _send THEN _message ELSE message END,reviewed_by=auth.uid(),reviewed_at=now(),review_action=CASE WHEN _send THEN 'APPROVE' ELSE 'REJECT' END WHERE id=_item;
 INSERT INTO public.reactivation_audit(campaign_id,item_id,actor,action,data) VALUES(i.campaign_id,i.id,auth.uid(),'REVIEW',jsonb_build_object('send',_send));
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION public.reactivation_create(date,integer),public.reactivation_control(uuid,text),public.reactivation_review(uuid,boolean,text) FROM PUBLIC,anon;
GRANT EXECUTE ON FUNCTION public.reactivation_create(date,integer),public.reactivation_control(uuid,text),public.reactivation_review(uuid,boolean,text) TO authenticated;
CREATE OR REPLACE FUNCTION public.reactivation_claim(_token uuid) RETURNS SETOF public.reactivation_campaigns LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
BEGIN
 PERFORM pg_advisory_xact_lock(hashtext('reactivation-worker'));
 IF EXISTS(SELECT 1 FROM public.reactivation_campaigns WHERE lease_until>now()) THEN RETURN; END IF;
 RETURN QUERY UPDATE public.reactivation_campaigns SET lease_token=_token,lease_until=now()+interval '5 minutes'
 WHERE id=(SELECT id FROM public.reactivation_campaigns WHERE status IN ('ANALYZING','SENDING') AND next_at<=now() AND (lease_until IS NULL OR lease_until<now()) ORDER BY next_at LIMIT 1 FOR UPDATE SKIP LOCKED) RETURNING *;
END $$;
CREATE OR REPLACE FUNCTION public.reactivation_reserve(_item uuid,_token uuid) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public AS $$
DECLARE i public.reactivation_items; c public.reactivation_campaigns; b text;
BEGIN
 SELECT * INTO i FROM public.reactivation_items WHERE id=_item FOR UPDATE;
 SELECT * INTO c FROM public.reactivation_campaigns WHERE id=i.campaign_id FOR UPDATE;
 IF c.status<>'SENDING' OR c.authorized_at IS NULL OR c.lease_token IS DISTINCT FROM _token OR c.lease_until<now() OR i.status<>'QUEUED' OR i.decision<>'REACTIVATE' THEN RETURN 'NOT_AUTHORIZED'; END IF;
 b := public.reactivation_block(i.phone,i.last_message_id);
 IF b IS NOT NULL THEN UPDATE public.reactivation_items SET status='BLOCKED',reason=b WHERE id=_item; RETURN b; END IF;
 INSERT INTO public.reactivation_deliveries(phone,item_id) VALUES(i.phone,i.id) ON CONFLICT DO NOTHING;
 IF NOT FOUND THEN UPDATE public.reactivation_items SET status='BLOCKED',reason='ALREADY_REACTIVATED' WHERE id=_item; RETURN 'ALREADY_REACTIVATED'; END IF;
 UPDATE public.reactivation_items SET status='SENDING' WHERE id=_item;
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION public.reactivation_claim(uuid),public.reactivation_reserve(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.reactivation_claim(uuid),public.reactivation_reserve(uuid,uuid) TO service_role;