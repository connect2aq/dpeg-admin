// Executive Copilot is restricted to a single admin account while the feature isn't
// ready for every admin yet -- this hides the nav link and gates the page itself.
export const EXECUTIVE_COPILOT_ALLOWED_EMAIL = "connect2aq+300@gmail.com";

export function isExecutiveCopilotAllowed(email: string | null | undefined): boolean {
  return typeof email === "string" && email.trim().toLowerCase() === EXECUTIVE_COPILOT_ALLOWED_EMAIL.toLowerCase();
}
