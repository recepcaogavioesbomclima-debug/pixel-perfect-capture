GRANT SELECT ON public.inbound_alerts TO authenticated;
GRANT SELECT ON public.lead_interest TO authenticated;
GRANT ALL ON public.inbound_alerts TO service_role;
GRANT ALL ON public.lead_interest TO service_role;