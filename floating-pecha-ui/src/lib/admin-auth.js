import { NextResponse } from "next/server";
import { auth } from "@/auth";

/**
 * Authorization guard for /api/admin/* routes. Returns { session } when the
 * caller is an admin, or { response } with a 401/403 JSON error otherwise.
 *
 * Usage:
 *   const { session, response } = await requireAdmin();
 *   if (response) return response;
 *   // ... session.user.role === "admin" guaranteed
 */
export async function requireAdmin() {
  const session = await auth();
  if (!session?.user) {
    return {
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  if (session.user.role !== "admin") {
    return {
      response: NextResponse.json({ error: "Forbidden" }, { status: 403 }),
    };
  }
  return { session };
}
