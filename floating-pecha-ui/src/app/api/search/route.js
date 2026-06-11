import { NextResponse } from "next/server";
import { auth } from "@/auth";

export async function GET() {
  // Confirm the request has a session — the level reflects the authenticated user.
  const session = await auth();
  const userLevel = session?.user?.accessLevel ?? 0;

  // Search is being migrated from OpenSearch to Meilisearch — temporarily disabled.
  return NextResponse.json(
    {
      results: [],
      message: "Search is being migrated and is temporarily unavailable.",
      _debug: { userLevel },
    },
    { status: 503 }
  );
}
