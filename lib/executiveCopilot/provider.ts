// Executive-Copilot-specific provider selection. This is the one place that reads
// EXECUTIVE_COPILOT_PROVIDER and picks/configures a concrete CopilotProvider — the
// generic engine (lib/copilotEngine.ts) and the provider implementations
// (lib/copilotProviders/*) know nothing about which one is active.
import { AnthropicProvider, type AnthropicEffort } from "@/lib/copilotProviders/anthropicProvider";
import { DeepSeekProvider, type DeepSeekReasoningEffort } from "@/lib/copilotProviders/deepseekProvider";
import type { CopilotProvider } from "@/lib/copilotProviders/types";

export type CopilotProviderName = "anthropic" | "deepseek";

// Returns null if the selected provider's API key isn't configured for this environment
// — callers should treat that as "not configured" and fail safe rather than attempt a call.
export function buildExecutiveCopilotProvider(): CopilotProvider | null {
  const providerName = (process.env.EXECUTIVE_COPILOT_PROVIDER as CopilotProviderName) || "deepseek";

  if (providerName === "deepseek") {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) return null;
    // deepseek-chat / deepseek-reasoner are deprecated 2026-07-24 — deepseek-v4-flash's
    // "thinking" toggle now covers both of their former roles.
    const model = process.env.EXECUTIVE_COPILOT_MODEL || "deepseek-v4-flash";
    const reasoningEffort =
      (process.env.EXECUTIVE_COPILOT_DEEPSEEK_EFFORT as DeepSeekReasoningEffort) || "high";
    return new DeepSeekProvider(apiKey, model, reasoningEffort);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  const model = process.env.EXECUTIVE_COPILOT_MODEL || "claude-sonnet-5";
  const effort = (process.env.EXECUTIVE_COPILOT_EFFORT as AnthropicEffort) || "medium";
  return new AnthropicProvider(apiKey, model, effort);
}
