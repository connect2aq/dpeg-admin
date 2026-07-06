import { describe, it, expect } from "vitest";
import { isExecutiveCopilotAllowed, EXECUTIVE_COPILOT_ALLOWED_EMAIL } from "./accessControl";

describe("isExecutiveCopilotAllowed", () => {
  it("allows the exact configured email", () => {
    expect(isExecutiveCopilotAllowed(EXECUTIVE_COPILOT_ALLOWED_EMAIL)).toBe(true);
  });

  it("is case-insensitive", () => {
    expect(isExecutiveCopilotAllowed(EXECUTIVE_COPILOT_ALLOWED_EMAIL.toUpperCase())).toBe(true);
  });

  it("ignores surrounding whitespace", () => {
    expect(isExecutiveCopilotAllowed(`  ${EXECUTIVE_COPILOT_ALLOWED_EMAIL}  `)).toBe(true);
  });

  it("rejects any other email", () => {
    expect(isExecutiveCopilotAllowed("someone-else@dpeg.com")).toBe(false);
  });

  it("rejects null, undefined, or empty string", () => {
    expect(isExecutiveCopilotAllowed(null)).toBe(false);
    expect(isExecutiveCopilotAllowed(undefined)).toBe(false);
    expect(isExecutiveCopilotAllowed("")).toBe(false);
  });
});
