import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { buildExecutiveCopilotProvider, providerEffortOptions } from "./provider";
import { AnthropicProvider } from "@/lib/copilotProviders/anthropicProvider";
import { DeepSeekProvider } from "@/lib/copilotProviders/deepseekProvider";

describe("providerEffortOptions", () => {
  it("lists DeepSeek's narrower effort range", () => {
    expect(providerEffortOptions("deepseek")).toEqual(["high", "max"]);
  });

  it("lists Anthropic's full effort range", () => {
    expect(providerEffortOptions("anthropic")).toEqual(["low", "medium", "high", "xhigh", "max"]);
  });
});

describe("buildExecutiveCopilotProvider", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    delete process.env.EXECUTIVE_COPILOT_PROVIDER;
    delete process.env.DEEPSEEK_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.EXECUTIVE_COPILOT_EFFORT;
    delete process.env.EXECUTIVE_COPILOT_DEEPSEEK_EFFORT;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns null when the default provider's key isn't configured", () => {
    expect(buildExecutiveCopilotProvider()).toBeNull();
  });

  it("defaults to DeepSeek when its key is present and no override is given", () => {
    process.env.DEEPSEEK_API_KEY = "sk-test";
    expect(buildExecutiveCopilotProvider()).toBeInstanceOf(DeepSeekProvider);
  });

  it("falls back to Anthropic when EXECUTIVE_COPILOT_PROVIDER is anything other than deepseek", () => {
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    process.env.EXECUTIVE_COPILOT_PROVIDER = "anthropic";
    expect(buildExecutiveCopilotProvider()).toBeInstanceOf(AnthropicProvider);
  });

  it("returns null when the explicitly requested provider's key is missing, even if another provider is configured", () => {
    process.env.DEEPSEEK_API_KEY = "sk-test"; // deepseek IS configured
    // but the admin explicitly asked for anthropic, which is NOT configured
    expect(buildExecutiveCopilotProvider({ provider: "anthropic" })).toBeNull();
  });

  it("honors a per-request provider override", () => {
    process.env.DEEPSEEK_API_KEY = "sk-test";
    process.env.ANTHROPIC_API_KEY = "sk-ant-test";
    process.env.EXECUTIVE_COPILOT_PROVIDER = "deepseek";
    expect(buildExecutiveCopilotProvider({ provider: "anthropic" })).toBeInstanceOf(AnthropicProvider);
  });

  it("falls back to the env-configured effort when an invalid effort override is given", () => {
    process.env.DEEPSEEK_API_KEY = "sk-test";
    process.env.EXECUTIVE_COPILOT_DEEPSEEK_EFFORT = "max";
    // "medium" isn't a valid DeepSeek effort (only "high"/"max") -- should silently fall
    // back to the configured default rather than throw or pass an invalid value to the SDK.
    const provider = buildExecutiveCopilotProvider({ effort: "medium" }) as unknown as { reasoningEffort: string };
    expect(provider.reasoningEffort).toBe("max");
  });

  it("honors a valid effort override", () => {
    process.env.DEEPSEEK_API_KEY = "sk-test";
    process.env.EXECUTIVE_COPILOT_DEEPSEEK_EFFORT = "high";
    const provider = buildExecutiveCopilotProvider({ effort: "max" }) as unknown as { reasoningEffort: string };
    expect(provider.reasoningEffort).toBe("max");
  });
});
