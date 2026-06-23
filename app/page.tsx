import { redirect } from "next/navigation";

// Sem landing page neste escopo: a raiz manda para o painel.
// O middleware redireciona para /login se não houver sessão.
export default function RootPage() {
  redirect("/app");
}
