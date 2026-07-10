import { describe, it, expect } from "vitest";
import { SAMPLE_QUESTION_POOL, pickNextQuestions } from "./sampleQuestions";

describe("SAMPLE_QUESTION_POOL", () => {
  it("has no duplicate questions", () => {
    expect(new Set(SAMPLE_QUESTION_POOL).size).toBe(SAMPLE_QUESTION_POOL.length);
  });

  it("has at least 3 questions (the number shown at once)", () => {
    expect(SAMPLE_QUESTION_POOL.length).toBeGreaterThanOrEqual(3);
  });
});

describe("pickNextQuestions", () => {
  it("returns the requested count on a fresh (empty) history", () => {
    const { picked } = pickNextQuestions([], 3);
    expect(picked).toHaveLength(3);
  });

  it("never returns duplicates within one batch", () => {
    for (let i = 0; i < 50; i++) {
      const { picked } = pickNextQuestions([], 3);
      expect(new Set(picked).size).toBe(picked.length);
    }
  });

  it("only returns questions from the pool", () => {
    const { picked } = pickNextQuestions([], 3);
    picked.forEach((q) => expect(SAMPLE_QUESTION_POOL).toContain(q));
  });

  it("does not repeat a question already in the shown history", () => {
    const alreadyShown = SAMPLE_QUESTION_POOL.slice(0, SAMPLE_QUESTION_POOL.length - 3);
    const { picked } = pickNextQuestions(alreadyShown, 3);
    // Only 3 questions are left unseen -- this batch must be exactly those 3.
    const remaining = SAMPLE_QUESTION_POOL.slice(SAMPLE_QUESTION_POOL.length - 3);
    expect(new Set(picked)).toEqual(new Set(remaining));
  });

  it("accumulates shown history across calls until the pool is exhausted", () => {
    let shown: string[] = [];
    const seenAcrossBatches = new Set<string>();
    const batchesUntilExhausted = Math.floor(SAMPLE_QUESTION_POOL.length / 3);

    for (let i = 0; i < batchesUntilExhausted; i++) {
      const result = pickNextQuestions(shown, 3);
      result.picked.forEach((q) => {
        // No question should reappear before the pool is exhausted.
        expect(seenAcrossBatches.has(q)).toBe(false);
        seenAcrossBatches.add(q);
      });
      shown = result.shown;
    }
  });

  it("resets and starts a fresh cycle once fewer than `count` questions remain unseen", () => {
    // Simulate having shown all but 1 question -- fewer than the requested count of 3, so
    // this should reset to a fresh full-pool draw rather than return a partial batch.
    const almostAllShown = SAMPLE_QUESTION_POOL.slice(0, SAMPLE_QUESTION_POOL.length - 1);
    const { picked, shown } = pickNextQuestions(almostAllShown, 3);
    expect(picked).toHaveLength(3);
    // The new shown history should be just this fresh batch, not the old near-complete one.
    expect(shown).toHaveLength(3);
  });

  it("does not mutate the shared pool", () => {
    const before = [...SAMPLE_QUESTION_POOL];
    pickNextQuestions([], 3);
    expect(SAMPLE_QUESTION_POOL).toEqual(before);
  });

  it("caps out at the pool size when asked for more than it has", () => {
    const { picked } = pickNextQuestions([], SAMPLE_QUESTION_POOL.length + 10);
    expect(picked).toHaveLength(SAMPLE_QUESTION_POOL.length);
  });
});
