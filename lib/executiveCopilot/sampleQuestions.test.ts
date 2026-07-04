import { describe, it, expect } from "vitest";
import { SAMPLE_QUESTION_POOL, pickRandomQuestions } from "./sampleQuestions";

describe("SAMPLE_QUESTION_POOL", () => {
  it("has no duplicate questions", () => {
    expect(new Set(SAMPLE_QUESTION_POOL).size).toBe(SAMPLE_QUESTION_POOL.length);
  });

  it("has at least 3 questions (the number shown at once)", () => {
    expect(SAMPLE_QUESTION_POOL.length).toBeGreaterThanOrEqual(3);
  });
});

describe("pickRandomQuestions", () => {
  it("returns the requested count", () => {
    expect(pickRandomQuestions(3)).toHaveLength(3);
  });

  it("never returns duplicates", () => {
    for (let i = 0; i < 50; i++) {
      const picked = pickRandomQuestions(3);
      expect(new Set(picked).size).toBe(picked.length);
    }
  });

  it("only returns questions from the pool", () => {
    const picked = pickRandomQuestions(3);
    picked.forEach((q) => expect(SAMPLE_QUESTION_POOL).toContain(q));
  });

  it("does not mutate the shared pool", () => {
    const before = [...SAMPLE_QUESTION_POOL];
    pickRandomQuestions(3);
    expect(SAMPLE_QUESTION_POOL).toEqual(before);
  });

  it("caps out at the pool size when asked for more than it has", () => {
    const picked = pickRandomQuestions(SAMPLE_QUESTION_POOL.length + 10);
    expect(picked).toHaveLength(SAMPLE_QUESTION_POOL.length);
  });

  it("produces some variety across repeated calls", () => {
    // Not a strict guarantee (it's random), but with 15 questions and 20 draws of 3,
    // seeing the exact same set every time would indicate pickRandomQuestions is broken
    // (e.g. always picking index 0 first).
    const draws = new Set(Array.from({ length: 20 }, () => pickRandomQuestions(3).join("|")));
    expect(draws.size).toBeGreaterThan(1);
  });
});
