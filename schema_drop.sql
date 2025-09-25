-- Resetuje schemat public usuwając wszystkie obiekty (tabele, funkcje, trigery itp.).
-- Po uruchomieniu ponownie zastosuj schema.sql lub inne skrypty odtwarzające strukturę bazy.

begin;

-- Usuń rozszerzenia zależne od schematu public (np. pgcrypto).
drop extension if exists "pgcrypto" cascade;

-- Usuń cały schemat wraz z powiązanymi obiektami.
drop schema if exists public cascade;

-- Utwórz ponownie pusty schemat public.
create schema public;

-- Przywróć standardowe uprawnienia dla schematu public.
grant usage on schema public to public;
grant all on schema public to postgres, pg_database_owner;

commit;
