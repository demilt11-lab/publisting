create table if not exists public.external_link_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  url text not null,
  host text,
  category text,
  label text,
  context text,
  status text,
  fallback_used boolean not null default false,
  fallback_url text,
  reason text,
  user_agent text,
  created_at timestamptz not null default now()
);
create index if not exists external_link_events_created_at_idx on public.external_link_events (created_at desc);
create index if not exists external_link_events_host_idx on public.external_link_events (host);
create index if not exists external_link_events_status_idx on public.external_link_events (status);
alter table public.external_link_events enable row level security;
create policy "anyone can insert link events"
  on public.external_link_events for insert
  to anon, authenticated
  with check (true);
create policy "admins can read link events"
  on public.external_link_events for select
  to authenticated
  using (public.has_role(auth.uid(), 'admin'));