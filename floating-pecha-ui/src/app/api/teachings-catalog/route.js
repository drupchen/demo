import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { SECTIONS } from "@/app/teachings-catalog/catalogData";

// The Teachings' Catalog is restricted to Level 4 members. The data lives here
// (server-only) rather than in the page so it never ships in the client bundle
// to unauthorized visitors. Access level comes from the authenticated session —
// never from the client.
const REQUIRED_LEVEL = 4;

export async function GET() {
  const session = await auth();
  const level = session?.user?.accessLevel ?? 0;
  if (level < REQUIRED_LEVEL) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return NextResponse.json({ sections: SECTIONS });
}
