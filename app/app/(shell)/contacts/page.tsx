import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import { ContactsView } from "@/components/contacts/contacts-view";

export const dynamic = "force-dynamic";

export const metadata = { title: "Contatos" };

export default async function ContactsPage() {
  const session = await getSessionProfile();
  if (!session?.profile?.org_id) redirect("/app/onboarding");

  return <ContactsView orgId={session.profile.org_id} />;
}
