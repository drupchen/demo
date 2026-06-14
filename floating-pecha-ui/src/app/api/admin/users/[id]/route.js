import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { requireAdmin } from "@/lib/admin-auth";
import { getUserById, updateUser, deleteUser, countAdmins } from "@/lib/users";

const ROLES = new Set(["member", "admin"]);
const validLevel = (v) => Number.isInteger(v) && v >= 0 && v <= 4;

export async function PATCH(request, { params }) {
  const { session, response } = await requireAdmin();
  if (response) return response;
  const { id } = await params;

  const body = await request.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });

  const { env } = getCloudflareContext();
  const current = await getUserById(env.DB, id);
  if (!current) return NextResponse.json({ error: "Introuvable" }, { status: 404 });

  const name = (body.name ?? current.name).toString().trim();
  const accessLevel = body.access_level === undefined ? current.access_level : Number(body.access_level);
  const role = (body.role ?? current.role).toString();

  if (!name) return NextResponse.json({ error: "Nom requis" }, { status: 400 });
  if (!validLevel(accessLevel)) return NextResponse.json({ error: "Niveau invalide (0–4)" }, { status: 400 });
  if (!ROLES.has(role)) return NextResponse.json({ error: "Rôle invalide" }, { status: 400 });

  // Guardrail: don't let the last admin (or yourself) be demoted out of admin.
  if (current.role === "admin" && role !== "admin") {
    if (session.user.id === id) {
      return NextResponse.json({ error: "Vous ne pouvez pas retirer votre propre rôle admin" }, { status: 409 });
    }
    const admins = await countAdmins(env.DB);
    if (admins <= 1) {
      return NextResponse.json({ error: "Impossible de retirer le dernier administrateur" }, { status: 409 });
    }
  }

  await updateUser(env.DB, id, { name, accessLevel, role });
  return NextResponse.json({ user: { id, name, access_level: accessLevel, role } });
}

export async function DELETE(_request, { params }) {
  const { session, response } = await requireAdmin();
  if (response) return response;
  const { id } = await params;

  const { env } = getCloudflareContext();
  const current = await getUserById(env.DB, id);
  if (!current) return NextResponse.json({ error: "Introuvable" }, { status: 404 });

  if (session.user.id === id) {
    return NextResponse.json({ error: "Vous ne pouvez pas vous supprimer vous-même" }, { status: 409 });
  }
  if (current.role === "admin") {
    const admins = await countAdmins(env.DB);
    if (admins <= 1) {
      return NextResponse.json({ error: "Impossible de supprimer le dernier administrateur" }, { status: 409 });
    }
  }

  await deleteUser(env.DB, id);
  return NextResponse.json({ ok: true });
}
