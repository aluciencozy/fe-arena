create table if not exists public.question_bank (
  id text primary key,
  topic_id text not null,
  question_type text not null,
  prompt text not null,
  explanation text not null,
  assumptions jsonb not null,
  provenance jsonb not null,
  difficulty text not null,
  content jsonb not null default '{}'::jsonb,
  schema_version integer not null default 3,
  published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint question_bank_id_format check (id ~ '^q-[a-z0-9-]+$'),
  constraint question_bank_topic check (topic_id in (
    'arrays-memory', 'linked-lists', 'stacks', 'queues', 'binary-trees',
    'avl-trees', 'heaps', 'hash-tables', 'tries', 'sorting', 'recursion',
    'analysis-mathematics'
  )),
  constraint question_bank_type check (question_type in (
    'multiple-choice', 'numeric', 'short-answer', 'code-output', 'ordered-sequence', 'graph'
  )),
  constraint question_bank_difficulty check (difficulty in ('intro', 'core', 'stretch')),
  constraint question_bank_assumptions_array check (jsonb_typeof(assumptions) = 'array'),
  constraint question_bank_provenance_object check (jsonb_typeof(provenance) = 'object')
);

comment on table public.question_bank is
  'Reviewed server-only question content. content includes type-specific fields and answer data; never expose rows to browsers.';
comment on column public.question_bank.content is
  'Extensible private payload: options, answer(s), tolerance, unit, C language/code/output, ordered items/answerOrder, and graph presentation and grading fields.';

create index if not exists question_bank_published_topic_idx
  on public.question_bank (published, topic_id, id);

alter table public.question_bank enable row level security;
alter table public.question_bank force row level security;
revoke all on table public.question_bank from public, anon, authenticated;
