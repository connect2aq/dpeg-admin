// Executive-Copilot-specific provider selection. This is the one place that reads
// EXECUTIVE_COPILOT_PROVIDER and picks/configures a concrete CopilotProvider — the
// generic engine (lib/copilotEngine.ts) and the provider implementations
// (lib/copilotProviders/*) know nothing about which one is active.
import { AnthropicProvider, type AnthropicEffort } from "@/lib/copilotProviders/anthropicProvider";
import { DeepSeekProvider, type DeepSeekReasoningEffort } from "@/lib/copilotProviders/deepseekProvider";
import type { CopilotProvider } from "@/lib/copilotProviders/types";

export type CopilotProviderName = "anthropic" | "deepseek";

const ANTHROPIC_EFFORTS: AnthropicEffort[] = ["low", "medium", "high", "xhigh", "max"];
const DEEPSEEK_EFFORTS: DeepSeekReasoningEffort[] = ["high", "max"];

// Per-request overrides from the model/effort selector in the UI — both optional. An
// unrecognized effort value is ignored (falls back to the env-configured default) rather
// than rejected, since this is a convenience picker, not a validated API contract.
export interface ProviderOverrides {
  provider?: string;
  effort?: string;
}

export function providerEffortOptions(providerName: CopilotProviderName): string[] {
  return providerName === "deepseek" ? DEEPSEEK_EFFORTS : ANTHROPIC_EFFORTS;
}

// Returns null if the selected provider's API key isn't configured for this environment
// — callers should treat that as "not configured" and fail safe rather than attempt a call.
export function buildExecutiveCopilotProvider(overrides?: ProviderOverrides): CopilotProvider | null {
  const providerName =
    (overrides?.provider as CopilotProviderName) ||
    (process.env.EXECUTIVE_COPILOT_PROVIDER as CopilotProviderName) ||
    "deepseek";

  if (providerName === "deepseek") {
    const apiKey = process.env.DEEPSEEK_API_KEY;
    if (!apiKey) return null;
    // deepseek-chat / deepseek-reasoner are deprecated 2026-07-24 — deepseek-v4-flash's
    // "thinking" toggle now covers both of their former roles.
    const model = process.env.EXECUTIVE_COPILOT_MODEL || "deepseek-v4-flash";
    const requestedEffort = overrides?.effort as DeepSeekReasoningEffort | undefined;
    const reasoningEffort =
      requestedEffort && DEEPSEEK_EFFORTS.includes(requestedEffort)
        ? requestedEffort
        : (process.env.EXECUTIVE_COPILOT_DEEPSEEK_EFFORT as DeepSeekReasoningEffort) || "high";
    return new DeepSeekProvider(apiKey, model, reasoningEffort);
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return null;
  const model = process.env.EXECUTIVE_COPILOT_MODEL || "claude-sonnet-5";
  const requestedEffort = overrides?.effort as AnthropicEffort | undefined;
  const effort =
    requestedEffort && ANTHROPIC_EFFORTS.includes(requestedEffort)
      ? requestedEffort
      : (process.env.EXECUTIVE_COPILOT_EFFORT as AnthropicEffort) || "medium";
  return new AnthropicProvider(apiKey, model, effort);
}
