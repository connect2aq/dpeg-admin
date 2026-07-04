// DeepSeek exposes a real account-balance endpoint (verified against
// https://api-docs.deepseek.com/api/get-user-balance, 2026-07-04): GET /user/balance,
// authenticated with the same API key used for inference, returning is_available plus a
// balance_infos array (one entry per currency: total/granted/topped_up balance as strings).
// Anthropic has no equivalent — its Admin API only exposes usage/cost reports (a separate,
// org-scoped credential), not a remaining-balance figure — so there is no Anthropic
// counterpart to this file; the UI shows a "not available" note for that provider instead.
const DEEPSEEK_BALANCE_URL = "https://api.deepseek.com/user/balance";
const CACHE_MS = 60_000; // balance changes slowly — avoid hitting DeepSeek on every dashboard load

export interface DeepSeekBalance {
  isAvailable: boolean;
  currency: string;
  totalBalance: string;
}

let cache: { fetchedAt: number; value: DeepSeekBalance | null } | null = null;

export async function fetchDeepSeekBalance(apiKey: string): Promise<DeepSeekBalance | null> {
  if (cache && Date.now() - cache.fetchedAt < CACHE_MS) return cache.value;

  let value: DeepSeekBalance | null = null;
  try {
    const res = await fetch(DEEPSEEK_BALANCE_URL, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (res.ok) {
      const json = await res.json();
      const info = json.balance_infos?.[0];
      if (info) {
        value = {
          isAvailable: Boolean(json.is_available),
          currency: String(info.currency),
          totalBalance: String(info.total_balance),
        };
      }
    }
  } catch (err) {
    console.error("[executive-copilot] DeepSeek balance check failed:", err);
  }

  cache = { fetchedAt: Date.now(), value };
  return value;
}
