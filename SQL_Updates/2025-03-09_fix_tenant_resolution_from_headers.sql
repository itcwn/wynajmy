-- Aktualizuje funkcje odpowiedzialne za ustalanie bieżącego kontekstu tenanta i opiekuna
-- tak, aby oprócz zmiennych GUC `request.header.*` korzystały także z `request.headers`.
-- Dzięki temu nagłówki niestandardowe przekazywane przez Supabase/PostgREST są
-- poprawnie rozpoznawane niezależnie od konfiguracji serwera.

create or replace function public.current_tenant_id()
returns uuid
language plpgsql
stable
as $$
declare
  header text;
  headers jsonb;
  claim text;
begin
  begin
    header := nullif(current_setting('request.header.x-tenant-id', true), '');
  exception when others then
    header := null;
  end;

  if header is null then
    begin
      headers := current_setting('request.headers', true)::jsonb;
      if headers is not null then
        select value
          into header
          from jsonb_each_text(headers)
         where lower(key) = 'x-tenant-id'
         limit 1;
      end if;
    exception when others then
      header := null;
    end;
  end if;

  if header is not null then
    begin
      return header::uuid;
    exception when others then
      null;
    end;
  end if;

  begin
    claim := nullif(coalesce(auth.jwt()->>'tenant_id', ''), '');
    if claim is not null then
      return claim::uuid;
    end if;
  exception when others then
    null;
  end;

  header := null;
  begin
    header := nullif(current_setting('app.default_tenant_id', true), '');
  exception when others then
    header := null;
  end;

  if header is not null then
    begin
      return header::uuid;
    exception when others then
      null;
    end;
  end if;

  return null;
end;
$$;

grant execute on function public.current_tenant_id() to anon, authenticated;

create or replace function public.current_caretaker_id()
returns uuid
language plpgsql
stable
as $$
declare
  header text;
  headers jsonb;
  uid uuid;
  tenant uuid;
begin
  tenant := public.current_tenant_id();

  uid := auth.uid();
  if uid is not null then
    if tenant is null then
      return uid;
    end if;
    if exists (
      select 1
      from public.caretakers c
      where c.id = uid
        and c.tenant_id = tenant
    ) then
      return uid;
    end if;
  end if;

  begin
    header := nullif(current_setting('request.header.x-caretaker-id', true), '');
  exception when others then
    header := null;
  end;

  if header is null then
    begin
      headers := current_setting('request.headers', true)::jsonb;
      if headers is not null then
        select value
          into header
          from jsonb_each_text(headers)
         where lower(key) = 'x-caretaker-id'
         limit 1;
      end if;
    exception when others then
      header := null;
    end;
  end if;

  if header is not null then
    begin
      if tenant is null then
        return header::uuid;
      end if;
      select c.id
        into uid
      from public.caretakers c
      where c.id = header::uuid
        and c.tenant_id = tenant
      limit 1;
      return uid;
    exception when others then
      return null;
    end;
  end if;

  return null;
end;
$$;

grant execute on function public.current_caretaker_id() to anon, authenticated;

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
  v_caretaker_header text;
  v_claim text;
  v_default text;
  v_headers jsonb;
  v_claims jsonb;
  v_payload jsonb;
begin
  v_tenant := public.current_tenant_id();
  v_caretaker := public.current_caretaker_id();

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

  if v_headers is not null then
    select value
      into v_header
      from jsonb_each_text(v_headers)
     where lower(key) = 'x-tenant-id'
     limit 1;
  end if;

  if v_headers is not null and v_caretaker_header is null then
    select value
      into v_caretaker_header
      from jsonb_each_text(v_headers)
     where lower(key) = 'x-caretaker-id'
     limit 1;
  end if;

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
    'header_caretaker_id', v_caretaker_header,
    'timestamp', now(),
    'headers', v_headers,
    'jwt_claims', v_claims
  );

  raise notice 'Tenant diagnostic: %', v_payload::text;

  return v_payload;
end;
$$;

grant execute on function public.log_current_tenant_context() to authenticated;
