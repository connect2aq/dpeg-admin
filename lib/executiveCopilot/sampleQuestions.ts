// A pool of curated example questions spanning the domains the copilot can actually
// answer (cash, redemptions, DocuSign, distributions, pending approvals, capital trends)
// — shown before the admin's first question to demonstrate the kind of open-ended
// question the tool handles, rather than leaving a blank input box to stare at.
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
];

export function pickRandomQuestions(count: number): string[] {
  const pool = [...SAMPLE_QUESTION_POOL];
  const picked: string[] = [];
  for (let i = 0; i < count && pool.length > 0; i++) {
    const idx = Math.floor(Math.random() * pool.length);
    picked.push(pool.splice(idx, 1)[0]);
  }
  return picked;
}
