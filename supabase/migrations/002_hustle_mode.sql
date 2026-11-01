-- =============================================================================
-- Ekagra: Hustle mode (Milestone 8)
--
-- 1. Part-time work and tutoring get their own hustle type and template (it used to be "custom").
-- 2. Each hustle keeps its links (portfolio, Upwork or Fiverr profile, channel, …): the
--    Launchpad opens them from the Hustle tab, e.g. [{"label": "Upwork", "url": "https://…"}].
-- =============================================================================

alter table public.hustles drop constraint hustles_type_check;
alter table public.hustles add constraint hustles_type_check
  check (type in ('freelancing', 'content', 'startup', 'parttime', 'custom'));

alter table public.hustles
  add column links jsonb not null default '[]'::jsonb
  constraint hustles_links_is_list check (jsonb_typeof(links) = 'array');
