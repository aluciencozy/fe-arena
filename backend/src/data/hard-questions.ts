import type { Question } from "../../../shared/domain.js";

/**
 * Stretch set v2. These prompts are independently authored from recurring FE
 * topic families; the public solution PDFs are cited only for topic and
 * difficulty calibration, never for wording, data, diagrams, or answers.
 */
const provenance = {
  source: "UCF Foundation Exam public solution PDFs (Aug 2022–May 2026), topic calibration only",
  note: "Original FE Arena prompt with independent data and answer; public references informed coverage and difficulty, not wording or answer keys.",
};

const assumptions = [
  "The C fragment is evaluated by a conforming implementation under the stated initialization.",
  "Only defined behavior in the shown fragment is considered.",
];

type CodeDraft = {
  id: string;
  topicId: Question["topicId"];
  prompt: string;
  code: string;
  output: string[];
  explanation: string;
  assumptions?: string[];
};
const code = (draft: CodeDraft): Question =>
  ({
    ...draft,
    type: "code-output",
    language: "c",
    difficulty: "stretch",
    assumptions: draft.assumptions ?? assumptions,
    provenance,
  }) as Question;

type GraphDraft = {
  id: string;
  topicId: Question["topicId"];
  prompt: string;
  graph: {
    directed: boolean;
    nodes: Array<{ id: string; label: string; x: number; y: number }>;
    edges: Array<{ from: string; to: string }>;
  };
  operation: "bfs-order" | "dfs-order" | "adjacency" | "reachability" | "shortest-path";
  startNode?: string;
  targetNode?: string;
  nodeId?: string;
  answerOrder?: string[];
  adjacentNodes?: string[];
  reachable?: boolean;
  distance?: number;
  explanation: string;
  assumptions?: string[];
};
const graph = (draft: GraphDraft): Question =>
  ({
    ...draft,
    type: "graph",
    difficulty: "stretch",
    assumptions: draft.assumptions ?? [
      "Traversal examines neighbors in the listed node order.",
      "Edges are traversed exactly according to the directed flag.",
      "For shortest path, every edge has unit weight.",
    ],
    provenance,
  }) as Question;

const nodes = (labels: string[]) =>
  labels.map((label, index) => ({
    id: label.toLowerCase(),
    label,
    x: 8 + (index % 5) * 21,
    y: 24 + Math.floor(index / 5) * 30,
  }));

export const HARD_QUESTIONS: Question[] = [
  code({
    id: "q-hard-alias-increment",
    topicId: "arrays-memory",
    prompt: "What does this defined C fragment print?",
    code: `int values[] = {4, 7, 9};
int *p = values;
int *q = p + 1;
*q += *p;
printf("%d %d %d", values[0], values[1], (int)(q - p));`,
    output: ["4 11 1"],
    explanation:
      "p designates values[0] and q designates values[1]. Adding *p (4) to *q changes 7 to 11, while pointer subtraction reports one element.",
  }),
  code({
    id: "q-hard-pointer-to-pointer",
    topicId: "arrays-memory",
    prompt: "A pointer-to-pointer is reassigned before the final read. What line is printed?",
    code: `int first = 3, second = 8;
int *p = &first;
int **pp = &p;
*pp = &second;
printf("%d %d", *p, **pp);`,
    output: ["8 8"],
    explanation: "*pp writes a new address into p. Both dereferences therefore reach second, whose value is 8.",
  }),
  code({
    id: "q-hard-array-pointer-post",
    topicId: "arrays-memory",
    prompt: "Trace the pointer increments and give the exact output.",
    code: `int a[] = {2, 5, 8, 11};
int *p = a;
printf("%d ", *p++);
printf("%d ", *++p);
printf("%d", p[-1]);`,
    output: ["2 8 5"],
    explanation:
      "The first expression reads a[0] then advances p to a[1]. Pre-increment moves it to a[2] before reading 8; p[-1] then reads a[1].",
  }),
  code({
    id: "q-hard-struct-alias",
    topicId: "linked-lists",
    prompt: "Two aliases point at one node. What values are printed after the mutation?",
    code: `struct Node { int value; struct Node *next; };
struct Node tail = {6, 0};
struct Node head = {2, &tail};
struct Node *a = &head;
struct Node *b = a->next;
b->value += a->value;
printf("%d %d", head.value, head.next->value);`,
    output: ["2 8"],
    explanation:
      "a->next and b designate tail. The update adds head's 2 to tail's 6, leaving head unchanged and tail equal to 8.",
  }),
  code({
    id: "q-hard-list-unlink",
    topicId: "linked-lists",
    prompt: "The predecessor bypasses the middle node. What does traversal print?",
    code: `struct Node { int value; struct Node *next; };
struct Node c = {30, 0};
struct Node b = {20, &c};
struct Node a = {10, &b};
a.next = a.next->next;
for (struct Node *p = &a; p != 0; p = p->next) printf("%d ", p->value);`,
    output: ["10 30 "],
    explanation:
      "The assignment changes a.next from b to c. b remains allocated but is no longer reachable from a, so traversal visits 10 then 30.",
  }),
  code({
    id: "q-hard-stack-alias",
    topicId: "stacks",
    prompt: "Trace the top index and the value left at the active slot.",
    code: `int stack[5] = {0};
int top = 0;
stack[top++] = 4;
stack[top++] = 9;
int saved = stack[--top];
stack[top++] = saved + stack[0];
printf("%d %d", top, stack[top - 1]);`,
    output: ["2 13"],
    explanation:
      "The two pushes leave top at 2. Pre-decrement selects index 1 and saves 9; 13 is written back there and top returns to 2.",
  }),
  code({
    id: "q-hard-stack-control",
    topicId: "stacks",
    prompt: "A pop loop stops on the first even value. What is printed?",
    code: `int stack[] = {3, 8, 5, 2};
int top = 4;
while (top > 0) {
  int value = stack[--top];
  if (value % 2 == 0) break;
  printf("%d ", value);
}
printf("|%d", top);`,
    output: ["|3"],
    explanation:
      "The first pop reads index 3, value 2. It is even, so break skips the print and top remains 3; the final marker is |3.",
    assumptions: [
      "The code is read exactly as shown; break skips the print.",
      "The array is initialized in increasing index order.",
    ],
  }),
  code({
    id: "q-hard-queue-front-rear",
    topicId: "queues",
    prompt: "After one dequeue and one enqueue, what does the linked queue print?",
    code: `struct Node { int value; struct Node *next; };
struct Node c = {7, 0};
struct Node b = {4, &c};
struct Node a = {1, &b};
struct Node *front = &a;
struct Node *rear = &c;
front = front->next;
struct Node d = {9, 0};
rear->next = &d;
rear = &d;
printf("%d %d", front->value, rear->value);`,
    output: ["4 9"],
    explanation:
      "Advancing front removes a from the queue, so front is b with value 4. Linking d after c and moving rear makes the rear value 9.",
  }),
  code({
    id: "q-hard-queue-wrap",
    topicId: "queues",
    prompt: "An occupancy count and wrapped indices are updated in this trace. Give the final line.",
    code: `int data[4] = {0};
int front = 3, rear = 3, count = 0;
data[rear] = 6; rear = (rear + 1) % 4; count++;
data[rear] = 2; rear = (rear + 1) % 4; count++;
front = (front + 1) % 4; count--;
printf("%d %d %d", data[front], data[rear - 1], count);`,
    output: ["2 2 1"],
    explanation:
      "The first write wraps rear to 0 and the second writes index 0, leaving rear at 1. Advancing front from 3 to 0 makes the remaining item data[0] = 2 and count 1.",
    assumptions: [
      "The array access rear - 1 is evaluated after the stated updates and rear is 1.",
      "Indices are ordinary int indices for this defined trace.",
    ],
  }),
  code({
    id: "q-hard-tree-unwind",
    topicId: "binary-trees",
    prompt: "What sequence is printed by this postorder-style recursion?",
    code: `struct Node { int key; struct Node *left; struct Node *right; };
void visit(struct Node *n) {
  if (n == 0) return;
  printf("%d ", n->key % 10);
  visit(n->left);
  visit(n->right);
}
struct Node l = {12, 0, 0};
struct Node r = {23, 0, 0};
struct Node root = {31, &l, &r};
visit(&root);`,
    output: ["1 2 3 "],
    explanation:
      "The function prints on entry, so this is preorder: root 31, left 12, right 23, with each key reduced modulo 10.",
  }),
  code({
    id: "q-hard-tree-height-trace",
    topicId: "binary-trees",
    prompt: "The height helper counts edges. What pair does the final printf emit?",
    code: `struct Node { int key; struct Node *left; struct Node *right; };
int height(struct Node *n) { if (!n) return -1; int a = height(n->left), b = height(n->right); return 1 + (a > b ? a : b); }
struct Node leaf = {4, 0, 0};
struct Node child = {2, &leaf, 0};
struct Node root = {8, &child, 0};
printf("%d %d", height(&root), height(&leaf));`,
    output: ["2 0"],
    explanation: "The chain from root to leaf has two edges. A leaf has height zero under the edge-count convention.",
  }),
  code({
    id: "q-hard-avl-balance-trace",
    topicId: "avl-trees",
    prompt: "Compute both balance factors in the shown bottom-up update.",
    code: `int leaf_left = 1, leaf_right = 3;
int child_balance = leaf_left - leaf_right;
int root_left = 4, root_right = 1;
int root_balance = root_left - root_right;
printf("%d %d", child_balance, root_balance);`,
    output: ["-2 3"],
    explanation:
      "Subtracting right height from left height gives 1 - 3 = -2 for the child and 4 - 1 = 3 for the root; both are outside the AVL range.",
  }),
  code({
    id: "q-hard-heap-sift",
    topicId: "heaps",
    prompt: "After selecting the larger child during one sift-down, what is the heap prefix?",
    code: `int heap[] = {4, 11, 9, 3, 7, 8};
int i = 0;
int child = 2 * i + 1;
if (heap[child + 1] > heap[child]) child++;
int t = heap[i]; heap[i] = heap[child]; heap[child] = t;
printf("%d %d %d", heap[0], heap[1], heap[2]);`,
    output: ["11 4 9"],
    explanation:
      "The children are 11 and 9, so index 1 is selected. Swapping it with the root produces 11, 4, 9 in the first three slots.",
  }),
  code({
    id: "q-hard-heap-index",
    topicId: "heaps",
    prompt: "Trace the parent index calculation for two zero-based heap positions.",
    code: `int child = 11;
int parent = (child - 1) / 2;
child = 4;
parent = (child - 1) / 2;
printf("%d %d", (11 - 1) / 2, parent);`,
    output: ["5 1"],
    explanation:
      "For index 11 the parent is integer division 10 / 2 = 5. Reassigning child to 4 makes its parent 3 / 2 = 1.",
  }),
  code({
    id: "q-hard-hash-probe",
    topicId: "hash-tables",
    prompt: "Trace three linear-probe inspections and report the chosen slot.",
    code: `int table[7] = {13, 20, -1, 9, 16, -1, 4};
int key = 27;
int slot = key % 7;
while (table[slot] != -1) slot = (slot + 1) % 7;
table[slot] = key;
printf("%d %d", slot, table[slot]);`,
    output: ["2 27"],
    explanation:
      "27 mod 7 is 6, which is occupied by 4; the next slot wraps to 0, occupied by 13; slot 1 is occupied by 20; slot 2 is empty and receives 27.",
  }),
  code({
    id: "q-hard-hash-tombstone",
    topicId: "hash-tables",
    prompt: "An open-addressing table treats -2 as a tombstone, not an empty slot. What is printed?",
    code: `int table[] = {8, -2, 15, -1, 22};
int slot = 1;
int steps = 0;
while (table[slot] != -1) { slot = (slot + 1) % 5; steps++; }
printf("%d %d", slot, steps);`,
    output: ["3 2"],
    explanation:
      "The tombstone at 1 is passed, then occupied slot 2 is passed. Slot 3 is the first empty location after two advances.",
  }),
  code({
    id: "q-hard-trie-terminal",
    topicId: "tries",
    prompt: "A terminal flag distinguishes a word from a longer word. What is printed?",
    code: `struct Trie { int terminal; struct Trie *next; };
struct Trie ca = {1, 0};
struct Trie cat = {0, 0};
ca.next = &cat;
printf("%d %d", ca.terminal, ca.next->terminal);`,
    output: ["1 0"],
    explanation:
      "The node for the shorter word has terminal set, while its child represents a longer continuation without being a complete word.",
  }),
  code({
    id: "q-hard-sort-invariant",
    topicId: "sorting",
    prompt: "After the displayed insertion-sort pass, what array is printed?",
    code: `int a[] = {2, 6, 3, 5};
int key = a[2];
int j = 2;
while (j > 0 && a[j - 1] > key) { a[j] = a[j - 1]; j--; }
a[j] = key;
for (int i = 0; i < 4; i++) printf("%d ", a[i]);`,
    output: ["2 3 6 5 "],
    explanation:
      "The sorted prefix 2,6 shifts 6 right to make room for key 3. The suffix value 5 is untouched in this single pass.",
  }),
  code({
    id: "q-hard-sort-compare",
    topicId: "sorting",
    prompt: "Count comparisons in this bounded insertion pass, including the failed comparison.",
    code: `int a[] = {1, 4, 7, 5};
int key = a[3], j = 3, comparisons = 0;
while (j > 0) { comparisons++; if (a[j - 1] <= key) break; a[j] = a[j - 1]; j--; }
a[j] = key;
printf("%d %d", comparisons, a[2]);`,
    output: ["2 5"],
    explanation:
      "The comparisons are 7 > 5 (shift) and then 4 <= 5 (stop), for two total. The key is placed at index 2.",
  }),
  code({
    id: "q-hard-recursion-static",
    topicId: "recursion",
    prompt: "A static local persists across calls. What two lines are printed?",
    code: `int next_value(int n) {
  static int total = 1;
  if (n == 0) return total;
  total += n;
  return next_value(n - 1);
}
printf("%d ", next_value(3));
printf("%d", next_value(2));`,
    output: ["7 10"],
    explanation:
      "The first call accumulates 1+3+2+1 = 7. Static total remains 7; the second call adds 2+1 to reach 10.",
  }),
  code({
    id: "q-hard-recursion-order",
    topicId: "recursion",
    prompt: "Trace the two recursive branches and give the output sequence.",
    code: `void emit(int n) {
  if (n < 1) return;
  printf("%d ", n);
  emit(n - 2);
  emit(n - 1);
}
emit(3);`,
    output: ["3 1 2 1 "],
    explanation: "emit(3) prints 3, then its n-2 branch prints 1, then its n-1 branch prints 2 and its child 1.",
  }),
  code({
    id: "q-hard-analysis-short-circuit",
    topicId: "analysis-mathematics",
    prompt: "How many times does the inner body execute?",
    code: `int count = 0;
for (int i = 1; i <= 8; i *= 2)
  for (int j = i; j > 0; j /= 2) count++;
printf("%d", count);`,
    output: ["10"],
    explanation: "For i values 1, 2, 4, and 8, the inner counts are 1, 2, 3, and 4. Their sum is 10.",
    assumptions: ["Integer division is used for j /= 2.", "The loop body count is measured before j becomes zero."],
  }),
  code({
    id: "q-hard-analysis-bitmask",
    topicId: "analysis-mathematics",
    prompt: "Evaluate the mask update and print the final decimal value.",
    code: `unsigned mask = 0x2u;
mask = (mask << 2) | 0x1u;
mask ^= 0x4u;
printf("%u", mask);`,
    output: ["5"],
    explanation: "Shifting 2 left twice gives 8; OR with 1 gives 9; XOR with 4 clears the 4 bit, leaving 5.",
  }),
  code({
    id: "q-hard-control-alias",
    topicId: "recursion",
    prompt: "Account for continue and the post-increment in this loop.",
    code: `int total = 0;
for (int i = 0; i < 6; i++) {
  if (i == 2 || i == 4) continue;
  total += i;
}
printf("%d", total);`,
    output: ["9"],
    explanation:
      "The included values are 0, 1, 3, and 5. Their sum is 9; continue skips only the addition, while the loop increment still runs.",
  }),

  graph({
    id: "q-hard-graph-bfs-cycle",
    topicId: "binary-trees",
    prompt: "Starting at A, give BFS order; mark a node visited when enqueued.",
    graph: {
      directed: true,
      nodes: nodes(["A", "B", "C", "D", "E", "F"]),
      edges: [
        { from: "a", to: "b" },
        { from: "a", to: "c" },
        { from: "b", to: "d" },
        { from: "c", to: "d" },
        { from: "d", to: "e" },
        { from: "e", to: "b" },
        { from: "c", to: "f" },
      ],
    },
    operation: "bfs-order",
    startNode: "a",
    answerOrder: ["a", "b", "c", "d", "f", "e"],
    explanation:
      "A enqueues B,C; B enqueues D; C adds F because D is already marked; D then adds E. The back-edge E to B is ignored.",
  }),
  graph({
    id: "q-hard-graph-dfs-cross",
    topicId: "sorting",
    prompt: "Starting at A, give recursive DFS preorder with listed outgoing-edge order.",
    graph: {
      directed: true,
      nodes: nodes(["A", "B", "C", "D", "E", "F"]),
      edges: [
        { from: "a", to: "b" },
        { from: "a", to: "c" },
        { from: "b", to: "d" },
        { from: "b", to: "e" },
        { from: "c", to: "e" },
        { from: "e", to: "f" },
        { from: "d", to: "f" },
      ],
    },
    operation: "dfs-order",
    startNode: "a",
    answerOrder: ["a", "b", "d", "f", "e", "c"],
    explanation:
      "DFS follows A-B-D-F, returns to B and visits E (F is already visited), then returns to A and visits C.",
  }),
  graph({
    id: "q-hard-graph-shortest",
    topicId: "heaps",
    prompt: "Find the unweighted shortest-path length from A to G.",
    graph: {
      directed: false,
      nodes: nodes(["A", "B", "C", "D", "E", "F", "G"]),
      edges: [
        { from: "a", to: "b" },
        { from: "a", to: "c" },
        { from: "b", to: "d" },
        { from: "c", to: "d" },
        { from: "c", to: "e" },
        { from: "d", to: "f" },
        { from: "e", to: "f" },
        { from: "f", to: "g" },
        { from: "b", to: "g" },
      ],
    },
    operation: "shortest-path",
    startNode: "a",
    targetNode: "g",
    distance: 2,
    explanation:
      "The route A-B-G uses two edges. Every route through C,D,E,F uses at least three, so BFS distance is 2.",
  }),
  graph({
    id: "q-hard-graph-unreachable",
    topicId: "analysis-mathematics",
    prompt: "Can G be reached from A by following the directed edges?",
    graph: {
      directed: true,
      nodes: nodes(["A", "B", "C", "D", "E", "F", "G"]),
      edges: [
        { from: "a", to: "b" },
        { from: "b", to: "c" },
        { from: "c", to: "a" },
        { from: "d", to: "e" },
        { from: "e", to: "f" },
        { from: "f", to: "d" },
      ],
    },
    operation: "reachability",
    startNode: "a",
    targetNode: "g",
    reachable: false,
    explanation:
      "A,B,C form a directed cycle and none of their outgoing edges enters G. The separate D,E,F cycle is also irrelevant.",
  }),
  graph({
    id: "q-hard-graph-adjacency-directed",
    topicId: "arrays-memory",
    prompt: "List the outgoing neighbors of D in listed node order; incoming edges do not count.",
    graph: {
      directed: true,
      nodes: nodes(["A", "B", "C", "D", "E", "F"]),
      edges: [
        { from: "a", to: "d" },
        { from: "d", to: "b" },
        { from: "d", to: "e" },
        { from: "c", to: "d" },
        { from: "d", to: "f" },
      ],
    },
    operation: "adjacency",
    nodeId: "d",
    adjacentNodes: ["b", "e", "f"],
    explanation: "Only arrows leaving D are considered: D to B, E, and F. A to D and C to D are incoming and excluded.",
  }),
  graph({
    id: "q-hard-graph-bfs-disconnected",
    topicId: "linked-lists",
    prompt: "Starting at C, give BFS order in the undirected graph; disconnected nodes are omitted.",
    graph: {
      directed: false,
      nodes: nodes(["A", "B", "C", "D", "E", "F", "G"]),
      edges: [
        { from: "a", to: "b" },
        { from: "b", to: "c" },
        { from: "c", to: "d" },
        { from: "a", to: "d" },
        { from: "e", to: "f" },
      ],
    },
    operation: "bfs-order",
    startNode: "c",
    answerOrder: ["c", "b", "d", "a"],
    explanation:
      "C first enqueues B and D. B adds A, while D finds A already visited. E,F and isolated G are disconnected from C.",
  }),
  graph({
    id: "q-hard-graph-dfs-backedge",
    topicId: "recursion",
    prompt: "Give DFS preorder from A in this graph containing a back-edge.",
    graph: {
      directed: true,
      nodes: nodes(["A", "B", "C", "D", "E"]),
      edges: [
        { from: "a", to: "b" },
        { from: "b", to: "c" },
        { from: "c", to: "a" },
        { from: "c", to: "d" },
        { from: "d", to: "e" },
      ],
    },
    operation: "dfs-order",
    startNode: "a",
    answerOrder: ["a", "b", "c", "d", "e"],
    explanation:
      "The edge C to A points to an already visited ancestor and does not recurse. DFS continues from C to D and then E.",
  }),
  graph({
    id: "q-hard-graph-two-shortest",
    topicId: "queues",
    prompt: "What is the shortest-path length from A to F when two equal routes exist?",
    graph: {
      directed: true,
      nodes: nodes(["A", "B", "C", "D", "E", "F"]),
      edges: [
        { from: "a", to: "b" },
        { from: "a", to: "c" },
        { from: "b", to: "d" },
        { from: "c", to: "e" },
        { from: "d", to: "f" },
        { from: "e", to: "f" },
        { from: "b", to: "e" },
      ],
    },
    operation: "shortest-path",
    startNode: "a",
    targetNode: "f",
    distance: 3,
    explanation: "A-B-D-F and A-B-E-F are both three edges; A-C-E-F is also three. No direct two-edge route exists.",
  }),
  graph({
    id: "q-hard-graph-reach-cycle",
    topicId: "tries",
    prompt: "Can F reach B in this directed graph?",
    graph: {
      directed: true,
      nodes: nodes(["A", "B", "C", "D", "E", "F"]),
      edges: [
        { from: "a", to: "b" },
        { from: "b", to: "c" },
        { from: "c", to: "b" },
        { from: "d", to: "e" },
        { from: "e", to: "f" },
        { from: "f", to: "d" },
      ],
    },
    operation: "reachability",
    startNode: "f",
    targetNode: "b",
    reachable: false,
    explanation:
      "D,E,F form one closed directed cycle and have no edge into the B,C component. The cycle does not make separate components reachable.",
  }),
  graph({
    id: "q-hard-graph-adjacency-undirected",
    topicId: "avl-trees",
    prompt: "List the undirected neighbors of E, preserving displayed node order.",
    graph: {
      directed: false,
      nodes: nodes(["A", "B", "C", "D", "E", "F", "G"]),
      edges: [
        { from: "a", to: "e" },
        { from: "b", to: "e" },
        { from: "e", to: "c" },
        { from: "d", to: "e" },
        { from: "e", to: "g" },
        { from: "e", to: "f" },
      ],
    },
    operation: "adjacency",
    nodeId: "e",
    adjacentNodes: ["a", "b", "c", "d", "f", "g"],
    explanation:
      "Undirected adjacency includes every edge touching E. The answer is sorted by the displayed node order, placing F before G.",
  }),
  graph({
    id: "q-hard-graph-bfs-order-tie",
    topicId: "hash-tables",
    prompt: "Starting at A, give BFS order when neighbors are enqueued in displayed node order.",
    graph: {
      directed: false,
      nodes: nodes(["A", "B", "C", "D", "E", "F", "G", "H"]),
      edges: [
        { from: "a", to: "d" },
        { from: "a", to: "b" },
        { from: "b", to: "e" },
        { from: "b", to: "f" },
        { from: "d", to: "g" },
        { from: "d", to: "h" },
        { from: "e", to: "g" },
      ],
    },
    operation: "bfs-order",
    startNode: "a",
    answerOrder: ["a", "b", "d", "e", "f", "g", "h"],
    explanation:
      "The displayed node order makes B enqueued before D even though the edge list mentions D first. B's layer is processed before D's layer, and shared G is marked once.",
  }),
  graph({
    id: "q-hard-graph-dfs-stack",
    topicId: "binary-trees",
    prompt: "Give iterative DFS preorder when a stack pushes neighbors in reverse displayed order.",
    graph: {
      directed: false,
      nodes: nodes(["A", "B", "C", "D", "E"]),
      edges: [
        { from: "a", to: "b" },
        { from: "a", to: "c" },
        { from: "b", to: "d" },
        { from: "c", to: "e" },
      ],
    },
    operation: "dfs-order",
    startNode: "a",
    answerOrder: ["a", "b", "d", "c", "e"],
    explanation: "Pushing C then B causes B to be popped first. B reaches D before the stack returns to C and then E.",
    assumptions: [
      "The graph is undirected.",
      "The iterative stack pushes a node's neighbors in reverse displayed order so the smallest displayed neighbor is popped first.",
      "A node is marked when popped if it has not already been visited.",
    ],
  }),
  graph({
    id: "q-hard-graph-no-path",
    topicId: "sorting",
    prompt: "What is the unweighted shortest-path result from A to F when no path exists?",
    graph: {
      directed: false,
      nodes: nodes(["A", "B", "C", "D", "E", "F"]),
      edges: [
        { from: "a", to: "b" },
        { from: "b", to: "c" },
        { from: "d", to: "e" },
      ],
    },
    operation: "shortest-path",
    startNode: "a",
    targetNode: "f",
    distance: -1,
    explanation:
      "F is isolated from A's component, so BFS exhausts the reachable nodes without assigning a distance. The sentinel answer is -1.",
  }),
  graph({
    id: "q-hard-graph-reach-self",
    topicId: "analysis-mathematics",
    prompt: "Is C reachable from C, even though no cycle is present?",
    graph: {
      directed: true,
      nodes: nodes(["A", "B", "C", "D"]),
      edges: [
        { from: "a", to: "b" },
        { from: "b", to: "c" },
        { from: "c", to: "d" },
      ],
    },
    operation: "reachability",
    startNode: "c",
    targetNode: "c",
    reachable: true,
    explanation:
      "Reachability includes a zero-edge path from a node to itself. A cycle is not required for the start node to reach itself by this convention.",
  }),
];
