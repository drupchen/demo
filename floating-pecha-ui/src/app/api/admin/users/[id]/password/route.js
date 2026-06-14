import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireAdmin } from "@/lib/admin-auth";
import { getUserById, setPassword } from "@/lib/users";
import { hashPassword } from "@/lib/passwords";

export async function POST(request, { params }) {
  const { response } = await requireAdmin();
  if (response) return response;
  const { id } = await params;

  const body = await request.json().catch(() => null);
  const password = (body?.password ?? "").toString();
  if (!password) return NextResponse.json({ error: "Mot de passe requis" }, { status: 400 });

  const { env } = getCloudflareContext();
  const current = await getUserById(env.DB, id);
  if (!current) return NextResponse.json({ error: "Introuvable" }, { status: 404 });

  await setPassword(env.DB, id, await hashPassword(password));
  return NextResponse.json({ ok: true });
}
