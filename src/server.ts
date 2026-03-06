import { serve } from "@hono/node-server";
import { Hono } from "hono";
import { createGhostDraft } from "./ghost.js";

const app = new Hono();

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

app.get("/health", (c) => c.json({ status: "ok" }));

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

const port = parseInt(process.env.PORT || "3001", 10);
serve({ fetch: app.fetch, port }, () => {
  console.log(`Article creation server running on http://localhost:${port}`);
});
