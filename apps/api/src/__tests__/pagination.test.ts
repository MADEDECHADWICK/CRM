import { test, describe } from "node:test";
import assert from "node:assert/strict";

import { pageOf, DEFAULT_LIMIT } from "../lib/pagination";

describe("pagination", () => {
  test("applies the default page when nothing is supplied", () => {
    assert.deepEqual(pageOf({}), { take: DEFAULT_LIMIT, skip: 0 });
  });

  test("honours an explicit limit and offset", () => {
    assert.deepEqual(pageOf({ limit: 5, offset: 10 }), { take: 5, skip: 10 });
  });

  test("offset alone leaves the take at the default", () => {
    assert.deepEqual(pageOf({ offset: 40 }), { take: DEFAULT_LIMIT, skip: 40 });
  });
});
