import assert from "node:assert/strict";
import test from "node:test";
import { calculateGuessDamage } from "./game.service.js";

test("a guess four seconds later loses meaningful damage", () => {
  const immediateDamage = calculateGuessDamage(0, 1);
  const delayedDamage = calculateGuessDamage(4, 1);

  assert.equal(immediateDamage, 1000);
  assert.equal(delayedDamage, 656);
  assert.ok(delayedDamage <= immediateDamage * 0.7);
});

test("consecutive first guesses compound damage by 1.5x", () => {
  assert.equal(calculateGuessDamage(0, 1), 1000);
  assert.equal(calculateGuessDamage(0, 2), 1500);
  assert.equal(calculateGuessDamage(0, 3), 2250);
});

test("later guesses do not inherit the first guesser's streak", () => {
  assert.equal(calculateGuessDamage(4, 1), 656);
  assert.equal(calculateGuessDamage(4, 3), 1476);
});
