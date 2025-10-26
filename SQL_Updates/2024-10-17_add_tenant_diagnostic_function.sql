-- Dodaje funkcję diagnostyczną pozwalającą na logowanie bieżącego kontekstu tenanta.
create or replace function public.log_current_tenant_context()
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tenant uuid;
  v_caretaker uuid;
  v_header text;
  v_claim text;
  v_default text;
  v_headers jsonb;
  v_claims jsonb;
  v_payload jsonb;
begin
  v_tenant := public.current_tenant_id();
  v_caretaker := public.current_caretaker_id();

  begin
    v_header := nullif(current_setting('request.header.x-tenant-id', true), '');
  exception when others then
    v_header := null;
  end;

  begin
    v_claim := nullif(coalesce(auth.jwt()->>'tenant_id', ''), '');
  exception when others then
    v_claim := null;
  end;

  begin
    v_default := nullif(current_setting('app.default_tenant_id', true), '');
  exception when others then
    v_default := null;
  end;

  begin
    v_headers := current_setting('request.headers', true)::jsonb;
  exception when others then
    v_headers := null;
  end;

  begin
    v_claims := current_setting('request.jwt.claims', true)::jsonb;
  exception when others then
    v_claims := null;
  end;

  if v_headers is not null then
    if v_headers ? 'authorization' then
      v_headers := v_headers - 'authorization';
    end if;
    if v_headers ? 'apikey' then
      v_headers := v_headers - 'apikey';
    end if;
  end if;

  v_payload := jsonb_build_object(
    'tenant_id', v_tenant,
    'header_tenant_id', v_header,
    'jwt_tenant_id', v_claim,
    'default_tenant_id', v_default,
    'caretaker_id', v_caretaker,
    'timestamp', now(),
    'headers', v_headers,
    'jwt_claims', v_claims
  );

  raise notice 'Tenant diagnostic: %', v_payload::text;

  return v_payload;
end;
$$;

grant execute on function public.log_current_tenant_context() to authenticated;
