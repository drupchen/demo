// Shared role + access-level validation for the admin API routes.
// role governs admin-panel access only; access_level (0–4) governs content access.

export const ROLES = new Set(["member", "admin"]);

/** True when v is an integer access level in the valid 0–4 range. */
export function validLevel(v) {
  return Number.isInteger(v) && v >= 0 && v <= 4;
}
