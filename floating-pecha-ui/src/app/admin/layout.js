// Server Component — no "use client".
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import AdminShell from "./components/AdminShell";

export const metadata = { title: "Admin · Rabsal Dawa" };

export default async function AdminLayout({ children }) {
  const session = await auth();
  if (session?.user?.role !== "admin") {
    redirect("/signin");
  }
  return <AdminShell user={session.user}>{children}</AdminShell>;
}
