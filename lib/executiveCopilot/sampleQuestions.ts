// A pool of curated example questions spanning the domains the copilot can actually
// answer (cash, redemptions, DocuSign, distributions, applications, capital trends,
// concentration risk) — shown before the admin's first question to demonstrate the kind
// of open-ended question the tool handles, rather than leaving a blank input box to stare
// at.
export const SAMPLE_QUESTION_POOL: string[] = [
  "How much cash do we have available today?",
  "Which redemptions are due this week but don't have a signed DocuSign yet?",
  "How does this month's distribution obligation compare to last month?",
  "How is total capital raised trending over the past few months?",
  "Which investor type has the highest redemption rate?",
  "How much interest did we pay on redemptions last month?",
  "Show me investors still waiting on DocuSign.",
  "How has our cash position changed this month, and why?",
  "How does this quarter's redemption activity compare to last quarter?",
  "How many new investment applications came in this week?",
  "Which distributions are still unpaid this month?",
  "Which investor segment is growing the fastest right now?",
  "How does this month's capital raised compare to last month's?",
  "Which applications are still under review, and for how long?",
  "What's our total capital deployed versus redeemed so far?",
  "Is our cash on hand enough to cover this month's distributions and any pending redemptions?",
  "What's our net capital flow this quarter — new investments minus redemptions and distributions?",
  "Which investors account for the largest share of total capital raised?",
  "How long does it typically take an application to go from submission to fully signed?",
  "What percentage of applications get rejected, and has that changed recently?",
  "How many active investors do we have, and how has that grown over time?",
  "What's the average investment size for new applications this quarter?",
  "Are any investors concentrated enough to be a risk if they redeemed all at once?",
  "How reliably are distributions being paid on time each month?",
  "Which DocuSign envelopes have been sitting unsigned the longest?",
  "How does our redemption rate compare across ShortTerm vs LongTerm investments?",
  "What's the trend in new applications by investor type over the last few months?",
  "How much capital is currently deployed versus sitting in cash?",
  "Which investors have both an active investment and a pending redemption?",
  "How has our total assets under management changed over the past quarter?",
];

// Draws `count` questions the admin hasn't already seen this cycle. `shown` is the list of
// questions already shown, passed in (and returned, updated) rather than owned here, so
// this stays a pure function the caller can persist however it likes (localStorage, in
// this app's case) without this module knowing anything about browser storage.
//
// Once fewer than `count` unseen questions remain, the cycle is treated as exhausted and
// restarts from the full pool — this is a deliberate choice: it means the very last few
// unseen questions of a cycle are skipped over rather than shown as a partial batch, so
// every batch the admin sees is always a full, fresh set of `count` questions.
export function pickNextQuestions(shown: string[], count: number): { picked: string[]; shown: string[] } {
  const shownSet = new Set(shown);
  let available = SAMPLE_QUESTION_POOL.filter((q) => !shownSet.has(q));
  let carriedOver = shown;

  if (available.length < count) {
    available = [...SAMPLE_QUESTION_POOL];
    carriedOver = [];
  }

  const pool = [...available];
  const picked: string[] = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    picked.push(pool.splice(idx, 1)[0]);
  }

  return { picked, shown: [...carriedOver, ...picked] };
}
