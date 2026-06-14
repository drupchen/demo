import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireAdmin } from "@/lib/admin-auth";
import { listUsers, createUser, getUserByUsername } from "@/lib/users";
import { hashPassword } from "@/lib/passwords";

const ROLES = new Set(["member", "admin"]);

function validLevel(v) {
  return Number.isInteger(v) && v >= 0 && v <= 4;
}

export async function GET() {
  const { response } = await requireAdmin();
  if (response) return response;
  const { env } = getCloudflareContext();
  const users = await listUsers(env.DB);
  return NextResponse.json({ users });
}

export async function POST(request) {
  const { response } = await requireAdmin();
  if (response) return response;

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const username = (body.username ?? "").toString().trim();
  const name = (body.name ?? "").toString().trim();
  const password = (body.password ?? "").toString();
  const accessLevel = Number(body.access_level);
  const role = (body.role ?? "member").toString();

  if (!username) return NextResponse.json({ error: "Username requis" }, { status: 400 });
  if (!name) return NextResponse.json({ error: "Nom requis" }, { status: 400 });
  if (!password) return NextResponse.json({ error: "Mot de passe requis" }, { status: 400 });
  if (!validLevel(accessLevel)) return NextResponse.json({ error: "Niveau invalide (0–4)" }, { status: 400 });
  if (!ROLES.has(role)) return NextResponse.json({ error: "Rôle invalide" }, { status: 400 });

  const { env } = getCloudflareContext();
  const existing = await getUserByUsername(env.DB, username);
  if (existing) return NextResponse.json({ error: "Username déjà pris" }, { status: 409 });

  const passwordHash = await hashPassword(password);
  const user = await createUser(env.DB, { username, name, passwordHash, accessLevel, role });
  return NextResponse.json({ user }, { status: 201 });
}
