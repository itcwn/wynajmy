-- Polityki RLS dla bucketa Storage z obrazami obiektów.
-- Uruchom po utworzeniu bucketa "RentalObjectsImages" w projekcie Supabase.

set search_path = storage, public;

alter table storage.objects enable row level security;

-- Pozwala zalogowanym opiekunom wysyłać nowe zdjęcia do wyznaczonych katalogów.
drop policy if exists "Caretaker upload facility images" on storage.objects;
create policy "Caretaker upload facility images"
  on storage.objects
  for insert
  to authenticated
  with check (
    lower(bucket_id) = lower('RentalObjectsImages')
    and (
      coalesce(storage.foldername(name), '') like 'facility-%'
      or coalesce(storage.foldername(name), '') = 'new'
    )
  );

-- Pozwala zalogowanym opiekunom usuwać przesłane zdjęcia z tych samych katalogów.
drop policy if exists "Caretaker delete facility images" on storage.objects;
create policy "Caretaker delete facility images"
  on storage.objects
  for delete
  to authenticated
  using (
    lower(bucket_id) = lower('RentalObjectsImages')
    and (
      coalesce(storage.foldername(name), '') like 'facility-%'
      or coalesce(storage.foldername(name), '') = 'new'
    )
  );
