import type { CodingProblem } from "./domain.js";

/** Original, deterministic browser-practice fixtures. The harness is compiled with the student's function. */
const C_PREFIX =
  "#include <stddef.h>\n#include <stdio.h>\n#include <limits.h>\n\n/* Reviewed fixtures may define these tags in their harness after the locked prototype. */\nstruct Node;\nstruct TreeNode;\n";

const problem = (value: Omit<CodingProblem, "prefix">): CodingProblem => ({ ...value, prefix: C_PREFIX });

export const CODING_PROBLEMS: readonly CodingProblem[] = [
  problem({
    id: "c-sum-array",
    title: "Sum an integer array",
    description: "Return the sum of the first length elements in values. The input array is valid and non-empty.",
    functionSignature: "int sum_array(const int values[], size_t length)",
    starterCode: "int total = 0;\nfor (size_t i = 0; i < length; i++) {\n  total += values[i];\n}\nreturn total;",
    testHarness: `int main(void) {
  const int first[] = {3, -2, 7, 4};
  const int second[] = {10, 0, -5};
  int first_result = sum_array(first, 4);
  int second_result = sum_array(second, 3);
  printf("FEA_TEST|1|mixed values|%s\\n", first_result == 12 ? "PASS" : "FAIL");
  printf("FEA_TEST|2|zero included|%s\\n", second_result == 5 ? "PASS" : "FAIL");
  return 0;
}`,
  }),
  problem({
    id: "c-reverse-array",
    title: "Reverse an array in place",
    description: "Reverse the first length integers in values in place. Do not allocate a second array.",
    functionSignature: "void reverse_array(int values[], size_t length)",
    starterCode:
      "for (size_t left = 0; left < length / 2; left++) {\n  size_t right = length - 1 - left;\n  int temporary = values[left];\n  values[left] = values[right];\n  values[right] = temporary;\n}",
    testHarness: `static int same_values(const int left[], const int right[], size_t length) {
  for (size_t i = 0; i < length; i++) if (left[i] != right[i]) return 0;
  return 1;
}
int main(void) {
  int odd[] = {1, 2, 3, 4, 5}; int odd_expected[] = {5, 4, 3, 2, 1};
  int even[] = {8, 9, 10, 11}; int even_expected[] = {11, 10, 9, 8};
  reverse_array(odd, 5); reverse_array(even, 4);
  printf("FEA_TEST|1|odd length|%s\\n", same_values(odd, odd_expected, 5) ? "PASS" : "FAIL");
  printf("FEA_TEST|2|even length|%s\\n", same_values(even, even_expected, 4) ? "PASS" : "FAIL");
  return 0;
}`,
  }),
  problem({
    id: "c-count-vowels",
    title: "Count vowels in a string",
    description: "Return how many lowercase or uppercase vowels appear in the null-terminated text.",
    functionSignature: "int count_vowels(const char text[])",
    starterCode:
      "int count = 0;\nfor (size_t i = 0; text[i] != '\\0'; i++) {\n  char character = text[i];\n  if (character == 'a' || character == 'e' || character == 'i' || character == 'o' || character == 'u' || character == 'A' || character == 'E' || character == 'I' || character == 'O' || character == 'U') count++;\n}\nreturn count;",
    testHarness: `int main(void) {
  printf("FEA_TEST|1|mixed case|%s\\n", count_vowels("FE Arena") == 4 ? "PASS" : "FAIL");
  printf("FEA_TEST|2|no vowels|%s\\n", count_vowels("rhythm") == 0 ? "PASS" : "FAIL");
  return 0;
}`,
  }),
  problem({
    id: "c-max-subarray",
    title: "Best contiguous sum",
    description: "Return the largest sum of a non-empty contiguous slice of values.",
    functionSignature: "int max_subarray(const int values[], size_t length)",
    starterCode:
      "int best = values[0];\nint ending = values[0];\nfor (size_t i = 1; i < length; i++) {\n  ending = ending > 0 ? ending + values[i] : values[i];\n  if (ending > best) best = ending;\n}\nreturn best;",
    testHarness: `int main(void) {
  const int a[] = {-4, 6, -1, 2, -9}; const int b[] = {-8, -3, -5};
  printf("FEA_TEST|1|mixed signs|%s\\n", max_subarray(a, 5) == 7 ? "PASS" : "FAIL");
  printf("FEA_TEST|2|all negative|%s\\n", max_subarray(b, 3) == -3 ? "PASS" : "FAIL");
  return 0;
}`,
  }),
  problem({
    id: "c-rotate-right",
    title: "Rotate an array right",
    description: "Rotate the first length values right by shift positions in place. length is positive.",
    functionSignature: "void rotate_right(int values[], size_t length, size_t shift)",
    starterCode:
      "shift %= length;\nfor (size_t pass = 0; pass < shift; pass++) {\n  int last = values[length - 1];\n  for (size_t i = length - 1; i > 0; i--) values[i] = values[i - 1];\n  values[0] = last;\n}",
    testHarness: `static int same(const int a[], const int b[], size_t n) { for (size_t i = 0; i < n; i++) if (a[i] != b[i]) return 0; return 1; }
int main(void) {
  int a[] = {1, 2, 3, 4, 5}; int ae[] = {4, 5, 1, 2, 3};
  int b[] = {7, 8, 9}; int be[] = {7, 8, 9};
  rotate_right(a, 5, 2); rotate_right(b, 3, 6);
  printf("FEA_TEST|1|two steps|%s\\n", same(a, ae, 5) ? "PASS" : "FAIL");
  printf("FEA_TEST|2|full turns|%s\\n", same(b, be, 3) ? "PASS" : "FAIL");
  return 0;
}`,
  }),
  problem({
    id: "c-remove-duplicates",
    title: "Compact sorted duplicates",
    description: "Values is sorted. Remove duplicates in place and return the new logical length.",
    functionSignature: "size_t remove_duplicates(int values[], size_t length)",
    starterCode:
      "if (length == 0) return 0;\nsize_t write = 1;\nfor (size_t read = 1; read < length; read++) {\n  if (values[read] != values[write - 1]) values[write++] = values[read];\n}\nreturn write;",
    testHarness: `int main(void) {
  int a[] = {-2, -2, 0, 0, 0, 5}; int n = (int)remove_duplicates(a, 6);
  int ok = n == 3 && a[0] == -2 && a[1] == 0 && a[2] == 5;
  int b[] = {4, 4};
  printf("FEA_TEST|1|repeated runs|%s\\n", ok ? "PASS" : "FAIL");
  printf("FEA_TEST|2|one value|%s\\n", remove_duplicates(b, 2) == 1 ? "PASS" : "FAIL");
  return 0;
}`,
  }),
  problem({
    id: "c-first-binary-search",
    title: "First occurrence in sorted data",
    description: "Return the first index containing target in sorted values, or -1 when target is absent.",
    functionSignature: "int first_binary_search(const int values[], size_t length, int target)",
    starterCode:
      "int answer = -1;\nsize_t low = 0, high = length;\nwhile (low < high) {\n  size_t middle = low + (high - low) / 2;\n  if (values[middle] >= target) { if (values[middle] == target) answer = (int)middle; high = middle; }\n  else low = middle + 1;\n}\nreturn answer;",
    testHarness: `int main(void) {
  const int values[] = {1, 3, 3, 3, 8, 10};
  printf("FEA_TEST|1|duplicate target|%s\\n", first_binary_search(values, 6, 3) == 1 ? "PASS" : "FAIL");
  printf("FEA_TEST|2|missing target|%s\\n", first_binary_search(values, 6, 7) == -1 ? "PASS" : "FAIL");
  return 0;
}`,
  }),
  problem({
    id: "c-matrix-diagonal",
    title: "Main diagonal total",
    description: "Return the main diagonal sum of a square matrix stored in row-major order.",
    functionSignature: "int diagonal_sum(const int matrix[], size_t side)",
    starterCode: "int total = 0;\nfor (size_t i = 0; i < side; i++) total += matrix[i * side + i];\nreturn total;",
    testHarness: `int main(void) {
  const int a[] = {2, 8, 4, 1, 3, 9, 7, 6, 5};
  const int b[] = {11};
  printf("FEA_TEST|1|three by three|%s\\n", diagonal_sum(a, 3) == 10 ? "PASS" : "FAIL");
  printf("FEA_TEST|2|one by one|%s\\n", diagonal_sum(b, 1) == 11 ? "PASS" : "FAIL");
  return 0;
}`,
  }),
  problem({
    id: "c-string-reverse",
    title: "Reverse a C string",
    description: "Reverse the characters before the null terminator in text in place.",
    functionSignature: "void reverse_text(char text[])",
    starterCode:
      "size_t length = 0;\nwhile (text[length] != '\\0') length++;\nfor (size_t left = 0; left < length / 2; left++) { size_t right = length - 1 - left; char t = text[left]; text[left] = text[right]; text[right] = t; }",
    testHarness: `int main(void) {
  char a[] = "drawer"; char b[] = "x";
  reverse_text(a); reverse_text(b);
  printf("FEA_TEST|1|even text|%s\\n", a[0] == 'r' && a[5] == 'd' ? "PASS" : "FAIL");
  printf("FEA_TEST|2|one character|%s\\n", b[0] == 'x' && b[1] == '\\0' ? "PASS" : "FAIL");
  return 0;
}`,
  }),
  problem({
    id: "c-count-runs",
    title: "Count equal-value runs",
    description: "Return the number of maximal runs in a non-empty integer array.",
    functionSignature: "size_t count_runs(const int values[], size_t length)",
    starterCode:
      "size_t runs = 1;\nfor (size_t i = 1; i < length; i++) if (values[i] != values[i - 1]) runs++;\nreturn runs;",
    testHarness: `int main(void) {
  const int a[] = {2, 2, 4, 4, 4, 1}; const int b[] = {9, 9, 9};
  printf("FEA_TEST|1|three runs|%s\\n", count_runs(a, 6) == 3 ? "PASS" : "FAIL");
  printf("FEA_TEST|2|one run|%s\\n", count_runs(b, 3) == 1 ? "PASS" : "FAIL");
  return 0;
}`,
  }),
  problem({
    id: "c-list-length",
    title: "Count linked nodes",
    description: "Return the number of nodes reachable from head in a null-terminated singly linked list.",
    functionSignature: "size_t list_length(const struct Node *head)",
    starterCode:
      "size_t count = 0;\nfor (const struct Node *current = head; current != NULL; current = current->next) count++;\nreturn count;",
    testHarness: `struct Node { int value; struct Node *next; };
int main(void) {
  struct Node c = {9, NULL}, b = {4, &c}, a = {-1, &b};
  printf("FEA_TEST|1|three nodes|%s\\n", list_length(&a) == 3 ? "PASS" : "FAIL");
  printf("FEA_TEST|2|empty list|%s\\n", list_length(NULL) == 0 ? "PASS" : "FAIL");
  return 0;
}`,
  }),
  problem({
    id: "c-list-reverse",
    title: "Reverse linked links",
    description: "Reverse a null-terminated singly linked list and return its new head.",
    functionSignature: "struct Node *reverse_list(struct Node *head)",
    starterCode:
      "struct Node *previous = NULL;\nwhile (head != NULL) { struct Node *next = head->next; head->next = previous; previous = head; head = next; }\nreturn previous;",
    testHarness: `struct Node { int value; struct Node *next; };
int main(void) {
  struct Node c = {3, NULL}, b = {2, &c}, a = {1, &b};
  struct Node *head = reverse_list(&a);
  printf("FEA_TEST|1|new head|%s\\n", head->value == 3 ? "PASS" : "FAIL");
  printf("FEA_TEST|2|links reversed|%s\\n", head->next->value == 2 && head->next->next->value == 1 && head->next->next->next == NULL ? "PASS" : "FAIL");
  return 0;
}`,
  }),
  problem({
    id: "c-list-middle",
    title: "Find the middle node",
    description: "Return the middle node using slow/fast pointers. For even length, return the second middle node.",
    functionSignature: "struct Node *list_middle(struct Node *head)",
    starterCode:
      "struct Node *slow = head;\nstruct Node *fast = head;\nwhile (fast != NULL && fast->next != NULL) { slow = slow->next; fast = fast->next->next; }\nreturn slow;",
    testHarness: `struct Node { int value; struct Node *next; };
int main(void) {
  struct Node d = {40, NULL}, c = {30, &d}, b = {20, &c}, a = {10, &b};
  printf("FEA_TEST|1|even uses second|%s\\n", list_middle(&a)->value == 30 ? "PASS" : "FAIL");
  printf("FEA_TEST|2|empty|%s\\n", list_middle(NULL) == NULL ? "PASS" : "FAIL");
  return 0;
}`,
  }),
  problem({
    id: "c-list-remove-first",
    title: "Remove the first matching node",
    description: "Remove the first node whose value equals target, free it, and return the possibly new head.",
    functionSignature: "struct Node *remove_first(struct Node *head, int target)",
    starterCode:
      "struct Node **link = &head;\nwhile (*link != NULL && (*link)->value != target) link = &(*link)->next;\nif (*link != NULL) { struct Node *removed = *link; *link = removed->next; free(removed); }\nreturn head;",
    testHarness: `#include <stdlib.h>
struct Node { int value; struct Node *next; };
int main(void) {
  struct Node *c = malloc(sizeof(*c)); struct Node *b = malloc(sizeof(*b)); struct Node *a = malloc(sizeof(*a));
  a->value = 4; a->next = b; b->value = 7; b->next = c; c->value = 7; c->next = NULL;
  struct Node *head = remove_first(a, 7);
  printf("FEA_TEST|1|first only|%s\\n", head->next->value == 7 && head->next->next == NULL ? "PASS" : "FAIL");
  head = remove_first(head, 8);
  printf("FEA_TEST|2|missing stable|%s\\n", head->value == 4 ? "PASS" : "FAIL");
  free(head->next); free(head); return 0;
}`,
  }),
  problem({
    id: "c-list-cycle",
    title: "Detect a linked cycle",
    description: "Return 1 if the singly linked list reachable from head contains a cycle, otherwise return 0.",
    functionSignature: "int has_cycle(const struct Node *head)",
    starterCode:
      "const struct Node *slow = head;\nconst struct Node *fast = head;\nwhile (fast != NULL && fast->next != NULL) { slow = slow->next; fast = fast->next->next; if (slow == fast) return 1; }\nreturn 0;",
    testHarness: `struct Node { int value; struct Node *next; };
int main(void) {
  struct Node a = {1, NULL}, b = {2, NULL}, c = {3, NULL}; a.next = &b; b.next = &c; c.next = &b;
  struct Node d = {4, NULL}, e = {5, &d};
  printf("FEA_TEST|1|cycle|%s\\n", has_cycle(&a) == 1 ? "PASS" : "FAIL");
  printf("FEA_TEST|2|linear|%s\\n", has_cycle(&e) == 0 ? "PASS" : "FAIL");
  return 0;
}`,
  }),
  problem({
    id: "c-stack-min",
    title: "Minimum in an array stack",
    description: "Return the minimum among the first length stack values; the stack is non-empty.",
    functionSignature: "int stack_min(const int stack[], size_t length)",
    starterCode:
      "int minimum = stack[0];\nfor (size_t i = 1; i < length; i++) if (stack[i] < minimum) minimum = stack[i];\nreturn minimum;",
    testHarness: `int main(void) {
  const int a[] = {8, 3, 9, -2, 4}; const int b[] = {6};
  printf("FEA_TEST|1|negative minimum|%s\\n", stack_min(a, 5) == -2 ? "PASS" : "FAIL");
  printf("FEA_TEST|2|singleton|%s\\n", stack_min(b, 1) == 6 ? "PASS" : "FAIL"); return 0;
}`,
  }),
  problem({
    id: "c-queue-filter",
    title: "Filter a queue buffer",
    description: "Copy nonnegative values from input into output in order and return the output length.",
    functionSignature: "size_t keep_nonnegative(const int input[], size_t length, int output[])",
    starterCode:
      "size_t written = 0;\nfor (size_t i = 0; i < length; i++) if (input[i] >= 0) output[written++] = input[i];\nreturn written;",
    testHarness: `int main(void) {
  const int input[] = {-3, 0, 4, -1, 9}; int output[5] = {0};
  size_t n = keep_nonnegative(input, 5, output);
  printf("FEA_TEST|1|count|%s\\n", n == 3 ? "PASS" : "FAIL");
  printf("FEA_TEST|2|order|%s\\n", output[0] == 0 && output[1] == 4 && output[2] == 9 ? "PASS" : "FAIL"); return 0;
}`,
  }),
  problem({
    id: "c-tree-leaves",
    title: "Count binary-tree leaves",
    description: "Return the number of nodes with no children in a binary tree, or zero for an empty tree.",
    functionSignature: "size_t count_leaves(const struct TreeNode *root)",
    starterCode:
      "if (root == NULL) return 0;\nif (root->left == NULL && root->right == NULL) return 1;\nreturn count_leaves(root->left) + count_leaves(root->right);",
    testHarness: `struct TreeNode { int key; struct TreeNode *left; struct TreeNode *right; };
int main(void) {
  struct TreeNode l = {1, NULL, NULL}, r = {3, NULL, NULL}, root = {2, &l, &r};
  printf("FEA_TEST|1|two leaves|%s\\n", count_leaves(&root) == 2 ? "PASS" : "FAIL");
  printf("FEA_TEST|2|empty|%s\\n", count_leaves(NULL) == 0 ? "PASS" : "FAIL"); return 0;
}`,
  }),
  problem({
    id: "c-tree-height",
    title: "Binary-tree edge height",
    description: "Return the edge-count height of a binary tree, with an empty tree having height -1.",
    functionSignature: "int tree_height(const struct TreeNode *root)",
    starterCode:
      "if (root == NULL) return -1;\nint left = tree_height(root->left);\nint right = tree_height(root->right);\nreturn 1 + (left > right ? left : right);",
    testHarness: `struct TreeNode { int key; struct TreeNode *left; struct TreeNode *right; };
int main(void) {
  struct TreeNode leaf = {4, NULL, NULL}, child = {2, &leaf, NULL}, root = {8, &child, NULL};
  printf("FEA_TEST|1|chain height|%s\\n", tree_height(&root) == 2 ? "PASS" : "FAIL");
  printf("FEA_TEST|2|empty height|%s\\n", tree_height(NULL) == -1 ? "PASS" : "FAIL"); return 0;
}`,
  }),
  problem({
    id: "c-bst-range",
    title: "Check a BST range",
    description: "Return 1 when every key in the tree lies inclusively between low and high, otherwise return 0.",
    functionSignature: "int within_range(const struct TreeNode *root, int low, int high)",
    starterCode:
      "if (root == NULL) return 1;\nif (root->key < low || root->key > high) return 0;\nreturn within_range(root->left, low, high) && within_range(root->right, low, high);",
    testHarness: `struct TreeNode { int key; struct TreeNode *left; struct TreeNode *right; };
int main(void) {
  struct TreeNode a = {2, NULL, NULL}, b = {8, NULL, NULL}, root = {5, &a, &b};
  printf("FEA_TEST|1|inclusive bounds|%s\\n", within_range(&root, 2, 8) ? "PASS" : "FAIL");
  printf("FEA_TEST|2|out of range|%s\\n", within_range(&root, 3, 8) ? "FAIL" : "PASS"); return 0;
}`,
  }),
  problem({
    id: "c-heap-sift-down",
    title: "Sift down a max-heap root",
    description:
      "Restore max-heap order from index 0 through length after the root was replaced; length is at least one.",
    functionSignature: "void sift_down(int heap[], size_t length)",
    starterCode:
      "size_t index = 0;\nwhile (2 * index + 1 < length) {\n  size_t child = 2 * index + 1;\n  if (child + 1 < length && heap[child + 1] > heap[child]) child++;\n  if (heap[index] >= heap[child]) break;\n  int t = heap[index]; heap[index] = heap[child]; heap[child] = t; index = child;\n}",
    testHarness: `int main(void) {
  int a[] = {2, 9, 7, 4, 5, 6}; int b[] = {10};
  sift_down(a, 6); sift_down(b, 1);
  printf("FEA_TEST|1|select larger child|%s\\n", a[0] == 9 && a[1] == 5 && a[2] == 7 ? "PASS" : "FAIL");
  printf("FEA_TEST|2|singleton|%s\\n", b[0] == 10 ? "PASS" : "FAIL"); return 0;
}`,
  }),
  problem({
    id: "c-heap-kth-largest",
    title: "Kth largest from a heap array",
    description: "Return the kth largest value in values by sorting a bounded copy conceptually; 1 <= k <= length.",
    functionSignature: "int kth_largest(const int values[], size_t length, size_t k)",
    starterCode:
      "int copy[64];\nfor (size_t i = 0; i < length; i++) copy[i] = values[i];\nfor (size_t end = length; end > 1; end--) { for (size_t i = 1; i < end; i++) if (copy[i - 1] < copy[i]) { int t = copy[i - 1]; copy[i - 1] = copy[i]; copy[i] = t; } }\nreturn copy[k - 1];",
    testHarness: `int main(void) {
  const int a[] = {7, 1, 9, 4, 9};
  printf("FEA_TEST|1|duplicate maximum|%s\\n", kth_largest(a, 5, 2) == 9 ? "PASS" : "FAIL");
  printf("FEA_TEST|2|third|%s\\n", kth_largest(a, 5, 3) == 7 ? "PASS" : "FAIL"); return 0;
}`,
  }),
  problem({
    id: "c-hash-probe-slot",
    title: "Find a linear-probe slot",
    description:
      "Return the first empty slot starting at key modulo capacity, wrapping around. Empty slots contain -1.",
    functionSignature: "size_t probe_slot(const int table[], size_t capacity, int key)",
    starterCode:
      "size_t start = (size_t)(key >= 0 ? key : -key) % capacity;\nfor (size_t step = 0; step < capacity; step++) { size_t slot = (start + step) % capacity; if (table[slot] == -1) return slot; }\nreturn capacity;",
    testHarness: `int main(void) {
  const int a[] = {12, 8, -1, 4, 7}; const int b[] = {3, 4, 5};
  printf("FEA_TEST|1|first free|%s\\n", probe_slot(a, 5, 12) == 2 ? "PASS" : "FAIL");
  printf("FEA_TEST|2|full sentinel|%s\\n", probe_slot(b, 3, 1) == 3 ? "PASS" : "FAIL"); return 0;
}`,
  }),
  problem({
    id: "c-sort-insertion",
    title: "Insertion sort with a sentinel",
    description: "Sort values in nondecreasing order in place using insertion sort and return no value.",
    functionSignature: "void insertion_sort(int values[], size_t length)",
    starterCode:
      "for (size_t i = 1; i < length; i++) { int key = values[i]; size_t j = i; while (j > 0 && values[j - 1] > key) { values[j] = values[j - 1]; j--; } values[j] = key; }",
    testHarness: `static int sorted(const int a[], size_t n) { for (size_t i = 1; i < n; i++) if (a[i - 1] > a[i]) return 0; return 1; }
int main(void) {
  int a[] = {5, -1, 5, 2, 0}; int b[] = {3}; insertion_sort(a, 5); insertion_sort(b, 1);
  printf("FEA_TEST|1|duplicates and negative|%s\\n", sorted(a, 5) && a[0] == -1 && a[4] == 5 ? "PASS" : "FAIL");
  printf("FEA_TEST|2|singleton|%s\\n", b[0] == 3 ? "PASS" : "FAIL"); return 0;
}`,
  }),
  problem({
    id: "c-merge-count",
    title: "Count inversions",
    description:
      "Return the number of index pairs i < j with values[i] > values[j]. The input length is bounded by 64.",
    functionSignature: "size_t inversion_count(const int values[], size_t length)",
    starterCode:
      "size_t count = 0;\nfor (size_t i = 0; i < length; i++) for (size_t j = i + 1; j < length; j++) if (values[i] > values[j]) count++;\nreturn count;",
    testHarness: `int main(void) {
  const int a[] = {3, 1, 2, 0}; const int b[] = {1, 1, 1};
  printf("FEA_TEST|1|four values|%s\\n", inversion_count(a, 4) == 5 ? "PASS" : "FAIL");
  printf("FEA_TEST|2|equal values|%s\\n", inversion_count(b, 3) == 0 ? "PASS" : "FAIL"); return 0;
}`,
  }),
  problem({
    id: "c-recursive-gcd",
    title: "Euclid's algorithm",
    description: "Return the greatest common divisor of two positive integers using recursion.",
    functionSignature: "int recursive_gcd(int left, int right)",
    starterCode: "if (right == 0) return left;\nreturn recursive_gcd(right, left % right);",
    testHarness: `int main(void) {
  printf("FEA_TEST|1|non-coprime|%s\\n", recursive_gcd(84, 30) == 6 ? "PASS" : "FAIL");
  printf("FEA_TEST|2|coprime|%s\\n", recursive_gcd(35, 18) == 1 ? "PASS" : "FAIL"); return 0;
}`,
  }),
  problem({
    id: "c-recursive-power",
    title: "Fast integer power",
    description: "Return base raised to nonnegative exponent using recursive exponentiation by squaring.",
    functionSignature: "long long fast_power(long long base, unsigned exponent)",
    starterCode:
      "if (exponent == 0) return 1;\nlong long half = fast_power(base, exponent / 2);\nlong long result = half * half;\nif (exponent % 2 != 0) result *= base;\nreturn result;",
    testHarness: `int main(void) {
  printf("FEA_TEST|1|odd exponent|%s\\n", fast_power(3, 5) == 243 ? "PASS" : "FAIL");
  printf("FEA_TEST|2|zero exponent|%s\\n", fast_power(99, 0) == 1 ? "PASS" : "FAIL"); return 0;
}`,
  }),
  problem({
    id: "c-recursive-digit-sum",
    title: "Recursive digit sum",
    description: "Return the sum of the decimal digits of a nonnegative integer.",
    functionSignature: "unsigned digit_sum(unsigned value)",
    starterCode: "if (value < 10) return value;\nreturn value % 10 + digit_sum(value / 10);",
    testHarness: `int main(void) {
  printf("FEA_TEST|1|several digits|%s\\n", digit_sum(40719) == 21 ? "PASS" : "FAIL");
  printf("FEA_TEST|2|zero|%s\\n", digit_sum(0) == 0 ? "PASS" : "FAIL"); return 0;
}`,
  }),
  problem({
    id: "c-bit-count",
    title: "Count set bits",
    description:
      "Return the number of one bits in the unsigned value using a loop that skips cleared low bits when possible.",
    functionSignature: "unsigned count_bits(unsigned value)",
    starterCode: "unsigned count = 0;\nwhile (value != 0) { value &= value - 1; count++; }\nreturn count;",
    testHarness: `int main(void) {
  printf("FEA_TEST|1|sparse bits|%s\\n", count_bits(0x29u) == 3 ? "PASS" : "FAIL");
  printf("FEA_TEST|2|zero bits|%s\\n", count_bits(0u) == 0 ? "PASS" : "FAIL"); return 0;
}`,
  }),
  problem({
    id: "c-bit-reverse-low",
    title: "Reverse low bits",
    description: "Return the value formed by reversing the lowest width bits of value. width is between 1 and 16.",
    functionSignature: "unsigned reverse_low_bits(unsigned value, unsigned width)",
    starterCode:
      "unsigned result = 0;\nfor (unsigned i = 0; i < width; i++) { result = (result << 1) | (value & 1u); value >>= 1; }\nreturn result;",
    testHarness: `int main(void) {
  printf("FEA_TEST|1|four bits|%s\\n", reverse_low_bits(0x6u, 4) == 6u ? "PASS" : "FAIL");
  printf("FEA_TEST|2|leading zeros|%s\\n", reverse_low_bits(0x1u, 4) == 8u ? "PASS" : "FAIL"); return 0;
}`,
  }),
  problem({
    id: "c-pointer-swap",
    title: "Swap through aliases",
    description: "Swap the two integers reached by left and right. Both pointers are valid and distinct.",
    functionSignature: "void swap_ints(int *left, int *right)",
    starterCode: "int temporary = *left; *left = *right; *right = temporary;",
    testHarness: `int main(void) {
  int a = -3, b = 12; swap_ints(&a, &b);
  printf("FEA_TEST|1|both values|%s\\n", a == 12 && b == -3 ? "PASS" : "FAIL");
  return 0;
}`,
  }),
  problem({
    id: "c-pointer-rotate3",
    title: "Rotate three aliases",
    description: "Move the value at first to second, second to third, and third to first.",
    functionSignature: "void rotate_three(int *first, int *second, int *third)",
    starterCode: "int temporary = *third; *third = *second; *second = *first; *first = temporary;",
    testHarness: `int main(void) {
  int a = 1, b = 2, c = 3; rotate_three(&a, &b, &c);
  printf("FEA_TEST|1|cycle right|%s\\n", a == 3 && b == 1 && c == 2 ? "PASS" : "FAIL");
  return 0;
}`,
  }),
  problem({
    id: "c-short-circuit-index",
    title: "Safe bounded lookup",
    description: "Return 1 if target appears in values, checking no more than length elements; length may be zero.",
    functionSignature: "int contains_value(const int values[], size_t length, int target)",
    starterCode: "for (size_t i = 0; i < length; i++) if (values[i] == target) return 1;\nreturn 0;",
    testHarness: `int main(void) {
  const int a[] = {4, 1, 9};
  printf("FEA_TEST|1|found at end|%s\\n", contains_value(a, 3, 9) ? "PASS" : "FAIL");
  printf("FEA_TEST|2|empty bound|%s\\n", contains_value(a, 0, 4) ? "FAIL" : "PASS"); return 0;
}`,
  }),
  problem({
    id: "c-prefix-sum-inplace",
    title: "Build prefix sums",
    description: "Replace each value with the sum of itself and all earlier values. The array is non-empty.",
    functionSignature: "void prefix_sums(int values[], size_t length)",
    starterCode: "for (size_t i = 1; i < length; i++) values[i] += values[i - 1];",
    testHarness: `int main(void) {
  int a[] = {3, -1, 4, 2}; prefix_sums(a, 4);
  printf("FEA_TEST|1|running totals|%s\\n", a[0] == 3 && a[1] == 2 && a[2] == 6 && a[3] == 8 ? "PASS" : "FAIL"); return 0;
}`,
  }),
  problem({
    id: "c-parity-partition",
    title: "Stable parity partition",
    description: "Copy evens followed by odds from input to output, preserving relative order within each group.",
    functionSignature: "size_t partition_even_odd(const int input[], size_t length, int output[])",
    starterCode:
      "size_t write = 0;\nfor (size_t pass = 0; pass < 2; pass++) for (size_t i = 0; i < length; i++) if ((input[i] & 1) == (pass ? 1 : 0)) output[write++] = input[i];\nreturn write;",
    testHarness: `int main(void) {
  const int input[] = {5, 2, 8, 3, 4}; int output[5]; size_t n = partition_even_odd(input, 5, output);
  printf("FEA_TEST|1|all copied|%s\\n", n == 5 ? "PASS" : "FAIL");
  printf("FEA_TEST|2|stable groups|%s\\n", output[0] == 2 && output[1] == 8 && output[2] == 4 && output[3] == 5 && output[4] == 3 ? "PASS" : "FAIL"); return 0;
}`,
  }),
  problem({
    id: "c-interval-overlap",
    title: "Measure interval overlap",
    description:
      "Return the length of the overlap of inclusive integer intervals [left1,right1] and [left2,right2], or zero.",
    functionSignature: "int overlap_length(int left1, int right1, int left2, int right2)",
    starterCode:
      "int left = left1 > left2 ? left1 : left2;\nint right = right1 < right2 ? right1 : right2;\nreturn left <= right ? right - left + 1 : 0;",
    testHarness: `int main(void) {
  printf("FEA_TEST|1|partial overlap|%s\\n", overlap_length(2, 7, 5, 9) == 3 ? "PASS" : "FAIL");
  printf("FEA_TEST|2|disjoint|%s\\n", overlap_length(-4, -1, 2, 5) == 0 ? "PASS" : "FAIL"); return 0;
}`,
  }),
  problem({
    id: "c-merge-sorted",
    title: "Merge two sorted arrays",
    description: "Write the sorted merge of left and right into output and return its length.",
    functionSignature:
      "size_t merge_sorted(const int left[], size_t left_length, const int right[], size_t right_length, int output[])",
    starterCode:
      "size_t i = 0, j = 0, out = 0;\nwhile (i < left_length || j < right_length) { if (j == right_length || (i < left_length && left[i] <= right[j])) output[out++] = left[i++]; else output[out++] = right[j++]; }\nreturn out;",
    testHarness: `int main(void) {
  const int a[] = {1, 4, 9}; const int b[] = {-2, 4, 8}; int out[6]; size_t n = merge_sorted(a, 3, b, 3, out);
  printf("FEA_TEST|1|length|%s\\n", n == 6 ? "PASS" : "FAIL");
  printf("FEA_TEST|2|ordered ties|%s\\n", out[0] == -2 && out[1] == 1 && out[2] == 4 && out[3] == 4 && out[5] == 9 ? "PASS" : "FAIL"); return 0;
}`,
  }),
  problem({
    id: "c-atoi-bounded",
    title: "Parse unsigned decimal text",
    description: "Return the value of a non-empty string of decimal digits, stopping at the null terminator.",
    functionSignature: "unsigned parse_decimal(const char text[])",
    starterCode:
      "unsigned result = 0;\nfor (size_t i = 0; text[i] != '\\0'; i++) result = result * 10u + (unsigned)(text[i] - '0');\nreturn result;",
    testHarness: `int main(void) {
  printf("FEA_TEST|1|leading zero|%s\\n", parse_decimal("0042") == 42u ? "PASS" : "FAIL");
  printf("FEA_TEST|2|single digit|%s\\n", parse_decimal("7") == 7u ? "PASS" : "FAIL"); return 0;
}`,
  }),
];

export const codingProblemById = new Map(CODING_PROBLEMS.map((problem) => [problem.id, problem]));
