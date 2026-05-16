import test from "node:test";
import assert from "node:assert/strict";

import {
  DATA_SUBJECT_RIGHTS,
  MINIMUM_TESTER_AGE,
  PRIVACY_PROCESSORS,
  SUPPORT_EMAIL,
  SUPPORT_MAILTO,
} from "./privacy.js";

test("privacy content exposes a professional support mailbox", () => {
  assert.equal(SUPPORT_EMAIL, "support@useattune.co");
  assert.match(SUPPORT_MAILTO, /^mailto:support@useattune\.co/);
});

test("privacy content positions Attune as adult-only for testing and launch", () => {
  assert.equal(MINIMUM_TESTER_AGE, 18);
});

test("privacy content names the core operators and user rights", () => {
  for (const processor of ["Supabase", "Vercel", "Upstash", "OpenAI", "Google Play"]) {
    assert.ok(PRIVACY_PROCESSORS.includes(processor));
  }

  for (const right of ["access", "correction", "deletion", "objection"]) {
    assert.ok(DATA_SUBJECT_RIGHTS.some((item) => item.toLowerCase().includes(right)));
  }
});
