import test from "node:test";
import assert from "node:assert/strict";
import { slugify } from "./slug.js";

test("normalizes a phrase", () => {
  assert.equal(slugify("Hello World"), "hello-world");
});

test("normalizes every whitespace run", () => {
  assert.equal(slugify("one   two   three"), "one-two-three");
});
