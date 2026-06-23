import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import { DocsView } from "@/components/docs/docs-view";

export const dynamic = "force-dynamic";

export const metadata = { title: "Documentação" };

export default async function DocsPage() {
  const session = await getSessionProfile();
  if (!session?.profile?.org_id) redirect("/app/onboarding");

  return (
    <DocsView
      orgId={session.profile.org_id}
      authorName={session.profile.name}
    />
  );
}
