/**
 * Notificações por email para a equipe da plataforma (Super Admin).
 * Usa o Resend via fetch quando RESEND_API_KEY + NOTIFY_EMAIL_FROM estão
 * configurados; caso contrário, é um no-op silencioso (o registro fica no
 * próprio banco, visível no painel admin). Server-side apenas.
 */

/** Email que recebe os avisos da plataforma (leads, tickets). */
export function platformOwnerEmail(): string {
  return (
    process.env.SUPERADMIN_EMAIL?.trim() ||
    process.env.ADMIN_EMAIL?.trim() ||
    "patrickdsc498@gmail.com"
  );
}

export async function sendOwnerEmail(opts: {
  subject: string;
  html: string;
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.NOTIFY_EMAIL_FROM;
  if (!apiKey || !from) return false;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from,
        to: [platformOwnerEmail()],
        subject: opts.subject,
        html: opts.html,
      }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
