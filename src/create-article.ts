import { createGhostDraft } from "./ghost.js";

async function main() {
  const url = process.argv[2];
  const title = process.argv[3] || "";
  const source = process.argv[4] || "";

  if (!url) {
    console.error("Usage: npm run create-article -- <url> [title] [source]");
    process.exit(1);
  }

  console.log(`Creating article from: ${url}`);
  const postUrl = await createGhostDraft(url, title, source);
  console.log(`Draft created! Edit it here: ${postUrl}`);
}

main().catch((err) => {
  console.error("Article creation failed:", err);
  process.exit(1);
});
