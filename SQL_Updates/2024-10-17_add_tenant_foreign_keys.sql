-- Dodaje brakujące klucze obce z kolumn tenant_id do tabeli public.tenants
-- w istniejącej bazie danych. Skrypt jest idempotentny i pominie tabele lub
-- kolumny, które nie są dostępne w środowisku.

set search_path = public;

DO $$
DECLARE
  target record;
  v_table regclass;
  v_attnum int2;
BEGIN
  FOR target IN
    SELECT *
    FROM (VALUES
      ('facilities', 'facilities_tenant_fk', 'tenant_id'),
      ('amenities', 'amenities_tenant_fk', 'tenant_id'),
      ('facility_amenities', 'facility_amenities_tenant_fk', 'tenant_id'),
      ('facility_checklist_items', 'facility_checklist_items_tenant_fk', 'tenant_id'),
      ('caretakers', 'caretakers_tenant_fk', 'tenant_id'),
      ('facility_caretakers', 'facility_caretakers_tenant_fk', 'tenant_id'),
      ('event_types', 'event_types_tenant_fk', 'tenant_id'),
      ('document_templates', 'document_templates_tenant_fk', 'tenant_id'),
      ('bookings', 'bookings_tenant_fk', 'tenant_id'),
      ('booking_notification_events', 'booking_notification_events_tenant_fk', 'tenant_id')
    ) AS t(table_name, constraint_name, column_name)
  LOOP
    v_table := to_regclass(format('public.%I', target.table_name));
    IF v_table IS NULL THEN
      CONTINUE;
    END IF;

    SELECT attnum::int2
      INTO v_attnum
      FROM pg_attribute
     WHERE attrelid = v_table
       AND attname = target.column_name
       AND attisdropped = false
     LIMIT 1;

    IF v_attnum IS NULL THEN
      CONTINUE;
    END IF;

    IF NOT EXISTS (
      SELECT 1
        FROM pg_constraint c
       WHERE c.conrelid = v_table
         AND c.contype = 'f'
         AND c.confrelid = 'public.tenants'::regclass
         AND c.conkey = ARRAY[v_attnum]
    ) THEN
      EXECUTE format(
        'alter table public.%I add constraint %I foreign key (%I) references public.tenants(id)',
        target.table_name,
        target.constraint_name,
        target.column_name
      );
    END IF;
  END LOOP;
END;
$$;
