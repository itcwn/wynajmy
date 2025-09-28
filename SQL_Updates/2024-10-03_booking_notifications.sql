-- Dodaje funkcję public.get_booking_notification_payload wykorzystywaną przez powiadomienia e-mail.
-- Uruchom w środowisku produkcyjnym po wdrożeniu funkcji wysyłki powiadomień.

set search_path = public;

create or replace function public.get_booking_notification_payload(
  p_booking_id uuid default null,
  p_cancel_token uuid default null
)
returns jsonb
language sql
security definer
set search_path = public
as $$
  with target as (
    select
      b.id,
      b.facility_id,
      b.title,
      b.start_time,
      b.end_time,
      b.status,
      b.renter_name,
      b.renter_email,
      b.notes,
      b.cancel_token,
      b.created_at,
      b.updated_at,
      f.name as facility_name,
      f.city,
      f.postal_code,
      f.address_line1,
      f.address_line2,
      f.rental_rules_url,
      f.price_list_url,
      f.caretaker_instructions
    from public.bookings b
    join public.facilities f on f.id = b.facility_id
    where (
        p_booking_id is not null
        and b.id = p_booking_id
      )
      or (
        p_cancel_token is not null
        and b.cancel_token = p_cancel_token
      )
    order by b.updated_at desc
    limit 1
  ),
  caretakers as (
    select jsonb_agg(
        jsonb_build_object(
          'id', c.id,
          'first_name', c.first_name,
          'last_name_or_company', c.last_name_or_company,
          'email', c.email,
          'phone', c.phone,
          'login', c.login
        )
        order by c.first_name, c.last_name_or_company
      ) as items
    from target t
    left join public.facility_caretakers fc on fc.facility_id = t.facility_id
    left join public.caretakers c on c.id = fc.caretaker_id
  )
  select jsonb_build_object(
      'booking', jsonb_build_object(
        'id', t.id,
        'facility_id', t.facility_id,
        'title', t.title,
        'start_time', t.start_time,
        'end_time', t.end_time,
        'status', t.status,
        'renter_name', t.renter_name,
        'renter_email', t.renter_email,
        'notes', t.notes,
        'cancel_token', t.cancel_token,
        'created_at', t.created_at,
        'updated_at', t.updated_at
      ),
      'facility', jsonb_build_object(
        'id', t.facility_id,
        'name', t.facility_name,
        'city', t.city,
        'postal_code', t.postal_code,
        'address_line1', t.address_line1,
        'address_line2', t.address_line2,
        'rental_rules_url', t.rental_rules_url,
        'price_list_url', t.price_list_url,
        'caretaker_instructions', t.caretaker_instructions
      ),
      'caretakers', coalesce(c.items, '[]'::jsonb)
    )
  from target t
  left join caretakers c on true;
$$;

grant execute on function public.get_booking_notification_payload(uuid, uuid) to authenticated;
