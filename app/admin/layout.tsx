import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import { AdminShell } from "@/components/admin/admin-shell";

export const dynamic = "force-dynamic";

export const metadata = { title: "Admin" };

export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await getSessionProfile();
  if (!session) redirect("/login");

  // Somente admin global e superadmin acessam o painel
  if (session.profile?.role !== "admin" && session.profile?.role !== "superadmin") {
    redirect("/app");
  }

  return <AdminShell userEmail={session.user.email ?? ""}>{children}</AdminShell>;
}
