/**
 * The part of node's `assert/strict` the cases use. The test entry files (`*.test.mjs`) pass the
 * real module in; declaring it here keeps node's own types out of the app's type check.
 */
export interface Assert {
  ok(value: unknown, message?: string): void;
  equal(actual: unknown, expected: unknown, message?: string): void;
  notEqual(actual: unknown, expected: unknown, message?: string): void;
  deepEqual(actual: unknown, expected: unknown, message?: string): void;
  throws(fn: () => unknown, expected?: RegExp): void;
  fail(message?: string): never;
}

export interface Case {
  name: string;
  run(t: Assert): void;
}

/** A plain-object copy without undefined values or class instances, so deepEqual compares content only. */
export const plain = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
