-- FE Arena question-bank publishing policy v2.
-- Retired prompts remain queryable to server-side history, but are excluded by
-- the published loader. This migration is additive and never deletes rows.
alter table if exists public.question_bank
  add column if not exists version integer not null default 1;

alter table if exists public.question_bank
  drop constraint if exists question_bank_version_positive;
alter table if exists public.question_bank
  add constraint question_bank_version_positive check (version > 0);

alter table if exists public.question_bank
  alter column schema_version set default 5;

create index if not exists question_bank_published_version_idx
  on public.question_bank (published, version, id);

comment on column public.question_bank.version is
  'Monotonic authored content version; retired versions remain for history and are not selected for new play.';
comment on column public.question_bank.published is
  'Reviewed publication flag. False retires content without destructive deletion.';
EOF