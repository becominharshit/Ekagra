-- =============================================================================
-- Ekagra: accountability partner and study groups (Milestone 15)
--
-- shared_stats       what each student shares (one row each): a display name, which numbers
--                    (focus minutes this week, study streak, plan done %, "studying now") and
--                    whether they appear on group leaderboards, with those numbers. A number
--                    they didn't choose to share must be empty (the checks below), so partners
--                    and group mates may read the row; nobody else can.
-- shared_stats_view  the same, with "studying now" worked out (and an old one hidden)
-- partner_invites    codes a student gives a friend to become accountability partners (7 days)
-- partner_links      partners, one row each way; removing either removes both
-- study_groups       groups (the owner made it) with a code to join
-- group_members      who is in each group
-- group_sessions     group focus: a member starts one, the others can join until it ends
-- nudges             short nudges between partners and group mates (3 a day to each friend)
--
-- Joining (a partner's code or a group's code) and leaving a group go through the functions
-- below, which check the code: students can't read other students' codes or add themselves.
-- Realtime: shared_stats, nudges, group_sessions, group_members and ai_anchors (the Studio
-- Bridge) send changes to the app as they happen; Realtime applies the same rules.
--
-- Tested by tests/db/phase1-migration.test.ts (npm test).
-- =============================================================================

-- A code to share: 10 characters from a random UUID (hard to guess).
create function public.new_invite_code() returns text
language sql volatile set search_path = ''
as $$ select upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10)) $$;


create table public.shared_stats (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null unique default auth.uid() references auth.users (id) on delete cascade,
  display_name    text not null default 'Student' check (btrim(display_name) <> '' and char_length(display_name) <= 40),
  share_focus     boolean not null default true,
  share_streak    boolean not null default true,
  share_plan      boolean not null default false,
  share_studying  boolean not null default true,
  on_leaderboard  boolean not null default false,
  week_start      date,         -- the week (Monday) the numbers are for
  focus_minutes   integer check (focus_minutes between 0 and 10080),
  streak_days     integer check (streak_days between 0 and 10000),
  plan_pct        smallint check (plan_pct between 0 and 100),
  studying_until  timestamptz,  -- in a focus session until then
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  check (share_focus or focus_minutes is null),
  check (share_streak or streak_days is null),
  check (share_plan or plan_pct is null),
  check (share_studying or studying_until is null),
  check (share_focus or not on_leaderboard)  -- the leaderboard ranks focus minutes
);

create table public.partner_invites (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  code        text not null unique default public.new_invite_code(),
  expires_at  timestamptz not null default now() + interval '7 days',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.partner_links (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  partner_id  uuid not null references auth.users (id) on delete cascade,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (user_id, partner_id),
  check (user_id <> partner_id)
);

create table public.study_groups (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users (id) on delete cascade,  -- the owner
  name         text not null check (btrim(name) <> '' and char_length(name) <= 60),
  invite_code  text not null unique default public.new_invite_code(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.group_members (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,
  group_id    uuid not null references public.study_groups (id) on delete cascade,
  role        text not null default 'member' check (role in ('owner', 'member')),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (group_id, user_id)
);

create table public.group_sessions (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,  -- who started it
  group_id    uuid not null references public.study_groups (id) on delete cascade,
  mode        text not null check (mode in ('pomodoro', 'deep', 'custom')),
  minutes     integer not null check (minutes between 5 and 180),
  starts_at   timestamptz not null default now(),
  ends_at     timestamptz not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (ends_at > starts_at)
);

create table public.nudges (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null default auth.uid() references auth.users (id) on delete cascade,  -- who sent it
  to_user_id  uuid not null references auth.users (id) on delete cascade,
  kind        text not null check (kind in ('study', 'cheer', 'checkin')),
  message     text check (char_length(message) <= 140),
  seen_at     timestamptz,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  check (user_id <> to_user_id)
);


-- -----------------------------------------------------------------------------
-- Who may see whom. These read the tables directly (security definer), so the rules below can
-- use them without the rules calling themselves.
-- -----------------------------------------------------------------------------

create function public.is_group_member(target uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.group_members m where m.group_id = target and m.user_id = (select auth.uid()))
$$;

-- Yourself, a partner (both ways) or someone in one of your groups.
create function public.is_connected(other uuid) returns boolean
language sql stable security definer set search_path = ''
as $$
  select other = (select auth.uid())
    or (
      exists (select 1 from public.partner_links l where l.user_id = (select auth.uid()) and l.partner_id = other)
      and exists (select 1 from public.partner_links l where l.user_id = other and l.partner_id = (select auth.uid()))
    )
    or exists (
      select 1
      from public.group_members mine
      join public.group_members theirs on theirs.group_id = mine.group_id
      where mine.user_id = (select auth.uid()) and theirs.user_id = other
    )
$$;


-- -----------------------------------------------------------------------------
-- Joining and leaving
-- -----------------------------------------------------------------------------

/** Accepts a friend's partner code: both become partners and the code is used up. Returns the friend's id. */
create function public.accept_partner_invite(code text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  invite record;
begin
  if me is null then
    raise exception 'Please sign in first.';
  end if;
  select i.id, i.user_id into invite from public.partner_invites i where i.code = upper(btrim(accept_partner_invite.code)) and i.expires_at > now();
  if not found then
    raise exception 'That code is wrong or has expired. Ask your friend for a new one.';
  end if;
  if invite.user_id = me then
    raise exception 'That is your own code: send it to your friend.';
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

/** Joins the group with this code (at most 30 students). Returns the group's id. */
create function public.join_group(code text) returns uuid
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  target uuid;
begin
  if me is null then
    raise exception 'Please sign in first.';
  end if;
  select g.id into target from public.study_groups g where g.invite_code = upper(btrim(join_group.code));
  if target is null then
    raise exception 'No group has that code. Check it with the group.';
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

/** Leaves a group. When the owner leaves, the member who joined first takes over; the last one out deletes it. */
create function public.leave_group(target uuid) returns void
language plpgsql security definer set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  heir uuid;
begin
  delete from public.group_members m where m.group_id = target and m.user_id = me;
  if not found then
    raise exception 'You are not in that group.';
  end if;
  if exists (select 1 from public.study_groups g where g.id = target and g.user_id = me) then
    select m.user_id into heir from public.group_members m where m.group_id = target order by m.created_at, m.id limit 1;
    if heir is null then
      delete from public.study_groups g where g.id = target;
    else
      update public.study_groups g set user_id = heir where g.id = target;
      update public.group_members m set role = 'owner' where m.group_id = target and m.user_id = heir;
    end if;
  end if;
end;
$$;

-- The one who makes a group is its first member.
create function public.add_group_owner() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.group_members (user_id, group_id, role) values (new.user_id, new.id, 'owner');
  return new;
end;
$$;

-- Partners are two rows (one each way): removing one removes the other.
create function public.drop_partner_mirror() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  delete from public.partner_links l where l.user_id = old.partner_id and l.partner_id = old.user_id;
  return old;
end;
$$;

-- At most 3 nudges a day from one student to the same friend.
create function public.limit_nudges() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if (select count(*) from public.nudges n where n.user_id = new.user_id and n.to_user_id = new.to_user_id and n.created_at > now() - interval '1 day') >= 3 then
    raise exception 'You can nudge a friend 3 times a day.';
  end if;
  return new;
end;
$$;

create trigger add_owner after insert on public.study_groups for each row execute function public.add_group_owner();
create trigger drop_mirror after delete on public.partner_links for each row execute function public.drop_partner_mirror();
create trigger limit_nudges before insert on public.nudges for each row execute function public.limit_nudges();


-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------

alter table public.shared_stats enable row level security;
alter table public.partner_invites enable row level security;
alter table public.partner_links enable row level security;
alter table public.study_groups enable row level security;
alter table public.group_members enable row level security;
alter table public.group_sessions enable row level security;
alter table public.nudges enable row level security;

-- Shared numbers: yourself, your partners and your group mates read them; only you write yours.
create policy shared_stats_select on public.shared_stats for select to authenticated using (public.is_connected(user_id));
create policy shared_stats_insert_own on public.shared_stats for insert to authenticated with check (user_id = (select auth.uid()));
create policy shared_stats_update_own on public.shared_stats for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy shared_stats_delete_own on public.shared_stats for delete to authenticated using (user_id = (select auth.uid()));

-- Partner codes: only your own (accepting one goes through accept_partner_invite).
create policy partner_invites_select_own on public.partner_invites for select to authenticated using (user_id = (select auth.uid()));
create policy partner_invites_insert_own on public.partner_invites for insert to authenticated with check (user_id = (select auth.uid()));
create policy partner_invites_delete_own on public.partner_invites for delete to authenticated using (user_id = (select auth.uid()));

-- Partners: you see and remove your own rows; they're only made by accept_partner_invite.
create policy partner_links_select_own on public.partner_links for select to authenticated using (user_id = (select auth.uid()));
create policy partner_links_delete_own on public.partner_links for delete to authenticated using (user_id = (select auth.uid()));

-- Groups: members see them (the owner always); the owner renames or deletes.
create policy study_groups_select on public.study_groups for select to authenticated
  using (user_id = (select auth.uid()) or public.is_group_member(id));
create policy study_groups_insert_own on public.study_groups for insert to authenticated with check (user_id = (select auth.uid()));
create policy study_groups_update_own on public.study_groups for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy study_groups_delete_own on public.study_groups for delete to authenticated using (user_id = (select auth.uid()));

-- Members: the group sees who's in it; you leave (leave_group), the owner removes. Joining goes through join_group.
create policy group_members_select on public.group_members for select to authenticated using (public.is_group_member(group_id));
create policy group_members_delete on public.group_members for delete to authenticated using (
  user_id = (select auth.uid())
  or exists (select 1 from public.study_groups g where g.id = group_id and g.user_id = (select auth.uid()))
);

-- Group focus: members see the group's sessions and start their own.
create policy group_sessions_select on public.group_sessions for select to authenticated using (public.is_group_member(group_id));
create policy group_sessions_insert_own on public.group_sessions for insert to authenticated
  with check (user_id = (select auth.uid()) and public.is_group_member(group_id));
create policy group_sessions_update_own on public.group_sessions for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));
create policy group_sessions_delete_own on public.group_sessions for delete to authenticated using (user_id = (select auth.uid()));

-- Nudges: sent to a partner or group mate; the sender and the receiver see them; the receiver
-- marks them seen (only seen_at can be changed, see the grants below); either can delete.
create policy nudges_select on public.nudges for select to authenticated
  using (user_id = (select auth.uid()) or to_user_id = (select auth.uid()));
create policy nudges_insert_own on public.nudges for insert to authenticated
  with check (user_id = (select auth.uid()) and to_user_id <> (select auth.uid()) and public.is_connected(to_user_id));
create policy nudges_update_received on public.nudges for update to authenticated
  using (to_user_id = (select auth.uid())) with check (to_user_id = (select auth.uid()));
create policy nudges_delete on public.nudges for delete to authenticated
  using (user_id = (select auth.uid()) or to_user_id = (select auth.uid()));

create trigger set_updated_at before update on public.shared_stats for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.partner_invites for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.partner_links for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.study_groups for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.group_members for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.group_sessions for each row execute function public.set_updated_at();
create trigger set_updated_at before update on public.nudges for each row execute function public.set_updated_at();

-- (shared_stats and partner_links are found by user_id through their unique indexes.)
create index partner_invites_user_idx on public.partner_invites (user_id);
create index partner_links_partner_idx on public.partner_links (partner_id);
create index study_groups_user_idx on public.study_groups (user_id);
create index group_members_user_idx on public.group_members (user_id);
create index group_sessions_group_idx on public.group_sessions (group_id, ends_at);
create index group_sessions_user_idx on public.group_sessions (user_id);
create index nudges_to_user_idx on public.nudges (to_user_id, created_at);
create index nudges_user_idx on public.nudges (user_id, to_user_id, created_at);

-- Only the receiver's "seen" can change on a nudge (updated_at is set by its trigger anyway).
revoke update on public.nudges from authenticated;
grant update (seen_at, updated_at) on public.nudges to authenticated;


-- -----------------------------------------------------------------------------
-- shared_stats_view: the shared numbers with "studying now" worked out. It runs with the reader's
-- rules (security_invoker), so it shows exactly the rows shared_stats lets them see.
-- -----------------------------------------------------------------------------

create view public.shared_stats_view with (security_invoker = true) as
select
  s.user_id,
  s.display_name,
  s.week_start,
  s.focus_minutes,
  s.streak_days,
  s.plan_pct,
  s.on_leaderboard,
  case when s.studying_until > now() then s.studying_until end as studying_until,
  coalesce(s.studying_until > now(), false) as studying_now,
  s.updated_at
from public.shared_stats s;


-- Like 001 (5d): signed-out visitors get no access.
revoke all on public.shared_stats, public.partner_invites, public.partner_links, public.study_groups, public.group_members,
  public.group_sessions, public.nudges, public.shared_stats_view from anon;
revoke execute on function public.accept_partner_invite(text), public.join_group(text), public.leave_group(uuid),
  public.is_connected(uuid), public.is_group_member(uuid) from public, anon;
grant execute on function public.accept_partner_invite(text), public.join_group(text), public.leave_group(uuid),
  public.is_connected(uuid), public.is_group_member(uuid) to authenticated;


-- -----------------------------------------------------------------------------
-- Realtime (on Supabase): these tables send their changes to the app as they happen.
-- -----------------------------------------------------------------------------

do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.shared_stats, public.nudges, public.group_sessions, public.group_members, public.ai_anchors;
  end if;
end;
$$;


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
