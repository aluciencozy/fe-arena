-- FE Arena browser-only C practice questions. This forward migration follows the
-- corrected account-history migration and leaves prior migrations immutable.
alter table if exists public.question_bank drop constraint if exists question_bank_type;
alter table if exists public.question_bank add constraint question_bank_type check (question_type in (
  'multiple-choice', 'numeric', 'short-answer', 'code-output', 'ordered-sequence', 'graph', 'coding'
));
alter table if exists public.question_bank alter column schema_version set default 4;

comment on column public.question_bank.content is
  'Extensible private payload: answer data for server-graded types; coding problems contain only reviewed browser compiler fixtures and are never executed by the server.';
