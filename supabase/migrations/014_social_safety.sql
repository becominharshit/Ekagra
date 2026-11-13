-- =============================================================================
-- Ekagra: Social safety (user blocking, abuse reporting, invite validation)
--
-- blocked_users  one-way block record (user_id blocked blocked_user_id). Blocking
--                immediately dissolves any mutual partner_links, clears mutual
--                nudges, hides shared_stats via is_connected(), and prevents
--                accepting invites or joining shared study groups.
-- abuse_reports  user-submitted moderation reports (harassment, spam, etc.).
--                Users can insert and view their own submitted reports; only
--                service_role may update moderation status or purge on wipe.
-- =============================================================================

create table public.blocked_users (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null default auth.uid() references auth.users (id) on delete cascade,
  blocked_user_id  uuid not null references auth.users (id) on delete cascade,
  reason           text check (char_length(reason) <= 300),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  unique (user_id, blocked_user_id),
  check (user_id <> blocked_user_id)
);

create table public.abuse_reports (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users (id) on delete cascade,
  reported_user_id  uuid not null references auth.users (id) on delete cascade,
  category          text not null check (category in ('harassment', 'spam', 'inappropriate_content', 'impersonation', 'other')),
  context_type      text not null default 'partner' check (context_type in ('profile', 'partner', 'group', 'nudge')),
  context_id        uuid,
  details           text check (char_length(details) <= 2000),
  status            text not null default 'open' check (status in ('open', 'reviewed', 'resolved')),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  check (user_id <> reported_user_id)
);

create index blocked_users_blocked_idx on public.blocked_users (blocked_user_id);
create index abuse_reports_user_idx on public.abuse_reports (user_id, created_at desc);
create index abuse_reports_reported_idx on public.abuse_reports (reported_user_id, status);

create trigger set_updated_at before update on public.blocked_users for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.abuse_reports for each row execute function public.set_updated_at();

-- Invite format & validity guardrails.
alter table public.partner_invites
  add constraint partner_invites_expiry_check check (expires_at > created_at),
  add constraint partner_invites_code_len_check check (char_length(btrim(code)) >= 6);

alter table public.study_groups
  add constraint study_groups_code_len_check check (char_length(btrim(invite_code)) >= 6);

-- Helper: true if either student has blocked the other.
create or replace function public.has_block_between(a uuid, b uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (
    select 1
    from public.blocked_users blk
    where (blk.user_id = a and blk.blocked_user_id = b)
       or (blk.user_id = b and blk.blocked_user_id = a)
  )
$$;

-- Enforce mutual block exclusion inside is_connected() so shared_stats and nudges respect blocks.
create or replace function public.is_connected(other uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select other = (select auth.uid())
    or (
      not public.has_block_between((select auth.uid()), other)
      and (
        (
          exists (select 1 from public.partner_links l where l.user_id = (select auth.uid()) and l.partner_id = other)
          and exists (select 1 from public.partner_links l where l.user_id = other and l.partner_id = (select auth.uid()))
        )
        or exists (
          select 1
          from public.group_members mine
          join public.group_members theirs on theirs.group_id = mine.group_id
          where mine.user_id = (select auth.uid()) and theirs.user_id = other
        )
      )
    )
$$;

-- Hardened partner invite acceptance: validate code format, reject blocks, enforce partner limit.
create or replace function public.accept_partner_invite(code text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  normalized text := upper(regexp_replace(coalesce(accept_partner_invite.code, ''), '[\s-]+', '', 'g'));
  invite record;
begin
  if me is null then
    raise exception 'Please sign in first.';
  end if;
  if normalized !~ '^[0-9A-Z]{6,16}$' then
    raise exception 'Enter a valid invite code.';
  end if;
  select i.id, i.user_id into invite from public.partner_invites i where i.code = normalized and i.expires_at > now();
  if not found then
    raise exception 'That code is wrong or has expired. Ask your friend for a new one.';
  end if;
  if invite.user_id = me then
    raise exception 'That is your own code: send it to your friend.';
  end if;
  if public.has_block_between(me, invite.user_id) then
    raise exception 'This invite cannot be accepted.';
  end if;
  if exists (select 1 from public.partner_links l where l.user_id = me and l.partner_id = invite.user_id) then
    raise exception 'You are already partners.';
  end if;
  if (select count(*) from public.partner_links l where l.user_id = me) >= 5
    or (select count(*) from public.partner_links l where l.user_id = invite.user_id) >= 5 then
    raise exception 'A student can have at most 5 partners.';
  end if;
  insert into public.partner_links (user_id, partner_id) values (me, invite.user_id), (invite.user_id, me);
  delete from public.partner_invites where id = invite.id;
  return invite.user_id;
end;
$$;

-- Hardened group join: validate code format, block entry if any current member has a block link with caller.
create or replace function public.join_group(code text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  normalized text := upper(regexp_replace(coalesce(join_group.code, ''), '[\s-]+', '', 'g'));
  target uuid;
begin
  if me is null then
    raise exception 'Please sign in first.';
  end if;
  if normalized !~ '^[0-9A-Z]{6,16}$' then
    raise exception 'Enter a valid group code.';
  end if;
  select g.id into target from public.study_groups g where g.invite_code = normalized;
  if target is null then
    raise exception 'No group has that code. Check it with the group.';
  end if;
  if exists (select 1 from public.group_members gm where gm.group_id = target and public.has_block_between(me, gm.user_id)) then
    raise exception 'You cannot join this group because one of its members is unavailable.';
  end if;
  if exists (select 1 from public.group_members m where m.group_id = target and m.user_id = me) then
    raise exception 'You are already in that group.';
  end if;
  if (select count(*) from public.group_members m where m.group_id = target) >= 30 then
    raise exception 'That group is full (30 students).';
  end if;
  insert into public.group_members (user_id, group_id, role) values (me, target, 'member');
  return target;
end;
$$;

-- Blocking a user immediately breaks mutual partnerships and cleans direct nudges between the pair.
create or replace function public.handle_user_blocked() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.partner_links l
  where (l.user_id = new.user_id and l.partner_id = new.blocked_user_id)
     or (l.user_id = new.blocked_user_id and l.partner_id = new.user_id);

  delete from public.nudges n
  where (n.user_id = new.user_id and n.to_user_id = new.blocked_user_id)
     or (n.user_id = new.blocked_user_id and n.to_user_id = new.user_id);

  return new;
end;
$$;

create trigger after_user_blocked
  after insert on public.blocked_users
  for each row execute function public.handle_user_blocked();

-- Row Level Security
alter table public.blocked_users enable row level security;
alter table public.abuse_reports enable row level security;

create policy blocked_users_select_own on public.blocked_users for select to authenticated
  using (user_id = (select auth.uid()));
create policy blocked_users_insert_own on public.blocked_users for insert to authenticated
  with check (user_id = (select auth.uid()) and blocked_user_id <> (select auth.uid()));
create policy blocked_users_delete_own on public.blocked_users for delete to authenticated
  using (user_id = (select auth.uid()));

create policy abuse_reports_select_own on public.abuse_reports for select to authenticated
  using (user_id = (select auth.uid()));
create policy abuse_reports_insert_own on public.abuse_reports for insert to authenticated
  with check (user_id = (select auth.uid()) and reported_user_id <> (select auth.uid()));

revoke all on public.blocked_users, public.abuse_reports from anon;
revoke execute on function public.has_block_between(uuid, uuid) from public, anon;
grant execute on function public.has_block_between(uuid, uuid) to authenticated;

-- Safety check (like 001): ensure every table in "public" has RLS enabled.
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
