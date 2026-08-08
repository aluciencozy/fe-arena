# FE Arena question-bank review policy

## Difficulty rubric

- **Intro**: one-step vocabulary, direct formula substitution, or a single invariant with no competing state. Intro material is retained for terminal history and audit, but is not published for new selection in version 2.
- **Core**: combines two operations, requires a short invariant argument, or traces a nontrivial but linear case. Core items remain published after schema and answer review.
- **Stretch**: requires aliasing/pointer state, control-flow unwinding, edge-case handling, competing graph paths, or a multi-step algorithmic invariant. Stretch items are preferred for authored additions and browser coding rounds.

## Publication and retirement

The source bank remains append-only. `backend/src/data/questions.ts` marks all legacy `intro` prompts as `published: false` while retaining their IDs and answers. The loader and deterministic selector exclude unpublished rows; the Supabase seed upserts the structured repository bank and retires legacy `q-fe-*` rows without deleting them. New reviewed core/stretch prompts are version 2 and published. The forward migration `202603080007_question_bank_publishing_policy.sql` adds the monotonic `version` column and preserves all existing rows.

## Research boundary

The public UCF Foundation Exam solution PDFs (Aug 2022 through May 2026) are used only to calibrate recurring topic families and expected difficulty. FE Arena content uses independent wording, values, code, graphs, explanations, and answer data; it does not reproduce exam text, diagrams, constructions, or answer keys and makes no affiliation or equivalence claim.
