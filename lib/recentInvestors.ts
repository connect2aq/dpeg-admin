const STORAGE_KEY = "dpeg_admin_recent_investors";
const MAX_ENTRIES = 20;

export interface RecentInvestor {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
  viewedAt: string;
}

function readAll(): RecentInvestor[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function addRecentInvestor(investor: {
  id: number;
  firstName: string;
  lastName: string;
  email: string;
}) {
  if (typeof window === "undefined") return;
  const existing = readAll().filter((r) => r.id !== investor.id);
  const next = [
    { ...investor, viewedAt: new Date().toISOString() },
    ...existing,
  ].slice(0, MAX_ENTRIES);
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // localStorage unavailable (private browsing, quota, etc.) -- non-critical, ignore.
  }
}

export function getRecentInvestors(limit = 5): RecentInvestor[] {
  return readAll().slice(0, limit);
}
