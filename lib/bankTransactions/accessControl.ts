// Bank Transactions is restricted to a single admin account for now — this hides the nav link.
export const BANK_TRANSACTIONS_ALLOWED_EMAIL = "abdulqadir.khan@integrationxperts.com";

export function isBankTransactionsAllowed(email: string | null | undefined): boolean {
  return typeof email === "string" && email.trim().toLowerCase() === BANK_TRANSACTIONS_ALLOWED_EMAIL.toLowerCase();
}
