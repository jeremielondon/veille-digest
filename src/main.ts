import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { basicAuth } from "hono/basic-auth";
import cron from "node-cron";
import { env } from "./config.js";
import { createGhostDraft } from "./ghost.js";
import { fetchUnreadArticles } from "./inoreader.js";
import { rankAndTranslate } from "./summarize.js";
import { sendDigestEmail } from "./email.js";

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
       <a href="/trigger-digest" class="btn" onclick="this.textContent='Envoi en cours...'; this.style.opacity='0.6'; this.style.pointerEvents='none';">Envoyer le digest maintenant</a>
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

  console.log("Ranking and translating with Claude...");
  const digest = await rankAndTranslate(articles);
  console.log(`Selected top ${digest.length} articles`);

  console.log("Sending digest email via Mailgun...");
  await sendDigestEmail(digest);
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
  console.log("Endpoints:");
  console.log("  GET /health");
  console.log("  GET /trigger-digest");
  console.log("  GET /create-article?url=...&title=...&source=...");
});
