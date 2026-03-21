import { env } from "./config.js";

interface InoreaderArticle {
  id: string;
  title: string;
  url: string;
  source: string;
  published: string;
  summary: string;
  categories: string[];
}

interface StreamItem {
  id: string;
  title: string;
  canonical?: { href: string }[];
  alternate?: { href: string }[];
  origin?: { title: string };
  published: number;
  summary?: { content: string };
  categories?: { label: string }[];
}

const EXCLUDED_SOURCES = ["frenchmorning.com", "lepetitjournal.com"];
const MAX_REDDIT_ARTICLES = 3;

let currentAccessToken = env.inoreaderAccessToken;

function isRedditSource(item: StreamItem): boolean {
  const url = item.canonical?.[0]?.href || item.alternate?.[0]?.href || "";
  const origin = (item.origin?.title || "").toLowerCase();
  return url.includes("reddit.com") || origin.includes("reddit") || origin.startsWith("r/");
}

function getRedditScore(item: StreamItem): number {
  // Extract upvote/score hints from summary (Reddit feeds often include score)
  const summary = item.summary?.content || "";
  const scoreMatch = summary.match(/(\d+)\s*points?/i) || summary.match(/score:\s*(\d+)/i);
  if (scoreMatch) return parseInt(scoreMatch[1], 10);
  // Fallback: use number of categories as rough popularity proxy
  return item.categories?.length || 0;
}

export async function fetchUnreadArticles(): Promise<InoreaderArticle[]> {
  const token = await getAccessToken();

  const res = await fetch(
    `https://www.inoreader.com/reader/api/0/stream/contents/user/-/state/com.google/reading-list?n=200&xt=user/-/state/com.google/read`,
    { headers: { Authorization: `Bearer ${token}` } }
  );

  if (!res.ok) {
    throw new Error(`Inoreader API error: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  const items: StreamItem[] = data.items || [];

  // Filter excluded sources
  const filtered = items.filter((item) => {
    const url = item.canonical?.[0]?.href || item.alternate?.[0]?.href || "";
    const origin = (item.origin?.title || "").toLowerCase();
    return !EXCLUDED_SOURCES.some(
      (s) => url.includes(s) || origin.includes(s.replace(".com", ""))
    );
  });

  // Separate Reddit from non-Reddit, keep top Reddit by popularity
  const nonReddit = filtered.filter((item) => !isRedditSource(item));
  const reddit = filtered
    .filter((item) => isRedditSource(item))
    .sort((a, b) => getRedditScore(b) - getRedditScore(a))
    .slice(0, MAX_REDDIT_ARTICLES);

  console.log(`Articles: ${nonReddit.length} non-Reddit + ${reddit.length} Reddit (capped from ${filtered.filter(i => isRedditSource(i)).length})`);

  return [...nonReddit, ...reddit].map((item) => ({
    id: item.id,
    title: item.title || "(sans titre)",
    url: item.canonical?.[0]?.href || item.alternate?.[0]?.href || "",
    source: item.origin?.title || "Source inconnue",
    published: new Date(item.published * 1000).toISOString(),
    summary: stripHtml(item.summary?.content || "").slice(0, 500),
    categories:
      item.categories
        ?.map((c) => c.label)
        .filter((l): l is string => !!l) || [],
  }));
}

async function getAccessToken(): Promise<string> {
  // Test current token
  const testRes = await fetch(
    "https://www.inoreader.com/reader/api/0/user-info",
    { headers: { Authorization: `Bearer ${currentAccessToken}` } }
  );

  if (testRes.ok) return currentAccessToken;

  // Token expired, refresh it
  console.log("Inoreader token expired, refreshing...");
  const refreshRes = await fetch("https://www.inoreader.com/oauth2/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: env.inoreaderAppId,
      client_secret: env.inoreaderAppKey,
      grant_type: "refresh_token",
      refresh_token: env.inoreaderRefreshToken,
    }),
  });

  if (!refreshRes.ok) {
    throw new Error(
      `Inoreader token refresh failed: ${refreshRes.status} ${await refreshRes.text()}`
    );
  }

  const data = await refreshRes.json();
  currentAccessToken = data.access_token;
  console.log("Inoreader token refreshed successfully");
  return currentAccessToken;
}

function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&[^;]+;/g, " ")
    .trim();
}
