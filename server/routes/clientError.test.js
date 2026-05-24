import assert from "node:assert/strict";
import test from "node:test";

import { redactClientErrorText } from "./clientError.js";

test("client error redaction removes emails, URL tokens, and JWT-looking values", () => {
  const jwt = "eyJabcdefghijklmnopqrstuvwxyz.eyJabcdefghijklmnopqrstuvwxyz.signaturevalue12345";
  const text = [
    "Contact user@example.com",
    "https://example.com/callback?access_token=secret&otp=123456",
    jwt,
  ].join(" ");

  const redacted = redactClientErrorText(text, 500);

  assert.equal(redacted.includes("user@example.com"), false);
  assert.equal(redacted.includes("secret"), false);
  assert.equal(redacted.includes(jwt), false);
  assert.equal(redacted.includes("[redacted-email]"), true);
  assert.equal(redacted.includes("access_token=[redacted]"), true);
  assert.equal(redacted.includes("[redacted-jwt]"), true);
});

test("client error redaction clamps text and returns undefined for empty input", () => {
  assert.equal(redactClientErrorText("", 10), undefined);
  assert.equal(redactClientErrorText("   ", 10), undefined);
  assert.equal(redactClientErrorText("abcdefghijklmnop", 5), "abcde");
});
