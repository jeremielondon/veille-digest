import { fetchUnreadArticles } from "./inoreader.js";
import { rankAndTranslate } from "./summarize.js";
import { sendDigestEmail } from "./email.js";

async function main() {
  console.log("Fetching unread articles from Inoreader...");
  const articles = await fetchUnreadArticles();
  console.log(`Found ${articles.length} unread articles`);

  if (articles.length === 0) {
    console.log("No unread articles. Skipping digest.");
    return;
  }

  console.log("Ranking and translating with Claude...");
  const digest = await rankAndTranslate(articles);
  console.log(`Selected top ${digest.length} articles`);

  console.log("Sending digest email via Mailgun...");
  await sendDigestEmail(digest);

  console.log("Done!");
}

main().catch((err) => {
  console.error("Digest failed:", err);
  process.exit(1);
});
