import { test, describe } from "node:test";
import assert from "node:assert/strict";

import {
  loginKey,
  loginBlockedFor,
  recordLoginFailure,
  clearLoginFailures,
} from "../middleware/rateLimit";

const req = (email: string, ip = "1.2.3.4") => ({ body: { email }, ip }) as never;

describe("login throttle", () => {
  test("key is case/space-insensitive on email and scoped by client ip", () => {
    assert.equal(loginKey(req("  A@B.CoM ")), "1.2.3.4|a@b.com");
    assert.notEqual(loginKey(req("a@b.com", "9.9.9.9")), loginKey(req("a@b.com", "1.2.3.4")));
  });

  test("not blocked before the limit is reached", () => {
    const key = loginKey(req("below@y.com"));
    clearLoginFailures(key);
    for (let i = 0; i < 5; i++) recordLoginFailure(key);
    assert.equal(loginBlockedFor(key), 0);
  });

  test("blocked after repeated failures, and only for that key", () => {
    const key = loginKey(req("flood@y.com"));
    clearLoginFailures(key);
    for (let i = 0; i < 25; i++) recordLoginFailure(key);
    assert.ok(loginBlockedFor(key) > 0);
    assert.equal(loginBlockedFor(loginKey(req("someone@else.com"))), 0);
  });

  test("a success clears the counter", () => {
    const key = loginKey(req("comeback@y.com"));
    for (let i = 0; i < 25; i++) recordLoginFailure(key);
    assert.ok(loginBlockedFor(key) > 0);
    clearLoginFailures(key);
    assert.equal(loginBlockedFor(key), 0);
  });
});
