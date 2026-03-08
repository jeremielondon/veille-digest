import { env } from "./config.js";

export interface TavilyNewsItem {
  title: string;
  url: string;
  content: string;
  published_date?: string;
}

export async function fetchTopUkNews(): Promise<TavilyNewsItem[]> {
  if (!env.tavilyApiKey) return [];

  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: env.tavilyApiKey,
        query: "important news UK London today",
        max_results: 5,
        search_depth: "advanced",
        topic: "news",
        time_range: "day",
        country: "gb",
        include_answer: false,
        exclude_domains: ["frenchmorning.com", "lepetitjournal.com"],
      }),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      console.error(`Tavily UK news search failed: ${res.status}`);
      return [];
    }

    const data = await res.json();
    const results = (data.results || []).slice(0, 3);

    return results.map((r: { title: string; url: string; content: string; published_date?: string }) => ({
      title: r.title,
      url: r.url,
      content: (r.content || "").slice(0, 200),
      published_date: r.published_date,
    }));
  } catch (err) {
    console.error("Tavily UK news fetch failed:", err);
    return [];
  }
}
