import { NextResponse } from "next/server";
import { auth } from "@/auth";

/**
 * Authorization guard for /api/notes* routes. Returns { session } when a user
 * is logged in, or { response } with a 401 JSON error otherwise.
 *
 * Usage:
 *   const { session, response } = await requireUser();
 *   if (response) return response;
 *   // session.user.id is guaranteed
 */
export async function requireUser() {
  const session = await auth();
  if (!session?.user?.id) {
    return {
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }
  return { session };
}
