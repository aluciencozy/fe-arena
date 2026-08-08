import assert from "node:assert/strict";
import test from "node:test";
import { isPrivateCreateResponseForActiveRequest } from "./private-create";

test("correlates room creation responses to the active request", () => {
  assert.equal(isPrivateCreateResponseForActiveRequest(null, "timed-out"), false);
  assert.equal(isPrivateCreateResponseForActiveRequest("new-request", "timed-out"), false);
  assert.equal(isPrivateCreateResponseForActiveRequest("new-request", "new-request"), true);
  assert.equal(isPrivateCreateResponseForActiveRequest("new-request", undefined), false);
});
