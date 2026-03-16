import { env } from "./config.js";
import type { DigestItem, MustReadItem, DiscoveryItem } from "./summarize.js";
import type { TavilyNewsItem } from "./tavily-news.js";
import { loadScores } from "./scoring.js";

// Category display order (matches scoring thématiques) + Divers at end
const CATEGORY_ORDER = [
  "Immigration & Visas",
  "Economie & Finance",
  "Transport",
  "Logement",
  "Education",
  "Sante & Vie quotidienne",
  "Culture & Loisirs",
  "Brexit & Politique",
  "Communaute francaise",
  "Divers",
];

const CATEGORY_COLORS: Record<string, { bg: string; border: string; text: string }> = {
  "Immigration & Visas":     { bg: "#fef3c7", border: "#f59e0b", text: "#92400e" },
  "Economie & Finance":      { bg: "#ecfdf5", border: "#10b981", text: "#065f46" },
  "Transport":               { bg: "#eff6ff", border: "#3b82f6", text: "#1e40af" },
  "Logement":                { bg: "#fdf2f8", border: "#ec4899", text: "#9d174d" },
  "Education":               { bg: "#f5f3ff", border: "#8b5cf6", text: "#5b21b6" },
  "Sante & Vie quotidienne": { bg: "#fef2f2", border: "#ef4444", text: "#991b1b" },
  "Culture & Loisirs":       { bg: "#fff7ed", border: "#f97316", text: "#9a3412" },
  "Brexit & Politique":      { bg: "#f0fdf4", border: "#22c55e", text: "#166534" },
  "Communaute francaise":    { bg: "#eef2ff", border: "#6366f1", text: "#3730a3" },
  "Divers":                  { bg: "#f9fafb", border: "#9ca3af", text: "#4b5563" },
};

interface CategoryGroup {
  name: string;
  items: DigestItem[];
  score: number;
}

function groupByCategory(items: DigestItem[], scores: any | null): CategoryGroup[] {
  // Group items by category
  const groups: Record<string, DigestItem[]> = {};
  for (const item of items) {
    const cat = CATEGORY_ORDER.includes(item.category) ? item.category : "Divers";
    if (!groups[cat]) groups[cat] = [];
    groups[cat].push(item);
  }

  // Get score per category from scoring data
  const scoreMap: Record<string, number> = {};
  if (scores?.thematiques) {
    // Map scoring thématique labels to category names
    for (const t of scores.thematiques) {
      scoreMap[t.label] = t.score;
    }
  }

  // Build sorted category groups
  const result: CategoryGroup[] = [];
  for (const cat of CATEGORY_ORDER) {
    if (groups[cat] && groups[cat].length > 0) {
      result.push({
        name: cat,
        items: groups[cat],
        score: scoreMap[cat] || 0,
      });
    }
  }

  // Sort by score descending (Divers always last)
  result.sort((a, b) => {
    if (a.name === "Divers") return 1;
    if (b.name === "Divers") return -1;
    return b.score - a.score;
  });

  return result;
}

export async function sendDigestEmail(
  items: DigestItem[],
  mustRead: MustReadItem[],
  ukNews: TavilyNewsItem[],
  discoveries: DiscoveryItem[] = []
): Promise<void> {
  const today = new Date().toLocaleDateString("fr-FR", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const baseUrl = env.createArticleUrl;
  const scores = await loadScores();
  const categories = groupByCategory(items, scores);

  const html = buildHtml(categories, mustRead, ukNews, discoveries, today, baseUrl);
  const text = buildText(categories, mustRead, ukNews, discoveries, today);

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

// --- "A ne pas manquer" section ---

function buildMustReadHtml(
  mustRead: MustReadItem[],
  baseUrl: string
): string {
  if (mustRead.length === 0) return "";

  const items = mustRead
    .map((mr) => {
      const sourcesText = mr.sources.join(", ");
      const firstUrl = mr.urls[0] || "#";
      const createUrl = `${baseUrl}?url=${encodeURIComponent(firstUrl)}&title=${encodeURIComponent(mr.title_fr)}&source=${encodeURIComponent(mr.sources[0] || "")}`;
      return `
    <tr style="border-bottom: 1px solid #fde68a;">
      <td style="padding: 12px 8px;">
        <a href="${firstUrl}" style="color: #1a1a1a; text-decoration: none; font-weight: 700; font-size: 15px;">${mr.title_fr}</a>
        <br/>
        <span style="color: #92400e; font-size: 13px;">${sourcesText} · ${mr.category}</span>
        <br/>
        <span style="color: #78716c; font-size: 12px; font-style: italic;">${mr.why}</span>
        <br/>
        <a href="${createUrl}"
           style="display: inline-block; margin-top: 6px; padding: 5px 10px; background: #d97706; color: white; text-decoration: none; border-radius: 4px; font-size: 12px;">
          Creer article
        </a>
      </td>
    </tr>`;
    })
    .join("");

  return `
  <div style="background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
    <h2 style="font-size: 18px; color: #92400e; margin: 0 0 12px 0;">A ne pas manquer</h2>
    <p style="color: #78716c; font-size: 13px; margin: 0 0 12px 0;">Sujets repris par plusieurs medias aujourd'hui</p>
    <table style="width: 100%; border-collapse: collapse;">
      ${items}
    </table>
  </div>`;
}

// --- UK News section (Tavily) ---

function buildUkNewsHtml(
  ukNews: TavilyNewsItem[],
  baseUrl: string
): string {
  if (ukNews.length === 0) return "";

  const rows = ukNews
    .map((news) => {
      const domain = new URL(news.url).hostname.replace("www.", "");
      const createUrl = `${baseUrl}?url=${encodeURIComponent(news.url)}&title=${encodeURIComponent(news.title)}&source=${encodeURIComponent(domain)}`;
      return `
    <tr style="border-bottom: 1px solid #dbeafe;">
      <td style="padding: 12px 8px;">
        <a href="${news.url}" style="color: #1a1a1a; text-decoration: none; font-weight: 700; font-size: 15px;">${news.title}</a>
        <br/>
        <span style="color: #1e40af; font-size: 13px;">${domain}</span>
        <br/>
        <span style="color: #64748b; font-size: 12px;">${news.content}</span>
        <br/>
        <a href="${createUrl}"
           style="display: inline-block; margin-top: 6px; padding: 5px 10px; background: #1e40af; color: white; text-decoration: none; border-radius: 4px; font-size: 12px;">
          Creer article
        </a>
      </td>
    </tr>`;
    })
    .join("");

  return `
  <div style="background: #eff6ff; border: 1px solid #bfdbfe; border-radius: 8px; padding: 20px; margin-bottom: 24px;">
    <h2 style="font-size: 18px; color: #1e40af; margin: 0 0 12px 0;">Actualites UK du jour</h2>
    <p style="color: #64748b; font-size: 13px; margin: 0 0 12px 0;">Top 3 des news importantes au Royaume-Uni via Tavily</p>
    <table style="width: 100%; border-collapse: collapse;">
      ${rows}
    </table>
  </div>`;
}

// --- Category section ---

function buildCategoryHtml(
  group: CategoryGroup,
  baseUrl: string
): string {
  const colors = CATEGORY_COLORS[group.name] || CATEGORY_COLORS["Divers"];
  const scoreLabel = group.score > 0 ? ` · Score ${group.score}` : "";

  const rows = group.items
    .map((item) => {
      const pubDate = item.published
        ? new Date(item.published).toLocaleDateString("fr-FR", {
            day: "numeric",
            month: "long",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          })
        : "";
      const createUrl = `${baseUrl}?url=${encodeURIComponent(item.url)}&title=${encodeURIComponent(item.title_fr)}&source=${encodeURIComponent(item.source)}`;
      return `
    <tr style="border-bottom: 1px solid ${colors.border}22;">
      <td style="padding: 10px 8px;">
        <a href="${item.url}" style="color: #1a1a1a; text-decoration: none; font-weight: 600; font-size: 15px;">${item.title_fr}</a>
        <br/>
        <span style="color: #666; font-size: 13px;">${item.source}${pubDate ? ` · ${pubDate}` : ""}</span>
        <br/>
        <a href="${createUrl}"
           style="display: inline-block; margin-top: 6px; padding: 5px 10px; background: #2563eb; color: white; text-decoration: none; border-radius: 4px; font-size: 12px;">
          Creer article
        </a>
      </td>
    </tr>`;
    })
    .join("");

  return `
  <div style="background: ${colors.bg}; border-left: 4px solid ${colors.border}; border-radius: 4px; padding: 16px; margin-bottom: 16px;">
    <h3 style="font-size: 16px; color: ${colors.text}; margin: 0 0 4px 0;">${group.name}</h3>
    <p style="color: #78716c; font-size: 12px; margin: 0 0 10px 0;">${group.items.length} article${group.items.length > 1 ? "s" : ""}${scoreLabel}</p>
    <table style="width: 100%; border-collapse: collapse;">
      ${rows}
    </table>
  </div>`;
}

// --- Discoveries section ---

function buildDiscoveriesHtml(
  discoveries: DiscoveryItem[],
  baseUrl: string
): string {
  if (discoveries.length === 0) return "";

  const rows = discoveries
    .map((d) => {
      const pubDate = d.published
        ? new Date(d.published).toLocaleDateString("fr-FR", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })
        : "";
      const createUrl = `${baseUrl}?url=${encodeURIComponent(d.url)}&title=${encodeURIComponent(d.title_fr)}&source=${encodeURIComponent(d.source)}`;
      return `
    <tr style="border-bottom: 1px solid #99f6e4;">
      <td style="padding: 12px 8px;">
        <a href="${d.url}" style="color: #1a1a1a; text-decoration: none; font-weight: 700; font-size: 15px;">${d.title_fr}</a>
        <br/>
        <span style="color: #0f766e; font-size: 13px;">${d.source}${pubDate ? ` · ${pubDate}` : ""}</span>
        <br/>
        <span style="color: #5f6b78; font-size: 12px; font-style: italic;">${d.hook}</span>
        <br/>
        <a href="${createUrl}"
           style="display: inline-block; margin-top: 6px; padding: 5px 10px; background: #0d9488; color: white; text-decoration: none; border-radius: 4px; font-size: 12px;">
          Creer article
        </a>
      </td>
    </tr>`;
    })
    .join("");

  return `
  <div style="background: #f0fdfa; border: 1px solid #99f6e4; border-radius: 8px; padding: 20px; margin-top: 24px; margin-bottom: 16px;">
    <h2 style="font-size: 18px; color: #0f766e; margin: 0 0 4px 0;">Decouvertes & Pepites</h2>
    <p style="color: #5f6b78; font-size: 13px; margin: 0 0 12px 0;">Articles atypiques deniche dans des blogs et medias de niche</p>
    <table style="width: 100%; border-collapse: collapse;">
      ${rows}
    </table>
  </div>`;
}

// --- Main HTML builder ---

function buildHtml(
  categories: CategoryGroup[],
  mustRead: MustReadItem[],
  ukNews: TavilyNewsItem[],
  discoveries: DiscoveryItem[],
  date: string,
  baseUrl: string
): string {
  const totalArticles = categories.reduce((sum, g) => sum + g.items.length, 0);

  const categoryBlocks = categories
    .map((group) => buildCategoryHtml(group, baseUrl))
    .join("");

  return `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 700px; margin: 0 auto; padding: 20px; background: #f9fafb;">
  <div style="background: white; border-radius: 8px; padding: 24px; box-shadow: 0 1px 3px rgba(0,0,0,0.1);">
    <h1 style="font-size: 20px; color: #1a1a1a; margin: 0 0 4px 0;">Veille francaisalondres.com</h1>
    <p style="color: #666; font-size: 14px; margin: 0 0 20px 0;">${date} · ${totalArticles} articles · ${categories.length} categories</p>
    ${buildMustReadHtml(mustRead, baseUrl)}
    ${buildUkNewsHtml(ukNews, baseUrl)}
    <h2 style="font-size: 18px; color: #1a1a1a; margin: 0 0 16px 0; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px;">Veille par categorie</h2>
    ${categoryBlocks}
    ${buildDiscoveriesHtml(discoveries, baseUrl)}
    <p style="color: #999; font-size: 12px; margin-top: 20px; text-align: center;">
      Genere automatiquement via Inoreader + Claude + Tavily · francaisalondres.com
    </p>
  </div>
</body>
</html>`;
}

// --- Plain text builder ---

function buildText(
  categories: CategoryGroup[],
  mustRead: MustReadItem[],
  ukNews: TavilyNewsItem[],
  discoveries: DiscoveryItem[],
  date: string
): string {
  const totalArticles = categories.reduce((sum, g) => sum + g.items.length, 0);
  let text = `VEILLE FRANCAISALONDRES.COM\n${date} · ${totalArticles} articles\n\n`;

  if (mustRead.length > 0) {
    text += "=== A NE PAS MANQUER ===\n\n";
    for (const mr of mustRead) {
      text += `>> ${mr.title_fr}\n   Sources: ${mr.sources.join(", ")} | ${mr.category}\n   ${mr.why}\n   ${mr.urls[0] || ""}\n\n`;
    }
  }

  if (ukNews.length > 0) {
    text += "=== ACTUALITES UK DU JOUR ===\n\n";
    for (const news of ukNews) {
      const domain = new URL(news.url).hostname.replace("www.", "");
      text += `>> ${news.title}\n   ${domain}\n   ${news.content}\n   ${news.url}\n\n`;
    }
  }

  for (const group of categories) {
    const scoreLabel = group.score > 0 ? ` (score: ${group.score})` : "";
    text += `\n=== ${group.name.toUpperCase()}${scoreLabel} ===\n\n`;
    for (const item of group.items) {
      const pubDate = item.published
        ? new Date(item.published).toLocaleDateString("fr-FR", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })
        : "";
      text += `- ${item.title_fr}\n  Source: ${item.source}${pubDate ? ` | ${pubDate}` : ""}\n  ${item.url}\n\n`;
    }
  }

  if (discoveries.length > 0) {
    text += "\n=== DECOUVERTES & PEPITES ===\n\n";
    for (const d of discoveries) {
      const pubDate = d.published
        ? new Date(d.published).toLocaleDateString("fr-FR", {
            day: "numeric",
            month: "long",
            year: "numeric",
          })
        : "";
      text += `- ${d.title_fr}\n  Source: ${d.source}${pubDate ? ` | ${pubDate}` : ""}\n  ${d.hook}\n  ${d.url}\n\n`;
    }
  }

  return text;
}
