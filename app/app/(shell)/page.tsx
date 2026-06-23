import { redirect } from "next/navigation";

// /app abre direto no coração da plataforma: o inbox
export default function AppIndexPage() {
  redirect("/app/inbox");
}
