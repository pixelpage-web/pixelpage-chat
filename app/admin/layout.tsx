import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { getSessionProfile } from "@/lib/auth";
import { createAdminClient } from "@/lib/supabase/admin";
import { AdminShell } from "@/components/admin/admin-shell";

export const dynamic = "force-dynamic";

export const metadata = { title: "Admin" };

export default async function AdminLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const session = await getSessionProfile();

  // Acesso exclusivo ao superadmin verificado por email —
  // redireciona silenciosamente para /app sem revelar que /admin existe.
  const superadminEmail = process.env.SUPERADMIN_EMAIL?.trim().toLowerCase();
  const isSuperadmin =
    !!session &&
    session.profile?.role === "superadmin" &&
    !!superadminEmail &&
    session.user.email?.toLowerCase() === superadminEmail;

  if (!isSuperadmin) {
    redirect("/app");
  }

  // Log de acesso (auditoria) — registra IP de entrada no painel
  try {
    const hdrs = await headers();
    const ip =
      hdrs.get("x-forwarded-for")?.split(",")[0]?.trim() ??
      hdrs.get("x-real-ip") ??
      "unknown";
    const admin = createAdminClient();
    await admin.from("admin_audit_logs").insert({
      action: "admin.panel_access",
      target_type: "session",
      target_name: session!.user.email,
      details: { path: "/admin" },
      ip_address: ip,
    });
  } catch {
    // Nunca bloquear o acesso por falha de log
  }

  return (
    <AdminShell userEmail={session!.user.email ?? ""}>
      {children}
    </AdminShell>
  );
}
