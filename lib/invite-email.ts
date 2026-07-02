export async function sendInviteEmail(opts: {
  toEmail: string;
  toName: string;
  orgName: string;
  inviterName: string;
  token: string;
}): Promise<boolean> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.NOTIFY_EMAIL_FROM;
  if (!apiKey || !from) return false;

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.pixelpagechat.com.br";
  const link = `${appUrl}/convite/${opts.token}`;

  const html = `
    <div style="font-family:sans-serif;max-width:520px;margin:0 auto">
      <h2 style="color:#1a1a1a">Você foi convidado para ${opts.orgName}</h2>
      <p style="color:#555">${opts.inviterName} convidou você para entrar no painel PixelPage Chat.</p>
      <a href="${link}" style="display:inline-block;margin:20px 0;padding:12px 24px;background:#84cc16;color:#000;border-radius:8px;text-decoration:none;font-weight:600">
        Aceitar convite
      </a>
      <p style="color:#888;font-size:13px">Este link expira em 48 horas e pode ser usado apenas uma vez.</p>
      <p style="color:#888;font-size:13px">Se você não esperava este convite, ignore este e-mail.</p>
    </div>
  `;

  try {
    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from, to: [opts.toEmail], subject: `Convite para ${opts.orgName} — PixelPage Chat`, html }),
    });
    return res.ok;
  } catch {
    return false;
  }
}
