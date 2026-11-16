import "server-only";
import { MAIL_LOGO_BASE64 } from "@/lib/mail-logo";
import { sendMail } from "@/lib/mail";
import { MEMBER_ROLES, type MemberRole } from "@/lib/projects";

const esc = (value: string) => value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** Az alkalmazás nyilvános címe a levélben szereplő linkekhez. */
export function appBaseUrl(requestOrigin?: string) {
  const configured = process.env.APP_URL;
  if (configured) return configured.replace(/\/$/, "");
  if (process.env.VERCEL_PROJECT_PRODUCTION_URL) return `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;
  return requestOrigin ?? "http://localhost:3009";
}

/** Meghívó levél egy projekthez. Hibánál a hibaüzenetet adja vissza, siker esetén `undefined`-ot. */
export async function sendProjectInvite({
  to,
  link,
  projectName,
  projectEmoji,
  role,
  inviterName,
  note,
}: {
  to: string;
  link: string;
  projectName: string;
  projectEmoji: string;
  role: MemberRole;
  inviterName: string;
  note?: string;
}) {
  const roleLabel = MEMBER_ROLES[role].label;
  const text = `Szia!\n\n${inviterName} meghívott a(z) „${projectName}” projektbe (${roleLabel}).\n${note ? `\nÜzenet: ${note}\n` : ""}\nCsatlakozás: ${link}\n\nA link 7 napig érvényes, és egyszer használható.\n\nPannonGuard · Rendkívüli projekt`;
  const html = `<!doctype html><html lang="hu"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light only"></head>
<body style="margin:0;padding:0;background:#f3f5ee;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f3f5ee;"><tr><td align="center" style="padding:32px 14px;">
<table role="presentation" width="560" cellpadding="0" cellspacing="0" border="0" style="width:100%;max-width:560px;">
<tr><td style="background:#0b100c;border-radius:22px 22px 0 0;padding:34px 32px 26px;text-align:center;">
<img src="cid:pannonguard-logo" width="60" alt="PannonGuard" style="display:block;margin:0 auto 14px;width:60px;height:auto;border:0;">
<div style="font:600 11px/1 Arial,sans-serif;letter-spacing:4px;text-transform:uppercase;color:#c6f432;">PannonGuard · Rendkívüli projekt</div>
<div style="height:14px;line-height:14px;font-size:0;">&nbsp;</div>
<div style="font:400 26px/1.25 Georgia,serif;color:#ffffff;">Meghívtak egy projektbe</div></td></tr>
<tr><td height="5" style="height:5px;line-height:5px;font-size:0;background:linear-gradient(90deg,#c6f432,#ff3d8b);background-color:#c6f432;">&nbsp;</td></tr>
<tr><td style="background:#ffffff;padding:30px 32px 10px;font:400 15px/1.65 Arial,sans-serif;color:#1d2418;">
<p style="margin:0 0 14px;">Szia!</p>
<p style="margin:0 0 18px;"><strong>${esc(inviterName)}</strong> meghívott a következő projektbe:</p>
<div style="border:1px solid #dfe6cf;background:#f7faee;border-radius:14px;padding:16px 18px;margin:0 0 18px;">
<div style="font:600 18px/1.3 Georgia,serif;color:#0b100c;">${esc(projectEmoji)} ${esc(projectName)}</div>
<div style="margin-top:6px;font:600 12px/1 Arial,sans-serif;letter-spacing:1.4px;text-transform:uppercase;color:#5b6b3a;">${esc(roleLabel)}</div></div>
${note ? `<p style="margin:0 0 18px;padding:12px 14px;border-left:3px solid #ff3d8b;background:#fff5f9;color:#3a2230;">${esc(note).replace(/\n/g, "<br>")}</p>` : ""}
<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:6px 0 20px;"><tr><td style="background:#c6f432;border-radius:12px;"><a href="${esc(link)}" style="display:inline-block;padding:15px 30px;font:700 15px/1 Arial,sans-serif;color:#0b100c;text-decoration:none;">Csatlakozás a projekthez</a></td></tr></table>
<p style="margin:0 0 6px;font-size:13px;color:#5d6652;">A link 7 napig érvényes, és egyszer használható. Ha a gomb nem működik, másold be a böngészőbe:</p>
<p style="margin:0 0 20px;font:400 12px/1.5 Menlo,Consolas,monospace;color:#5d6652;word-break:break-all;">${esc(link)}</p></td></tr>
<tr><td style="background:#f7faee;border-radius:0 0 22px 22px;padding:18px 32px;border-top:1px solid #e3ead3;font:400 12px/1.6 Arial,sans-serif;color:#5d6652;">PannonGuard Biztonsági Szolgáltató Zrt. · Automatikus értesítés a PannonGuard Komplex rendszerből.</td></tr>
</table></td></tr></table></body></html>`;
  return sendMail({
    to: [to],
    subject: `Meghívó: ${projectName}`,
    text,
    html,
    attachments: [{ filename: "pannonguard.png", content: Buffer.from(MAIL_LOGO_BASE64, "base64"), contentType: "image/png", cid: "pannonguard-logo" }],
  });
}
