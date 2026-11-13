-- =============================================================================
-- Ekagra: Monetization, billing and per-tier AI entitlements (010_billing.sql)
--
-- subscriptions      one row per user linking their Stripe/Razorpay subscription and
--                    current plan tier (free | pro | campus). Users can SELECT their
--                    own row; only service_role (billing-webhook / admin) writes it.
-- plan_entitlements  per-tier AI & feature limits (daily requests, monthly tokens,
--                    Studio sources, Coding Lab languages, offline sync). Readable by
--                    authenticated users; written only by service_role.
-- webhook_events     idempotency and audit log for Stripe/Razorpay webhooks. Written and
--                    read only by service_role. Kept across account deletions so billing
--                    idempotency & financial audit trails remain intact.
--
-- Tested by tests/db/phase1-migration.test.ts (npm test).
-- =============================================================================

create table public.plan_entitlements (
  plan_tier            text primary key check (plan_tier in ('free', 'pro', 'campus')),
  daily_ai_requests    integer not null check (daily_ai_requests > 0),
  monthly_ai_tokens    integer not null check (monthly_ai_tokens > 0),
  max_studio_sources   integer not null check (max_studio_sources > 0),
  coding_lab_languages text[] not null default array['python']::text[],
  offline_sync_enabled boolean not null default false,
  priority_tier        text not null default 'standard' check (priority_tier in ('standard', 'priority')),
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now()
);

insert into public.plan_entitlements (
  plan_tier,
  daily_ai_requests,
  monthly_ai_tokens,
  max_studio_sources,
  coding_lab_languages,
  offline_sync_enabled,
  priority_tier
)
values
  ('free', 25, 250000, 5, array['python']::text[], false, 'standard'),
  ('pro', 250, 5000000, 200, array['python', 'javascript', 'typescript', 'sql']::text[], true, 'priority'),
  ('campus', 1000, 20000000, 1000, array['python', 'javascript', 'typescript', 'sql']::text[], true, 'priority')
on conflict (plan_tier) do nothing;

create table public.subscriptions (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid not null unique references auth.users (id) on delete cascade,
  provider             text not null check (provider in ('stripe', 'razorpay')),
  customer_id          text,
  subscription_id      text,
  plan_tier            text not null default 'free' references public.plan_entitlements (plan_tier),
  status               text not null default 'active' check (status in ('trialing', 'active', 'past_due', 'canceled', 'incomplete', 'expired')),
  current_period_end   timestamptz,
  cancel_at_period_end boolean not null default false,
  created_at           timestamptz not null default now(),
  updated_at           timestamptz not null default now(),
  unique (provider, subscription_id)
);

create table public.webhook_events (
  id           uuid primary key default gen_random_uuid(),
  provider     text not null check (provider in ('stripe', 'razorpay')),
  event_id     text not null,
  event_type   text not null,
  status       text not null default 'processed' check (status in ('processed', 'ignored', 'failed')),
  payload      jsonb not null default '{}'::jsonb,
  error        text check (char_length(error) <= 2000),
  processed_at timestamptz not null default now(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (provider, event_id)
);

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------

alter table public.plan_entitlements enable row level security;
create policy plan_entitlements_select_authenticated on public.plan_entitlements
  for select to authenticated using (true);

alter table public.subscriptions enable row level security;
create policy subscriptions_select_own on public.subscriptions
  for select to authenticated using (user_id = (select auth.uid()));

alter table public.webhook_events enable row level security;
create policy webhook_events_deny_authenticated on public.webhook_events
  for all to authenticated using (false) with check (false);

-- -----------------------------------------------------------------------------
-- Triggers & indexes
-- -----------------------------------------------------------------------------

create trigger set_updated_at before update on public.plan_entitlements
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.subscriptions
  for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.webhook_events
  for each row execute function public.set_updated_at();

create index subscriptions_user_id_idx on public.subscriptions (user_id);
create index subscriptions_provider_sub_idx on public.subscriptions (provider, subscription_id);
create index webhook_events_provider_event_idx on public.webhook_events (provider, event_id);

-- Signed-out visitors get no access; webhook_events is service_role only.
revoke all on public.plan_entitlements from anon;
revoke all on public.subscriptions from anon;
revoke all on public.webhook_events from anon, authenticated;

-- -----------------------------------------------------------------------------
-- Safety check (like 001, section 6): stop if any table in "public" has no RLS.
-- -----------------------------------------------------------------------------

do $$
declare
  missing text;
begin
  select string_agg(c.relname, ', ')
    into missing
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and not c.relrowsecurity;

  if missing is not null then
    raise exception 'RLS is not enabled on: %', missing;
  end if;
end;
$$;
