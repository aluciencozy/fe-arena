import type { CodingProblem } from "./domain.js";

/** Original, deterministic browser-practice fixtures. The harness is compiled with the student's function. */
export const CODING_PROBLEMS: readonly CodingProblem[] = [
  {
    id: "c-sum-array",
    title: "Sum an integer array",
    description: "Return the sum of the first length elements in values. The input array is valid and non-empty.",
    functionSignature: "int sum_array(const int values[], size_t length)",
    starterCode: "int total = 0;\nfor (size_t i = 0; i < length; i++) {\n  total += values[i];\n}\nreturn total;",
    prefix: "#include <stddef.h>\n#include <stdio.h>\n\n",
    testHarness: `int main(void) {
  const int first[] = {3, -2, 7, 4};
  const int second[] = {10, 0, -5};
  int first_result = sum_array(first, 4);
  int second_result = sum_array(second, 3);
  printf("FEA_TEST|1|mixed values|%s\\n", first_result == 12 ? "PASS" : "FAIL");
  printf("FEA_TEST|2|zero included|%s\\n", second_result == 5 ? "PASS" : "FAIL");
  return 0;
}`,
  },
  {
    id: "c-reverse-array",
    title: "Reverse an array in place",
    description: "Reverse the first length integers in values in place. Do not allocate a second array.",
    functionSignature: "void reverse_array(int values[], size_t length)",
    starterCode:
      "for (size_t left = 0; left < length / 2; left++) {\n  size_t right = length - 1 - left;\n  int temporary = values[left];\n  values[left] = values[right];\n  values[right] = temporary;\n}",
    prefix: "#include <stddef.h>\n#include <stdio.h>\n\n",
    testHarness: `static int same_values(const int left[], const int right[], size_t length) {
  for (size_t i = 0; i < length; i++) if (left[i] != right[i]) return 0;
  return 1;
}

int main(void) {
  int odd[] = {1, 2, 3, 4, 5};
  int odd_expected[] = {5, 4, 3, 2, 1};
  int even[] = {8, 9, 10, 11};
  int even_expected[] = {11, 10, 9, 8};
  reverse_array(odd, 5);
  reverse_array(even, 4);
  printf("FEA_TEST|1|odd length|%s\\n", same_values(odd, odd_expected, 5) ? "PASS" : "FAIL");
  printf("FEA_TEST|2|even length|%s\\n", same_values(even, even_expected, 4) ? "PASS" : "FAIL");
  return 0;
}`,
  },
  {
    id: "c-count-vowels",
    title: "Count vowels in a string",
    description: "Return how many lowercase or uppercase vowels appear in the null-terminated text.",
    functionSignature: "int count_vowels(const char text[])",
    starterCode:
      "int count = 0;\nfor (size_t i = 0; text[i] != '\\0'; i++) {\n  char character = text[i];\n  if (character == 'a' || character == 'e' || character == 'i' || character == 'o' || character == 'u' ||\n      character == 'A' || character == 'E' || character == 'I' || character == 'O' || character == 'U') {\n    count++;\n  }\n}\nreturn count;",
    prefix: "#include <stddef.h>\n#include <stdio.h>\n\n",
    testHarness: `int main(void) {
  int first = count_vowels("FE Arena");
  int second = count_vowels("rhythm");
  printf("FEA_TEST|1|mixed case|%s\\n", first == 4 ? "PASS" : "FAIL");
  printf("FEA_TEST|2|no vowels|%s\\n", second == 0 ? "PASS" : "FAIL");
  return 0;
}`,
  },
];

export const codingProblemById = new Map(CODING_PROBLEMS.map((problem) => [problem.id, problem]));
