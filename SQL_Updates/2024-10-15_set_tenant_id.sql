-- Ustawia identyfikator najemcy (tenant_id) dla istniejących rekordów.
-- Przed uruchomieniem zastąp wartość zmiennej v_tenant własnym identyfikatorem UUID.

set search_path = public;

DO $$
DECLARE
 
  v_tenant uuid := '98cf6ea0-80c4-4d88-b81d-73f3c6e8b07e'; -- ← zmień, jeśli Twój domyślny tenant_id jest inny
 
BEGIN
  IF v_tenant IS NULL OR v_tenant = '00000000-0000-0000-0000-000000000000'::uuid THEN
    RAISE EXCEPTION USING MESSAGE = 'SET_VALID_TENANT_ID_BEFORE_EXECUTION';
  END IF;

  PERFORM set_config('app.default_tenant_id', v_tenant::text, false);

  UPDATE public.facilities
     SET tenant_id = v_tenant
   WHERE tenant_id IS DISTINCT FROM v_tenant;

  UPDATE public.amenities
     SET tenant_id = v_tenant
   WHERE tenant_id IS DISTINCT FROM v_tenant;

  UPDATE public.facility_amenities
     SET tenant_id = v_tenant
   WHERE tenant_id IS DISTINCT FROM v_tenant;

  UPDATE public.facility_checklist_items
     SET tenant_id = v_tenant
   WHERE tenant_id IS DISTINCT FROM v_tenant;

  UPDATE public.caretakers
     SET tenant_id = v_tenant
   WHERE tenant_id IS DISTINCT FROM v_tenant;

  UPDATE public.facility_caretakers
     SET tenant_id = v_tenant
   WHERE tenant_id IS DISTINCT FROM v_tenant;

  UPDATE public.event_types
     SET tenant_id = v_tenant
   WHERE tenant_id IS DISTINCT FROM v_tenant;

  UPDATE public.document_templates
     SET tenant_id = v_tenant
   WHERE tenant_id IS DISTINCT FROM v_tenant;

  UPDATE public.bookings
     SET tenant_id = v_tenant
   WHERE tenant_id IS DISTINCT FROM v_tenant;

  UPDATE public.booking_notification_events
     SET tenant_id = v_tenant
   WHERE tenant_id IS DISTINCT FROM v_tenant;
END;
$$;
