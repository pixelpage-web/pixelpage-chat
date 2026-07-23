import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import { canViewNavRoute } from "@/lib/permissions";
import { ContactsView } from "@/components/contacts/contacts-view";

export const dynamic = "force-dynamic";

export const metadata = { title: "Contatos" };

export default async function ContactsPage() {
  const session = await getSessionProfile();
  if (!session?.profile?.org_id) redirect("/app/onboarding");
  if (!canViewNavRoute(session.profile.permissions, "/app/contacts")) redirect("/app/inbox");

  return <ContactsView orgId={session.profile.org_id} />;
}
