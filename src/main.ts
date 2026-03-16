import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { basicAuth } from "hono/basic-auth";
import cron from "node-cron";
import { env } from "./config.js";
import { createGhostDraft } from "./ghost.js";
import { fetchUnreadArticles } from "./inoreader.js";
import { rankAndTranslate } from "./summarize.js";
import { sendDigestEmail } from "./email.js";
import { fetchTopUkNews } from "./tavily-news.js";
import { researchTopic, researchMore, extractUrls, generatePlan, generateArticle } from "./wizard.js";
import { wizardPage } from "./wizard-page.js";
import { runScoring, loadScores, loadConfig, saveConfig } from "./scoring.js";
import { scoringPage } from "./scoring-page.js";

const app = new Hono();

// --- Basic auth on all routes except /health ---

app.use("/*", async (c, next) => {
  if (c.req.path === "/health") return next();
  const auth = basicAuth({
    username: env.adminUsername,
    password: env.adminPassword,
  });
  return auth(c, next);
});

// --- Home page ---

app.get("/", (c) =>
  c.html(
    page(
      "Veille francaisalondres.com",
      `<p>Outil de veille media pour <a href="https://francaisalondres.com">francaisalondres.com</a></p>
       <a href="/write" class="btn">Ecrire un article</a>
       <a href="/scoring" class="btn" style="background:#10b981;margin-left:8px;">Scoring</a>
       <a href="/trigger-digest" class="btn" style="background:#6b7280;margin-left:8px;" onclick="this.textContent='Envoi en cours...'; this.style.opacity='0.6'; this.style.pointerEvents='none';">Envoyer le digest</a>
       <p class="source">Digest automatique : lundi au vendredi, 6h heure de Londres</p>
       <p class="source"><a href="/health">Health check</a></p>`
    )
  )
);

// --- Article creation endpoint ---

app.get("/create-article", async (c) => {
  const url = c.req.query("url");
  const title = c.req.query("title") || "";
  const source = c.req.query("source") || "";

  if (!url) {
    return c.html(page("Erreur", "<p>URL manquante</p>"), 400);
  }

  try {
    const postUrl = await createGhostDraft(url, title, source);
    return c.html(
      page(
        "Article cree !",
        `<p>Le brouillon a ete cree avec succes.</p>
         <a href="${postUrl}" class="btn">Ouvrir dans Ghost</a>
         <p class="source">Source : <a href="${url}">${source || url}</a></p>`
      )
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error("Article creation failed:", msg);
    return c.html(
      page(
        "Erreur",
        `<p>Impossible de creer l'article :</p><pre>${msg}</pre>
         <p>Source : <a href="${url}">${url}</a></p>`
      ),
      500
    );
  }
});

app.get("/health", (c) =>
  c.json({ status: "ok", scheduled: "Mon-Fri 6:00 Europe/London" })
);

app.get("/trigger-digest", async (c) => {
  try {
    await runDigest();
    return c.html(
      page(
        "Digest envoye !",
        `<p>Le digest a ete envoye avec succes.</p>
         <a href="/" class="btn">Retour</a>`
      )
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.html(
      page(
        "Erreur",
        `<p>Impossible d'envoyer le digest :</p><pre>${msg}</pre>
         <a href="/" class="btn">Retour</a>`
      ),
      500
    );
  }
});

// --- Article wizard ---

app.get("/write", (c) => c.html(wizardPage()));

app.post("/api/research", async (c) => {
  try {
    const { instructions } = await c.req.json();
    if (!instructions) return c.json({ error: "Instructions manquantes" }, 400);
    const result = await researchTopic(instructions);
    return c.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: msg }, 500);
  }
});

app.post("/api/research-more", async (c) => {
  try {
    const { query } = await c.req.json();
    if (!query) return c.json({ error: "Query manquante" }, 400);
    const sources = await researchMore(query);
    return c.json({ sources });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: msg }, 500);
  }
});

app.post("/api/extract-url", async (c) => {
  try {
    const { urls } = await c.req.json();
    if (!urls || urls.length === 0) return c.json({ error: "URLs manquantes" }, 400);
    const sources = await extractUrls(urls);
    return c.json({ sources });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: msg }, 500);
  }
});

app.post("/api/plan", async (c) => {
  try {
    const { instructions, sources, feedback } = await c.req.json();
    if (!instructions || !sources) return c.json({ error: "Donnees manquantes" }, 400);
    const plan = await generatePlan(instructions, sources, feedback);
    return c.json(plan);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: msg }, 500);
  }
});

app.post("/api/create-draft", async (c) => {
  try {
    const { instructions, plan, sources } = await c.req.json();
    if (!plan || !sources) return c.json({ error: "Donnees manquantes" }, 400);
    const result = await generateArticle(instructions, plan, sources);
    return c.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: msg }, 500);
  }
});

// --- Scoring dashboard ---

app.get("/scoring", async (c) => {
  const data = await loadScores();
  return c.html(scoringPage(data));
});

app.post("/api/scoring/run", async (c) => {
  try {
    await runScoring();
    return c.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: msg }, 500);
  }
});

app.post("/api/scoring/config", async (c) => {
  try {
    const config = await c.req.json();
    await saveConfig(config);
    return c.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return c.json({ error: msg }, 500);
  }
});

// --- Scoring cron: Sunday 22:00 London time ---

cron.schedule(
  "0 22 * * 0",
  async () => {
    console.log(`[${new Date().toISOString()}] Running weekly scoring job...`);
    try {
      await runScoring();
      console.log("Weekly scoring completed.");
    } catch (err) {
      console.error("Weekly scoring failed:", err);
    }
  },
  { timezone: "Europe/London" }
);

// --- Digest cron: Monday-Friday at 6:00 AM London time ---

cron.schedule(
  "0 6 * * 1-5",
  async () => {
    console.log(`[${new Date().toISOString()}] Running scheduled digest...`);
    try {
      await runDigest();
    } catch (err) {
      console.error("Scheduled digest failed:", err);
    }
  },
  { timezone: "Europe/London" }
);

async function runDigest() {
  console.log("Fetching unread articles from Inoreader...");
  const articles = await fetchUnreadArticles();
  console.log(`Found ${articles.length} unread articles`);

  if (articles.length === 0) {
    console.log("No unread articles. Skipping digest.");
    return;
  }

  console.log("Ranking articles + fetching UK news...");
  const [{ items, mustRead, discoveries }, ukNews] = await Promise.all([
    rankAndTranslate(articles),
    fetchTopUkNews(),
  ]);
  console.log(`Selected top ${items.length} articles, ${mustRead.length} must-read, ${discoveries.length} discoveries, ${ukNews.length} UK news`);

  console.log("Sending digest email via Mailgun...");
  await sendDigestEmail(items, mustRead, ukNews, discoveries);
  console.log("Digest sent successfully!");
}

function page(title: string, body: string): string {
  return `<!DOCTYPE html>
<html><head><meta charset="utf-8"><title>${title} — Veille FAL</title>
<style>
  body { font-family: -apple-system, sans-serif; max-width: 600px; margin: 60px auto; padding: 20px; }
  h1 { font-size: 24px; }
  .btn { display: inline-block; padding: 10px 20px; background: #2563eb; color: white; text-decoration: none; border-radius: 6px; margin: 16px 0; }
  .source { color: #666; font-size: 14px; }
  pre { background: #f3f4f6; padding: 12px; border-radius: 6px; overflow-x: auto; font-size: 13px; }
</style></head>
<body><h1>${title}</h1>${body}</body></html>`;
}

// --- Start server ---

const port = parseInt(process.env.PORT || "3001", 10);
serve({ fetch: app.fetch, port }, () => {
  console.log(`Veille FAL server running on port ${port}`);
  console.log("Digest scheduled: Mon-Fri at 06:00 Europe/London");
  console.log("Auth: basic auth enabled on all routes except /health");
  console.log("Scoring cron: Sunday at 22:00 Europe/London");
  console.log("Endpoints:");
  console.log("  GET /health");
  console.log("  GET /write              — article creation wizard");
  console.log("  GET /scoring            — scoring dashboard");
  console.log("  GET /trigger-digest");
  console.log("  GET /create-article?url=...&title=...&source=...");
});
