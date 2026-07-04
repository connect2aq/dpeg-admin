import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { isRateLimited } from "./rateLimit";

// isRateLimited keys its in-memory log by the string passed in — a fresh, unique key per
// test avoids cross-test interference without needing to reset any module state.
let keyCounter = 0;
function freshKey() {
  keyCounter += 1;
  return `test-key-${keyCounter}`;
}

describe("isRateLimited", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows requests under the limit", () => {
    const key = freshKey();
    for (let i = 0; i < 10; i++) {
      expect(isRateLimited(key)).toBe(false);
    }
  });

  it("blocks the 11th request within the same window", () => {
    const key = freshKey();
    for (let i = 0; i < 10; i++) isRateLimited(key);
    expect(isRateLimited(key)).toBe(true);
  });

  it("does not block a different key", () => {
    const key = freshKey();
    for (let i = 0; i < 10; i++) isRateLimited(key);
    expect(isRateLimited(freshKey())).toBe(false);
  });

  it("allows requests again once the window has passed", () => {
    const key = freshKey();
    for (let i = 0; i < 10; i++) isRateLimited(key);
    expect(isRateLimited(key)).toBe(true);

    vi.advanceTimersByTime(60_001);

    expect(isRateLimited(key)).toBe(false);
  });
});
