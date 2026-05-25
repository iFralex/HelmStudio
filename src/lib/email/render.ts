/**
 * HTML rendering for the outreach email body.
 *
 * The draft body stored in the DB is plain text (greeting + body paragraphs +
 * sign-off + legal footer). When the operator copies it from the admin UI,
 * we also stage an HTML version on the clipboard so Gmail / Apple Mail /
 * Outlook Web pick it up in rich-text compose mode — the plain text remains
 * the fallback for text-only clients.
 *
 * The logo is inlined as SVG without the turbulence filter used on the site:
 * most email clients (especially Outlook desktop) strip SVG filters or SVG
 * entirely, so the simplified shape is the safest broadly-rendered fallback.
 */

const LOGO_SVG = `<svg viewBox="0 0 120 120" width="36" height="36" xmlns="http://www.w3.org/2000/svg" aria-label="HELM Studio" style="display:block">
  <rect x="10" y="10" width="40" height="100" fill="#161616"/>
  <rect x="70" y="10" width="40" height="100" fill="#161616"/>
  <rect x="10" y="51" width="100" height="18" fill="#161616"/>
  <path d="M 4 42 C 28 38, 58 45, 96 40 C 112 38, 116 50, 116 60 C 116 70, 112 82, 96 80 C 58 75, 28 82, 4 78 C 0 70, 0 50, 4 42 Z" fill="#FF8552"/>
</svg>`;

// Closing lines that mark the start of the signature block (any locale we
// currently support in outreach drafts: IT + EN). Matched case-insensitively
// against the trimmed first line of each paragraph.
const CLOSING_RE = /^(Un saluto,|Best,|Saluti,|Cordiali saluti,|Kind regards,|Regards,)/i;

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function paragraphToHtml(para: string): string {
  return `<p style="margin:0 0 14px">${escapeHtml(para).replace(/\n/g, '<br>')}</p>`;
}

export function renderOutreachAsHtml(plainBody: string): string {
  const paragraphs = plainBody.trim().split(/\n{2,}/);
  const closingIdx = paragraphs.findIndex((p) => CLOSING_RE.test(p.trim()));

  const bodyParas =
    closingIdx === -1 ? paragraphs : paragraphs.slice(0, closingIdx);
  const sigParas = closingIdx === -1 ? [] : paragraphs.slice(closingIdx);

  const bodyHtml = bodyParas.map(paragraphToHtml).join('\n');
  const sigHtml = sigParas.map(paragraphToHtml).join('\n');

  return `<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#161616;line-height:1.55;font-size:15px;max-width:600px">
${bodyHtml}
<div style="margin-top:20px;padding-top:16px;border-top:1px solid #e5e1d5">
${sigHtml}
<div style="margin-top:12px">${LOGO_SVG}</div>
</div>
</div>`;
}
