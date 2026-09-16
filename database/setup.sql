-- Run once in your Supabase project's SQL Editor.
create table if not exists public.finance_records (
 id uuid primary key,
 user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
 name text not null check (length(name) between 1 and 120),
 kind text not null check (kind in ('Cash','Stock','Crypto','Deposit','Property','Money lent','Mortgage','Loan','Debt','Salary','Rent income','Other income','Rent expense','Living expense','Charity','Other expense')),
 currency text not null check (currency in ('USD','UZS')),
 amount numeric not null check (amount>=0),
 quantity numeric not null default 1 check(quantity>=0),
 cost numeric not null default 0 check(cost>=0),
 rate numeric not null default 0 check(rate>=0),
 date date not null,
 frequency text not null default 'Once' check(frequency in ('Once','Monthly','Yearly')),
 notes text not null default '',
 created_at timestamptz not null default now()
);
alter table public.finance_records enable row level security;
create policy "Owners read their records" on public.finance_records for select to authenticated using ((select auth.uid())=user_id);
create policy "Owners create their records" on public.finance_records for insert to authenticated with check ((select auth.uid())=user_id);
create policy "Owners update their records" on public.finance_records for update to authenticated using ((select auth.uid())=user_id) with check ((select auth.uid())=user_id);
create policy "Owners delete their records" on public.finance_records for delete to authenticated using ((select auth.uid())=user_id);
revoke all on public.finance_records from anon;
grant select,insert,update,delete on public.finance_records to authenticated;
create index finance_records_user_date on public.finance_records(user_id,date desc);

-- Support separate lending dates and optional due dates.
alter table public.finance_records add column if not exists lent_date date;
alter table public.finance_records alter column date drop not null;
alter table public.finance_records add constraint finance_records_required_date check (kind = 'Money lent' or date is not null);
