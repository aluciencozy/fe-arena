import assert from "node:assert/strict";
import test from "node:test";
import { findTypeaheadOptionIndex, type SelectOption } from "./select-options";

const options: SelectOption[] = [
  { value: "60", label: "60 sec" },
  { value: "90", label: "90 sec" },
  { value: "120", label: "120 sec" },
  { value: "300", label: "5 min" },
];

test("typeahead matches option labels and values", () => {
  assert.equal(findTypeaheadOptionIndex(options, "5"), 3);
  assert.equal(findTypeaheadOptionIndex(options, "12"), 2);
  assert.equal(findTypeaheadOptionIndex(options, "90"), 1);
  assert.equal(findTypeaheadOptionIndex(options, "xyz"), -1);
});
