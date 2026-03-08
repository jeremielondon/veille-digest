import { fetchUnreadArticles } from "./inoreader.js";
import { rankAndTranslate } from "./summarize.js";
import { sendDigestEmail } from "./email.js";
import { fetchTopUkNews } from "./tavily-news.js";

async function main() {
  console.log("Fetching unread articles from Inoreader...");
  const articles = await fetchUnreadArticles();
  console.log(`Found ${articles.length} unread articles`);

  if (articles.length === 0) {
    console.log("No unread articles. Skipping digest.");
    return;
  }

  console.log("Ranking articles + fetching UK news...");
  const [{ items, mustRead }, ukNews] = await Promise.all([
    rankAndTranslate(articles),
    fetchTopUkNews(),
  ]);
  console.log(`Selected top ${items.length} articles, ${mustRead.length} must-read, ${ukNews.length} UK news`);

  console.log("Sending digest email via Mailgun...");
  await sendDigestEmail(items, mustRead, ukNews);

  console.log("Done!");
}

main().catch((err) => {
  console.error("Digest failed:", err);
  process.exit(1);
});
