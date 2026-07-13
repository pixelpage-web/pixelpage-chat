import { redirect } from "next/navigation";
import { getSessionProfile } from "@/lib/auth";
import { HelpView } from "@/components/help/help-view";

export const dynamic = "force-dynamic";

export const metadata = { title: "Central de Ajuda" };

export default async function HelpPage() {
  const session = await getSessionProfile();
  if (!session?.profile?.org_id) redirect("/app/onboarding");

  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "https://www.pixelpagechat.com.br";

  return (
    <HelpView
      orgId={session.profile.org_id}
      authorName={session.profile.name}
      appUrl={appUrl}
    />
  );
}
