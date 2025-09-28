-- Aktualizacja dodająca politykę RLS umożliwiającą składanie rezerwacji przez anonimowych użytkowników.
-- Uruchom w środowisku produkcyjnym po wdrożeniu zmian w aplikacji.

set search_path = public;

alter table public.bookings enable row level security;

drop policy if exists "Anonymous can create pending bookings" on public.bookings;
create policy "Anonymous can create pending bookings"
  on public.bookings
  for insert
  to anon
  with check (
    status = 'pending'
    and is_public = true
    and decision_comment is null
    and cancelled_at is null
  );

drop policy if exists "Authenticated manage bookings" on public.bookings;
create policy "Authenticated manage bookings"
  on public.bookings
  for all
  to authenticated
  using (true)
  with check (true);
