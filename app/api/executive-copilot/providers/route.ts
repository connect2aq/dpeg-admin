import { NextRequest, NextResponse } from "next/server";
import { providerEffortOptions, type CopilotProviderName } from "@/lib/executiveCopilot/provider";
import { fetchDeepSeekBalance } from "@/lib/executiveCopilot/deepseekBalance";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const EFFORT_LABELS: Record<string, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  xhigh: "X-High",
  max: "Max",
};

interface ProviderStatus {
  id: CopilotProviderName;
  label: string;
  configured: boolean;
  effortOptions: { value: string; label: string }[];
  defaultEffort: string;
  balanceText?: string;
  balanceLow?: boolean;
  balanceNote?: string;
}

// Read-only status/config lookup — no LLM call, so no rate limiting, but still gated
// behind the same bearer-token presence check as the rest of Executive Copilot since it
// reveals which provider is configured and (for DeepSeek) the account's remaining balance.
export async function GET(req: NextRequest) {
  const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) {
    return NextResponse.json({ error: "Missing auth token" }, { status: 401 });
  }

  const deepseekKey = process.env.DEEPSEEK_API_KEY;
  const deepseekConfigured = !!deepseekKey;
  const deepseekBalance = deepseekConfigured ? await fetchDeepSeekBalance(deepseekKey!) : null;

  const providers: ProviderStatus[] = [
    {
      id: "deepseek",
      label: "DeepSeek",
      configured: deepseekConfigured,
      effortOptions: providerEffortOptions("deepseek").map((v) => ({ value: v, label: EFFORT_LABELS[v] || v })),
      defaultEffort: process.env.EXECUTIVE_COPILOT_DEEPSEEK_EFFORT || "high",
      ...(deepseekConfigured
        ? deepseekBalance
          ? { balanceText: `${deepseekBalance.currency} ${deepseekBalance.totalBalance}`, balanceLow: !deepseekBalance.isAvailable }
          : { balanceNote: "Balance temporarily unavailable" }
        : {}),
    },
    {
      id: "anthropic",
      label: "Claude",
      configured: !!process.env.ANTHROPIC_API_KEY,
      effortOptions: providerEffortOptions("anthropic").map((v) => ({ value: v, label: EFFORT_LABELS[v] || v })),
      defaultEffort: process.env.EXECUTIVE_COPILOT_EFFORT || "medium",
      // Anthropic has no API for checking remaining prepaid balance — only org-scoped
      // usage/cost reports via a separate Admin credential — so there's nothing to show.
      balanceNote: "Balance not available via API — check console.claude.com",
    },
  ];

  return NextResponse.json({ providers });
}
