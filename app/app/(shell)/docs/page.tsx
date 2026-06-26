import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import { DocsView } from "@/components/docs/docs-view";

export const dynamic = "force-dynamic";

export const metadata = { title: "Documentação" };

export default async function DocsPage() {
  const session = await getSessionProfile();
  if (!session?.profile?.org_id) redirect("/app/onboarding");

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "https://app.pixelpagechat.com.br";

  return (
    <DocsView
      orgId={session.profile.org_id}
      authorName={session.profile.name}
      appUrl={appUrl}
    />
  );
}
