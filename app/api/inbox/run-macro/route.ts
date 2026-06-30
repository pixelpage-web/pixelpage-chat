import { NextRequest, NextResponse } from "next/server";
import { createServerSupabase } from "@/lib/supabase/server";
import { getSessionProfile } from "@/lib/auth";

interface MacroAction {
  action_name: string;
  action_params: string[];
}

export async function POST(req: NextRequest) {
  const session = await getSessionProfile();
  if (!session?.profile?.org_id) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  const orgId = session.profile.org_id;

  const body = (await req.json()) as { macro_id: string; conversation_id: string };
  if (!body.macro_id || !body.conversation_id) {
    return NextResponse.json({ error: "macro_id e conversation_id são obrigatórios." }, { status: 400 });
  }

  const supabase = await createServerSupabase();

  // Buscar macro (valida pertence à org)
  const { data: macro } = await supabase
    .from("macros")
    .select("id, actions, visibility, created_by")
    .eq("id", body.macro_id)
    .eq("org_id", orgId)
    .maybeSingle();

  if (!macro) {
    return NextResponse.json({ error: "Macro não encontrada." }, { status: 404 });
  }

  // Validar acesso (privada só o criador pode usar)
  if (macro.visibility === "private" && macro.created_by !== session.user.id) {
    return NextResponse.json({ error: "Sem permissão para usar esta macro." }, { status: 403 });
  }

  const results: string[] = [];
  const actions = macro.actions as unknown as MacroAction[];

  for (const action of actions) {
    try {
      switch (action.action_name) {
        case "send_message": {
          const content = action.action_params[0];
          if (content) {
            await fetch(`${req.nextUrl.origin}/api/inbox/send`, {
              method: "POST",
              headers: { "Content-Type": "application/json", cookie: req.headers.get("cookie") ?? "" },
              body: JSON.stringify({ conversation_id: body.conversation_id, content }),
            });
            results.push(`send_message: OK`);
          }
          break;
        }
        case "resolve_conversation":
          await supabase.from("conversations").update({ status: "resolved" }).eq("id", body.conversation_id);
          results.push("resolve_conversation: OK");
          break;
        case "reopen_conversation":
          await supabase.from("conversations").update({ status: "open" }).eq("id", body.conversation_id);
          results.push("reopen_conversation: OK");
          break;
        case "assign_agent": {
          const agentId = action.action_params[0];
          if (agentId) {
            await supabase.from("conversations").update({ assigned_to: agentId }).eq("id", body.conversation_id);
            results.push("assign_agent: OK");
          }
          break;
        }
        case "add_label": {
          const labelName = action.action_params[0];
          if (labelName) {
            const { data: label } = await supabase
              .from("labels")
              .select("id")
              .eq("org_id", orgId)
              .ilike("title", labelName)
              .maybeSingle();
            if (label) {
              await supabase
                .from("conversation_labels")
                .upsert({ conversation_id: body.conversation_id, label_id: label.id });
              results.push("add_label: OK");
            }
          }
          break;
        }
        default:
          results.push(`${action.action_name}: ignorada`);
      }
    } catch {
      results.push(`${action.action_name}: erro`);
    }
  }

  return NextResponse.json({ ok: true, results });
}
