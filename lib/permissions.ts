import type { AdminRole } from "./api";

// Single source of truth for role-based access across the admin portal.
// No fallback defaults here on purpose — a missing/unrecognized role resolves to "no access",
// never to SuperAdmin (see the fail-open bug this replaces).

export const ALL_ROLES: AdminRole[] = ["Maker", "Approver", "Management", "SuperAdmin"];
const EDIT_ROLES: AdminRole[] = ["Maker", "SuperAdmin"];
const READ_ONLY_ROLES: AdminRole[] = ["Management", "Approver"];

export const NAV_ACCESS: Record<string, AdminRole[]> = {
  "/executive-copilot": ["Management", "SuperAdmin"],
  "/dashboard": ALL_ROLES,
  "/users": ALL_ROLES,
  "/applications": ALL_ROLES,
  "/redemptions": ALL_ROLES,
  "/capital-ledger": ALL_ROLES,
  "/investor-statements": ALL_ROLES,
  "/daily-interest": ["Maker", "Approver", "SuperAdmin"],
  "/distributions": ["Maker", "Approver", "SuperAdmin"],
  "/pending-approvals": ["Maker", "Approver", "SuperAdmin"],
  "/settings": ["Maker", "Approver", "SuperAdmin"],
  "/email-logs": ["SuperAdmin"],
  "/docusign": ["SuperAdmin"],
  "/audit-log": ["SuperAdmin"],
  "/historical-import": ["SuperAdmin"],
};

// Whether `role` may see a given nav href. Routes not listed in NAV_ACCESS (e.g. dynamic detail
// pages like /users/[id]) default to "any authenticated admin" — list-page/detail-page visibility
// is governed by the parent nav entry.
export function canSeeNav(role: AdminRole | undefined, href: string): boolean {
  if (!role) return false;
  const allowed = NAV_ACCESS[href];
  return allowed ? allowed.includes(role) : true;
}

// Whether `role` may create/edit/delete records at all. This only controls the UI affordance —
// Maker writes still route through the maker-approver PendingChange workflow server-side (only
// SuperAdmin writes land directly); Management and Approver are blocked server-side regardless.
export function canEdit(role: AdminRole | undefined): boolean {
  return !!role && EDIT_ROLES.includes(role);
}

export function isReadOnlyRole(role: AdminRole | undefined): boolean {
  return !!role && READ_ONLY_ROLES.includes(role);
}

export function isSuperAdmin(role: AdminRole | undefined): boolean {
  return role === "SuperAdmin";
}

// Only an Approver (or SuperAdmin) may approve/reject a pending change.
export function canDecidePendingChange(role: AdminRole | undefined): boolean {
  return role === "Approver" || role === "SuperAdmin";
}
