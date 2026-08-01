alter table if exists public.question_bank drop constraint if exists question_bank_type;
alter table if exists public.question_bank add constraint question_bank_type check (question_type in (
  'multiple-choice', 'numeric', 'short-answer', 'code-output', 'ordered-sequence', 'graph'
));
alter table if exists public.question_bank alter column schema_version set default 3;

with legacy_code(id, code) as (values
  ('q-array-c-output', $code$int a[3] = {2, 4, 6};
printf("%d", a[1] + a[2]);$code$),
  ('q-recursion-c-output', $code$void countdown(int n) {
  if (n == 0) return;
  printf("%d ", n);
  countdown(n - 1);
}

countdown(3);$code$),
  ('q-array-c-output-2', $code$int a[4] = {1, 3, 5, 7};
printf("%d", a[0] + a[3]);$code$),
  ('q-list-c-output', $code$struct Node { int value; struct Node *next; };
struct Node n2 = {9, 0};
struct Node n1 = {4, &n2};
printf("%d", n1.next->value);$code$),
  ('q-stack-c-output', $code$int top = 0;
top++;
top++;
top--;
printf("%d", top);$code$),
  ('q-queue-c-output', $code$struct Node { int value; struct Node *next; };
struct Node n3 = {11, 0};
struct Node n2 = {8, &n3};
struct Node n1 = {5, &n2};
struct Node *front = &n1;
front = front->next;
printf("%d", front->value);$code$),
  ('q-tree-c-output', $code$int left_key = 2;
int key = 5;
int right_key = 9;
printf("%d %d %d ", left_key, key, right_key);$code$),
  ('q-avl-c-output', $code$int left_height = 2;
int right_height = 4;
int balance = left_height - right_height;
printf("%d", balance);$code$),
  ('q-heap-c-output', $code$int heap[2] = {12, 7};
printf("%d", heap[0] >= heap[1]);$code$),
  ('q-hash-c-output', $code$printf("%d", 29 % 6);$code$),
  ('q-trie-c-output', $code$int found_cat = 1;
int found_can = 0;
printf("%d", found_cat + found_can);$code$),
  ('q-sort-c-output', $code$int x = 3;
int y = 1;
if (x > y) printf("sorted");
else printf("swap");$code$),
  ('q-recursion-c-output-2', $code$void f(int n) {
  if (n == 0) return;
  f(n - 1);
  printf("%d ", n);
}

f(2);$code$),
  ('q-analysis-c-output', $code$int x = 2 + 3 * 4;
printf("%d", x);$code$)
)
update public.question_bank as question
set content = jsonb_set(coalesce(question.content, '{}'::jsonb), '{code}', to_jsonb(legacy_code.code), true),
    schema_version = 3
from legacy_code
where question.id = legacy_code.id
  and question.question_type = 'code-output'
  and question.content->>'code' is null;
