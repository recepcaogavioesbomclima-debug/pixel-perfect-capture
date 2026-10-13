CREATE TABLE public.sla_settings (
  id boolean PRIMARY KEY DEFAULT true CHECK (id),
  first_response_s integer NOT NULL DEFAULT 120,
  ongoing_s integer NOT NULL DEFAULT 300,
  priority_s integer NOT NULL DEFAULT 60,
  warn_pct integer NOT NULL DEFAULT 50,
  critical_mult numeric NOT NULL DEFAULT 2,
  continuous boolean NOT NULL DEFAULT true,
  biz_start_hour integer NOT NULL DEFAULT 6,
  biz_end_hour integer NOT NULL DEFAULT 22,
  biz_days integer[] NOT NULL DEFAULT ARRAY[0,1,2,3,4,5,6],
  tz_offset_minutes integer NOT NULL DEFAULT -180,
  alerts_enabled boolean NOT NULL DEFAULT true,
  target_pct integer NOT NULL DEFAULT 90,
  attendant_targets jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO public.sla_settings (id) VALUES (true) ON CONFLICT DO NOTHING;
GRANT SELECT, UPDATE ON public.sla_settings TO authenticated;
GRANT ALL ON public.sla_settings TO service_role;
ALTER TABLE public.sla_settings ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Atendentes leem SLA config" ON public.sla_settings FOR SELECT TO authenticated USING (true);
CREATE POLICY "Atendentes editam SLA config" ON public.sla_settings FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

CREATE TABLE public.sla_cycles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone text NOT NULL,
  lead_id uuid,
  first_message_id uuid NOT NULL UNIQUE,
  kind text NOT NULL DEFAULT 'FIRST',
  priority boolean NOT NULL DEFAULT false,
  deadline_s integer NOT NULL,
  started_at timestamptz NOT NULL,
  last_in_at timestamptz NOT NULL,
  in_count integer NOT NULL DEFAULT 1,
  attendant_at_start text,
  first_auto_reply_at timestamptz,
  human_reply_at timestamptz,
  human_reply_by text,
  wait_s integer,
  alert_level integer NOT NULL DEFAULT 0,
  status text NOT NULL DEFAULT 'OPEN',
  final_status text,
  close_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX sla_cycles_one_open ON public.sla_cycles (phone) WHERE status = 'OPEN';
CREATE INDEX sla_cycles_started ON public.sla_cycles (started_at DESC);
GRANT SELECT ON public.sla_cycles TO authenticated;
GRANT ALL ON public.sla_cycles TO service_role;
ALTER TABLE public.sla_cycles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Atendentes leem ciclos SLA" ON public.sla_cycles FOR SELECT TO authenticated USING (true);

CREATE TABLE public.sla_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cycle_id uuid NOT NULL REFERENCES public.sla_cycles(id) ON DELETE CASCADE,
  phone text NOT NULL,
  event text NOT NULL,
  data jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX sla_events_cycle ON public.sla_events (cycle_id, created_at);
GRANT SELECT ON public.sla_events TO authenticated;
GRANT ALL ON public.sla_events TO service_role;
ALTER TABLE public.sla_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Atendentes leem eventos SLA" ON public.sla_events FOR SELECT TO authenticated USING (true);

CREATE OR REPLACE FUNCTION public.sla_elapsed(_from timestamptz, _to timestamptz)
RETURNS integer LANGUAGE plpgsql STABLE SET search_path TO 'public' AS $$
DECLARE s public.sla_settings; total numeric := 0; d date; ws timestamp; we timestamp; lf timestamp; lt timestamp;
BEGIN
  IF _to <= _from THEN RETURN 0; END IF;
  SELECT * INTO s FROM public.sla_settings WHERE id;
  IF s IS NULL OR s.continuous THEN RETURN floor(extract(epoch FROM _to - _from)); END IF;
  lf := (_from AT TIME ZONE 'UTC') + make_interval(mins => s.tz_offset_minutes);
  lt := (_to AT TIME ZONE 'UTC') + make_interval(mins => s.tz_offset_minutes);
  d := lf::date;
  WHILE d <= lt::date LOOP
    IF extract(dow FROM d)::int = ANY (s.biz_days) THEN
      ws := greatest(lf, d + make_interval(hours => s.biz_start_hour));
      we := least(lt, d + make_interval(hours => s.biz_end_hour));
      IF we > ws THEN total := total + extract(epoch FROM (we - ws)); END IF;
    END IF;
    d := d + 1;
  END LOOP;
  RETURN floor(total);
END $$;

CREATE OR REPLACE FUNCTION public.sla_on_message()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE s public.sla_settings; c public.sla_cycles; is_human boolean; confirmed boolean; att text; prio boolean; k text; dl integer; w integer;
BEGIN
  SELECT * INTO s FROM public.sla_settings WHERE id;
  SELECT assigned_name INTO att FROM public.contact_ai WHERE phone = NEW.phone;

  IF NEW.direction = 'IN' THEN
    IF TG_OP <> 'INSERT' THEN RETURN NEW; END IF;
    SELECT * INTO c FROM public.sla_cycles WHERE phone = NEW.phone AND status = 'OPEN';
    IF FOUND THEN
      UPDATE public.sla_cycles SET in_count = in_count + 1, last_in_at = greatest(last_in_at, NEW.created_at), updated_at = now() WHERE id = c.id;
      RETURN NEW;
    END IF;
    SELECT coalesce(hot, false) INTO prio FROM public.lead_interest WHERE phone = NEW.phone;
    prio := coalesce(prio, false);
    k := CASE WHEN EXISTS (SELECT 1 FROM public.messages m WHERE m.phone = NEW.phone AND m.direction = 'OUT'
            AND m.status IN ('SENT','DELIVERED','READ') AND (m.idempotency_key IS NULL OR m.idempotency_key LIKE 'inbox:%')) THEN 'ONGOING' ELSE 'FIRST' END;
    dl := CASE WHEN prio THEN s.priority_s WHEN k = 'FIRST' THEN s.first_response_s ELSE s.ongoing_s END;
    INSERT INTO public.sla_cycles (phone, lead_id, first_message_id, kind, priority, deadline_s, started_at, last_in_at, attendant_at_start)
    VALUES (NEW.phone, (SELECT id FROM public.leads WHERE phone = NEW.phone ORDER BY created_at DESC LIMIT 1), NEW.id, k, prio, dl, NEW.created_at, NEW.created_at, att)
    ON CONFLICT DO NOTHING RETURNING * INTO c;
    IF c.id IS NOT NULL THEN
      INSERT INTO public.sla_events (cycle_id, phone, event, data) VALUES (c.id, NEW.phone, 'OPEN', jsonb_build_object('kind', k, 'priority', prio, 'deadline_s', dl));
    END IF;
    RETURN NEW;
  END IF;

  confirmed := NEW.status IN ('SENT','DELIVERED','READ') AND (TG_OP = 'INSERT' OR OLD.status NOT IN ('SENT','DELIVERED','READ'));
  IF NOT confirmed THEN RETURN NEW; END IF;
  SELECT * INTO c FROM public.sla_cycles WHERE phone = NEW.phone AND status = 'OPEN';
  IF NOT FOUND THEN RETURN NEW; END IF;
  is_human := NEW.idempotency_key IS NULL OR NEW.idempotency_key LIKE 'inbox:%';
  IF is_human THEN
    w := public.sla_elapsed(c.started_at, now());
    UPDATE public.sla_cycles SET status = 'ANSWERED', human_reply_at = now(), human_reply_by = coalesce(att, 'Atendente'), wait_s = w,
      final_status = CASE WHEN w <= c.deadline_s THEN 'ON_TIME' WHEN w <= c.deadline_s * s.critical_mult THEN 'LATE' ELSE 'CRITICAL' END,
      updated_at = now() WHERE id = c.id;
    INSERT INTO public.sla_events (cycle_id, phone, event, data) VALUES (c.id, NEW.phone, 'ANSWERED', jsonb_build_object('wait_s', w, 'by', coalesce(att, 'Atendente'), 'message_id', NEW.id));
  ELSIF c.first_auto_reply_at IS NULL THEN
    UPDATE public.sla_cycles SET first_auto_reply_at = now(), updated_at = now() WHERE id = c.id;
    INSERT INTO public.sla_events (cycle_id, phone, event, data) VALUES (c.id, NEW.phone, 'AUTO_REPLY', jsonb_build_object('message_id', NEW.id));
  END IF;
  RETURN NEW;
END $$;

CREATE TRIGGER messages_sla AFTER INSERT OR UPDATE OF status ON public.messages FOR EACH ROW EXECUTE FUNCTION public.sla_on_message();

CREATE OR REPLACE FUNCTION public.sla_tick()
RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE s public.sla_settings; c record; e integer; lvl integer; n integer := 0;
BEGIN
  SELECT * INTO s FROM public.sla_settings WHERE id;
  FOR c IN SELECT * FROM public.sla_cycles WHERE status = 'OPEN' LOOP
    e := public.sla_elapsed(c.started_at, now());
    lvl := CASE WHEN e >= c.deadline_s * s.critical_mult THEN 3 WHEN e >= c.deadline_s THEN 2 WHEN e >= c.deadline_s * s.warn_pct / 100.0 THEN 1 ELSE 0 END;
    IF lvl > c.alert_level THEN
      UPDATE public.sla_cycles SET alert_level = lvl, updated_at = now() WHERE id = c.id;
      IF s.alerts_enabled THEN
        INSERT INTO public.sla_events (cycle_id, phone, event, data)
        VALUES (c.id, c.phone, CASE lvl WHEN 1 THEN 'WARN' WHEN 2 THEN 'BREACHED' ELSE 'CRITICAL' END,
          jsonb_build_object('elapsed_s', e, 'deadline_s', c.deadline_s));
      END IF;
      n := n + 1;
    END IF;
  END LOOP;
  RETURN n;
END $$;
GRANT EXECUTE ON FUNCTION public.sla_tick() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.sla_close(_phone text, _reason text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE c public.sla_cycles;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  UPDATE public.sla_cycles SET status = 'CLOSED', final_status = 'CLOSED', close_reason = left(coalesce(_reason, 'Encerrado'), 200),
    wait_s = public.sla_elapsed(started_at, now()), updated_at = now()
   WHERE phone = _phone AND status = 'OPEN' RETURNING * INTO c;
  IF c.id IS NULL THEN RETURN false; END IF;
  INSERT INTO public.sla_events (cycle_id, phone, event, data) VALUES (c.id, _phone, 'CLOSED', jsonb_build_object('reason', c.close_reason, 'by', auth.uid()));
  RETURN true;
END $$;
GRANT EXECUTE ON FUNCTION public.sla_close(text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.sla_on_assign()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE cid uuid;
BEGIN
  IF NEW.assigned_name IS DISTINCT FROM OLD.assigned_name THEN
    SELECT id INTO cid FROM public.sla_cycles WHERE phone = NEW.phone AND status = 'OPEN';
    IF cid IS NOT NULL THEN
      INSERT INTO public.sla_events (cycle_id, phone, event, data)
      VALUES (cid, NEW.phone, CASE WHEN NEW.assigned_name IS NULL THEN 'RELEASED' ELSE 'ASSIGNED' END, jsonb_build_object('from', OLD.assigned_name, 'to', NEW.assigned_name));
    END IF;
  END IF;
  RETURN NEW;
END $$;
CREATE TRIGGER contact_ai_sla AFTER UPDATE ON public.contact_ai FOR EACH ROW EXECUTE FUNCTION public.sla_on_assign();

ALTER PUBLICATION supabase_realtime ADD TABLE public.sla_events;