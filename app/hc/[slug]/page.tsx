import { notFound } from "next/navigation";
import Link from "next/link";
import { BookOpen, Search } from "lucide-react";
import { createServerSupabase } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

interface Props {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ q?: string; article?: string }>;
}

export async function generateMetadata({ params }: Props) {
  const { slug } = await params;
  const supabase = await createServerSupabase();
  const { data: portal } = await supabase
    .from("portals")
    .select("name, page_title")
    .eq("slug", slug)
    .maybeSingle();
  return { title: portal?.page_title ?? portal?.name ?? "Central de Ajuda" };
}

export default async function HcPage({ params, searchParams }: Props) {
  const { slug } = await params;
  const { q: rawQ, article: articleId } = await searchParams;

  const supabase = await createServerSupabase();

  const { data: portal } = await supabase
    .from("portals")
    .select("id, name, slug, color, page_title")
    .eq("slug", slug)
    .maybeSingle();

  if (!portal) notFound();

  // Article detail view
  if (articleId) {
    const { data: article } = await supabase
      .from("help_articles")
      .select("id, title, content, status, views, updated_at, category_id")
      .eq("id", articleId)
      .eq("portal_id", portal.id)
      .eq("status", "published")
      .maybeSingle();

    if (!article) notFound();

    // Increment view count — fire and forget
    try {
      await supabase.rpc("increment_article_views", { p_article_id: article.id });
    } catch {
      // ignore view count errors
    }

    const { data: category } = article.category_id
      ? await supabase.from("help_categories").select("name").eq("id", article.category_id).maybeSingle()
      : { data: null };

    return (
      <HcShell portal={portal}>
        <div className="mx-auto max-w-2xl">
          <nav className="mb-6 flex items-center gap-2 text-sm text-gray-500">
            <Link href={`/hc/${portal.slug}`} className="hover:underline">{portal.name}</Link>
            {category && (
              <>
                <span>/</span>
                <span>{category.name}</span>
              </>
            )}
            <span>/</span>
            <span className="text-gray-900">{article.title}</span>
          </nav>
          <h1 className="mb-6 text-3xl font-bold text-gray-900">{article.title}</h1>
          <div className="prose prose-gray max-w-none">
            {article.content.split("\n").map((line: string, i: number) => {
              if (line.startsWith("# ")) return <h1 key={i} className="text-2xl font-bold mt-8 mb-4">{line.slice(2)}</h1>;
              if (line.startsWith("## ")) return <h2 key={i} className="text-xl font-semibold mt-6 mb-3">{line.slice(3)}</h2>;
              if (line.startsWith("### ")) return <h3 key={i} className="text-lg font-semibold mt-4 mb-2">{line.slice(4)}</h3>;
              if (line.startsWith("- ") || line.startsWith("* ")) return <li key={i} className="ml-4 list-disc">{line.slice(2)}</li>;
              if (line.startsWith("**") && line.endsWith("**")) return <strong key={i} className="block font-semibold">{line.slice(2, -2)}</strong>;
              if (line === "") return <br key={i} />;
              return <p key={i} className="mb-3 leading-relaxed text-gray-700">{line}</p>;
            })}
          </div>
          <p className="mt-12 text-xs text-gray-400">Atualizado em {new Date(article.updated_at).toLocaleDateString("pt-BR")}</p>
        </div>
      </HcShell>
    );
  }

  // Category/search view
  const q = rawQ?.toLowerCase() ?? "";

  const [{ data: categories }, { data: articles }] = await Promise.all([
    supabase.from("help_categories").select("id, name, description, icon, position").eq("portal_id", portal.id).order("position"),
    supabase.from("help_articles").select("id, title, category_id, views").eq("portal_id", portal.id).eq("status", "published").order("title"),
  ]);

  const filteredArticles = q
    ? (articles ?? []).filter((a) => a.title.toLowerCase().includes(q))
    : articles ?? [];

  return (
    <HcShell portal={portal}>
      {/* Search */}
      <div className="mx-auto mb-12 max-w-xl">
        <form className="relative">
          <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
          <input
            name="q"
            defaultValue={rawQ ?? ""}
            placeholder="Buscar artigos…"
            className="h-14 w-full rounded-2xl border border-gray-200 bg-white pl-12 pr-4 text-base shadow-sm focus:border-gray-400 focus:outline-none"
          />
        </form>
      </div>

      {q ? (
        /* Search results */
        <div className="mx-auto max-w-2xl">
          <p className="mb-4 text-sm text-gray-500">{filteredArticles.length} resultado(s) para &quot;{q}&quot;</p>
          {filteredArticles.length === 0 ? (
            <p className="text-center text-gray-500">Nenhum artigo encontrado.</p>
          ) : (
            <ul className="space-y-2">
              {filteredArticles.map((a) => (
                <li key={a.id}>
                  <Link
                    href={`/hc/${portal.slug}?article=${a.id}`}
                    className="flex items-center gap-3 rounded-lg border border-gray-100 bg-white p-4 shadow-sm transition hover:shadow-md"
                  >
                    <BookOpen className="h-5 w-5 shrink-0 text-gray-400" />
                    <span className="text-sm font-medium text-gray-800">{a.title}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : (
        /* Categories grid */
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {(categories ?? []).map((cat) => {
            const catArticles = (articles ?? []).filter((a) => a.category_id === cat.id);
            return (
              <div key={cat.id} className="rounded-xl border border-gray-100 bg-white p-6 shadow-sm">
                <div className="mb-3 text-3xl">{cat.icon ?? "📁"}</div>
                <h2 className="mb-1 text-lg font-semibold text-gray-900">{cat.name}</h2>
                {cat.description && <p className="mb-4 text-sm text-gray-500">{cat.description}</p>}
                <ul className="space-y-1.5">
                  {catArticles.slice(0, 5).map((a) => (
                    <li key={a.id}>
                      <Link
                        href={`/hc/${portal.slug}?article=${a.id}`}
                        className="text-sm text-blue-600 hover:underline"
                      >
                        {a.title}
                      </Link>
                    </li>
                  ))}
                  {catArticles.length > 5 && (
                    <li className="text-xs text-gray-400">+{catArticles.length - 5} artigos</li>
                  )}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </HcShell>
  );
}

function HcShell({ portal, children }: { portal: { name: string; slug: string; color: string }; children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-5xl px-4 py-8 text-center">
          <Link href={`/hc/${portal.slug}`} className="inline-flex items-center gap-2 text-2xl font-bold text-gray-900">
            <BookOpen className="h-7 w-7" style={{ color: portal.color }} />
            {portal.name}
          </Link>
        </div>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-12">
        {children}
      </main>
      <footer className="border-t border-gray-200 bg-white py-6 text-center text-xs text-gray-400">
        Powered by PixelPage Chat
      </footer>
    </div>
  );
}
