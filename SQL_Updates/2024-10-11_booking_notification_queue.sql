-- Tworzy kolejkę zdarzeń powiadomień o rezerwacjach oraz funkcje pomocnicze do jej obsługi.

create table if not exists public.booking_notification_events (
  id uuid primary key default gen_random_uuid(),
  event_type text not null check (event_type in (
    'booking_created',
    'booking_status_decided',
    'booking_cancelled_by_renter'
  )),
  booking_id uuid,
  cancel_token uuid,
  metadata jsonb,
  status text not null default 'pending' check (status in ('pending', 'processing', 'succeeded', 'failed', 'exhausted')),
  attempts integer not null default 0,
  max_attempts integer not null default 5 check (max_attempts > 0),
  last_attempt_at timestamptz,
  processed_at timestamptz,
  last_error text,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists booking_notification_events_status_created_idx
  on public.booking_notification_events (status, created_at);

alter table public.booking_notification_events enable row level security;

revoke all on public.booking_notification_events from public;
revoke all on public.booking_notification_events from anon;
revoke all on public.booking_notification_events from authenticated;
grant select, insert, update, delete on public.booking_notification_events to service_role;

create or replace function public.enqueue_booking_notification(
  p_event_type text,
  p_booking_id uuid default null,
  p_cancel_token uuid default null,
  p_metadata jsonb default null,
  p_max_attempts integer default 5
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_event_id uuid;
  v_metadata jsonb;
  v_max_attempts integer;
begin
  if p_event_type is null then
    raise exception 'event_type is required';
  end if;
  if p_event_type not in ('booking_created', 'booking_status_decided', 'booking_cancelled_by_renter') then
    raise exception 'unsupported event_type %', p_event_type;
  end if;
  if p_booking_id is null and p_cancel_token is null then
    raise exception 'booking_id or cancel_token is required';
  end if;
  v_metadata := coalesce(p_metadata, '{}'::jsonb);
  v_max_attempts := greatest(1, coalesce(p_max_attempts, 5));

  insert into public.booking_notification_events (
    event_type,
    booking_id,
    cancel_token,
    metadata,
    max_attempts
  ) values (
    p_event_type,
    p_booking_id,
    p_cancel_token,
    v_metadata,
    v_max_attempts
  ) returning id into v_event_id;

  return v_event_id;
end;
$$;

grant execute on function public.enqueue_booking_notification(text, uuid, uuid, jsonb, integer) to anon;
grant execute on function public.enqueue_booking_notification(text, uuid, uuid, jsonb, integer) to authenticated;

drop function if exists public.dequeue_booking_notification_events(integer);
create or replace function public.dequeue_booking_notification_events(
  p_limit integer default 10
) returns setof public.booking_notification_events
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
    with candidate as (
      select id
      from public.booking_notification_events
      where status in ('pending', 'failed')
        and attempts < coalesce(max_attempts, 5)
      order by created_at
      limit greatest(1, coalesce(p_limit, 10))
      for update skip locked
    )
    update public.booking_notification_events src
    set status = 'processing',
        attempts = src.attempts + 1,
        last_attempt_at = timezone('utc', now())
    from candidate
    where src.id = candidate.id
    returning src.*;
end;
$$;

grant execute on function public.dequeue_booking_notification_events(integer) to service_role;

drop function if exists public.reset_booking_notification_event(uuid);
create or replace function public.reset_booking_notification_event(
  p_event_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.booking_notification_events
  set status = 'pending',
      attempts = 0,
      last_attempt_at = null,
      processed_at = null,
      last_error = null
  where id = p_event_id;
end;
$$;

grant execute on function public.reset_booking_notification_event(uuid) to service_role;
