alter table if exists public.question_bank drop constraint if exists question_bank_type;
alter table if exists public.question_bank add constraint question_bank_type check (question_type in (
  'multiple-choice', 'numeric', 'short-answer', 'code-output', 'ordered-sequence', 'graph'
));
