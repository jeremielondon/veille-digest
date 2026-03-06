import { env } from "./config.js";
import type { DigestItem } from "./summarize.js";

export async function sendDigestEmail(items: DigestItem[]): Promise<void> {
  const today = new Date().toLocaleDateString("fr-FR", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const baseUrl = env.createArticleUrl;

  const html = buildHtml(items, today, baseUrl);
  const text = buildText(items, today);

  const form = new URLSearchParams();
  form.append("from", env.mailgunFrom);
  form.append("to", env.mailgunTo);
  form.append("subject", `🇫🇷 Veille FAL — ${today}`);
  form.append("html", html);
  form.append("text", text);

  const res = await fetch(
    `https://api.eu.mailgun.net/v3/${env.mailgunDomain}/messages`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${Buffer.from(`api:${env.mailgunApiKey}`).toString("base64")}`,
      },
      body: form,
    }
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Mailgun error ${res.status}: ${body}`);
  }

  console.log("Email sent successfully");
}

function buildHtml(items: DigestItem[], date: string, baseUrl: string): string {
  const rows = items
    .map(
      (item, i) => {
        const pubDate = item.published
          ? new Date(item.published).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" })
          : "";
        return `
    <tr style="border-bottom: 1px solid #eee;">
      <td style="padding: 12px 8px; vertical-align: top; color: #999; font-size: 14px;">${i + 1}</td>
      <td style="padding: 12px 8px;">
        <a href="${item.url}" style="color: #1a1a1a; text-decoration: none; font-weight: 600; font-size: 15px;">${item.title_fr}</a>
        <br/>
        <span style="color: #666; font-size: 13px;">${item.source} · ${item.category}${pubDate ? ` · ${pubDate}` : ""}</span>
        <br/>
        <a href="${baseUrl}?url=${encodeURIComponent(item.url)}&title=${encodeURIComponent(item.title_fr)}&source=${encodeURIComponent(item.source)}"
           style="display: inline-block; margin-top: 6px; padding: 5px 10px; background: #2563eb; color: white; text-decoration: none; border-radius: 4px; font-size: 12px;">
          Creer article
        </a>
      </td>
    </tr>`;
      }
    )
    .join("");

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 700px; margin: 0 auto; padding: 20px; background: #f9fafb;">
  <div style="background: white; border-radius: 8px; padding: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
    <h1 style="font-size: 20px; color: #1a1a1a; margin: 0 0 4px 0;">Veille francaisalondres.com</h1>
    <p style="color: #666; font-size: 14px; margin: 0 0 20px 0;">${date} · Top ${items.length} articles</p>
    <table style="width: 100%; border-collapse: collapse;">
      ${rows}
    </table>
    <p style="color: #999; font-size: 12px; margin-top: 20px; text-align: center;">
      Genere automatiquement via Inoreader + Claude · francaisalondres.com
    </p>
  </div>
</body>
</html>`;
}

function buildText(items: DigestItem[], date: string): string {
  const lines = items.map(
    (item, i) => {
      const pubDate = item.published
        ? new Date(item.published).toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" })
        : "";
      return `${i + 1}. ${item.title_fr}\n   Source: ${item.source} | ${item.category}${pubDate ? ` | ${pubDate}` : ""}\n   ${item.url}`;
    }
  );
  return `VEILLE FRANCAISALONDRES.COM\n${date}\n\n${lines.join("\n\n")}`;
}
