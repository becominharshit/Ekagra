-- Allow Python, JavaScript, TypeScript, and SQL snippets in the Coding Lab.
alter table public.code_snippets
  drop constraint if exists code_snippets_language_check,
  add constraint code_snippets_language_check
    check (language in ('python', 'javascript', 'typescript', 'sql'));
