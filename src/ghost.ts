import { SignJWT } from "jose";
import Anthropic from "@anthropic-ai/sdk";
import { env } from "./config.js";

const client = new Anthropic({ apiKey: env.anthropicApiKey });

async function makeGhostToken(): Promise<string> {
  const [id, secret] = env.ghostAdminKey.split(":");
  const key = Buffer.from(secret, "hex");
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256", typ: "JWT", kid: id })
    .setIssuedAt()
    .setExpirationTime("5m")
    .setAudience("/admin/")
    .sign(key);
}

// --- Internal linking: search existing Ghost posts ---

interface GhostPost {
  title: string;
  slug: string;
  url: string;
}

async function findRelatedPosts(keywords: string[]): Promise<GhostPost[]> {
  const token = await makeGhostToken();
  const allPosts: GhostPost[] = [];
  const seen = new Set<string>();

  for (const keyword of keywords.slice(0, 5)) {
    const sanitized = keyword.replace(/'/g, "\\'");
    const filter = `status:published+title:~'${sanitized}'`;
    const url = new URL(`${env.ghostUrl}/ghost/api/admin/posts/`);
    url.searchParams.append("limit", "5");
    url.searchParams.append("fields", "title,slug,url");
    url.searchParams.append("filter", filter);

    try {
      const res = await fetch(url.toString(), {
        headers: { Authorization: `Ghost ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        for (const post of data.posts || []) {
          if (!seen.has(post.slug)) {
            seen.add(post.slug);
            allPosts.push(post);
          }
        }
      }
    } catch {
      // Skip failed searches silently
    }
  }

  return allPosts.slice(0, 10);
}

// --- Web research via Tavily ---

async function webResearch(topic: string, sourceUrl: string): Promise<string> {
  const results: string[] = [];

  // Search in English and French for broader coverage
  const queries = [
    `${topic} UK London`,
    `${topic} France expatriés Royaume-Uni`,
  ];

  for (const query of queries) {
    try {
      const res = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: env.tavilyApiKey,
          query,
          max_results: 5,
          search_depth: "advanced",
          include_answer: false,
          exclude_domains: [new URL(sourceUrl).hostname],
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) continue;
      const data = await res.json();
      for (const item of data.results || []) {
        results.push(
          `Titre: ${item.title}\nURL: ${item.url}\nContenu: ${(item.content || "").slice(0, 500)}`
        );
      }
    } catch {
      // Skip failed searches
    }
  }

  return results.slice(0, 8).join("\n\n");
}

// --- Main: create Ghost draft ---

export async function createGhostDraft(
  sourceUrl: string,
  titleFr: string,
  sourceName: string
): Promise<string> {
  // 1. Fetch source content
  console.log("Fetching source content...");
  const pageRes = await fetch(sourceUrl, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; FALBot/1.0)" },
    signal: AbortSignal.timeout(10000),
  });
  const pageHtml = await pageRes.text();

  const textContent = pageHtml
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 12000);

  // 2. Extract keywords for internal linking + web research
  console.log("Extracting keywords...");
  const keywordResponse = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 200,
    messages: [
      {
        role: "user",
        content: `Extrais 5 mots-cles principaux de ce sujet pour rechercher des articles lies. Mots simples, en francais.

Titre: ${titleFr}
Contenu: ${textContent.slice(0, 2000)}

Reponds UNIQUEMENT en JSON : ["mot1", "mot2", ...]`,
      },
    ],
  });
  const kwText =
    keywordResponse.content[0].type === "text"
      ? keywordResponse.content[0].text
      : "";
  const kwMatch = kwText.match(/\[[\s\S]*\]/);
  const keywords: string[] = kwMatch ? JSON.parse(kwMatch[0]) : [];

  // 3. Web research + Ghost search in parallel
  console.log("Researching topic & finding related posts...");
  const [webResults, relatedPosts] = await Promise.all([
    env.tavilyApiKey
      ? webResearch(titleFr, sourceUrl)
      : Promise.resolve(""),
    findRelatedPosts(keywords),
  ]);

  // 4. Build internal links context
  const internalLinksContext =
    relatedPosts.length > 0
      ? `\n\n## Articles existants sur francaisalondres.com (pour maillage interne)
Integre naturellement 2 a 4 liens vers ces articles dans le corps du texte, sous forme de "Lire aussi" ou de liens contextuels dans les phrases.
${relatedPosts.map((p) => `- "${p.title}" : ${p.url}`).join("\n")}`
      : "";

  // 5. Build web research context
  const webResearchContext = webResults
    ? `\n\n## Recherche complementaire (sources supplementaires)
Utilise ces informations pour enrichir, recouper et verifier les faits. Cite les sources supplementaires utilisees dans l'article.
${webResults}`
    : "";

  // 6. Generate article with Claude
  console.log("Generating article...");
  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 8192,
    messages: [
      {
        role: "user",
        content: `Tu es journaliste et redacteur SEO pour francaisalondres.com, un media en ligne pour les Francais et francophones vivant a Londres et au Royaume-Uni (45 000+ membres).

A partir de cette source et des recherches complementaires, redige un article approfondi EN FRANCAIS optimise pour le referencement.

Titre suggere : ${titleFr}
Source principale : ${sourceName} (${sourceUrl})

Contenu source :
${textContent}
${webResearchContext}
${internalLinksContext}

## Regles de redaction
- Redige en francais, ton journalistique professionnel et accessible
- Article LONG et approfondi : minimum 800 mots, idealement 1000-1200 mots
- Adapte le contenu pour un public francais vivant au UK
- Explique le contexte si necessaire (lois UK, institutions, termes anglais)
- Ne copie pas mot pour mot la source, reformule et enrichis
- RECOUPER les informations : verifie les faits avec les sources complementaires
- Chaque information ajoutee doit etre sourcee et verifiable
- Cite toutes les sources utilisees (pas seulement la source principale)

## Structure de l'article
1. **Titre** accrocheur et optimise SEO (max 65 caracteres, mots-cles pertinents)
2. **En bref** — encadre de 3-4 bullet points resumant les points cles (ce qu'il faut retenir)
3. **Chapeau** — 2-3 phrases qui resument l'essentiel et donnent envie de lire
4. **Corps de l'article** — 5-8 paragraphes bien structures avec des sous-titres H2/H3 :
   - Contexte et faits principaux
   - Donnees chiffrees, comparaisons FR/UK si pertinent
   - Impact concret pour les Francais de Londres/UK
   - Analyse et perspectives
5. **Sources** — liste des sources utilisees avec liens
6. **Participez !** — invite les lecteurs a reagir dans les commentaires, donner leur avis, partager leur experience, ou nous transmettre des sources et informations supplementaires sur le sujet

## Format "En bref"
Le bloc "En bref" doit etre formate ainsi :
<div style="background:#f0f4ff;border-left:4px solid #2563eb;padding:16px 20px;margin:20px 0;border-radius:4px;">
<strong>En bref</strong>
<ul style="margin:8px 0 0 0;">
<li>Point cle 1</li>
<li>Point cle 2</li>
<li>Point cle 3</li>
</ul>
</div>

## Maillage interne
- Integre les liens vers les articles existants de francaisalondres.com de maniere naturelle dans le texte
- Utilise des formulations comme "Comme nous l'expliquions dans [titre article](url)" ou des encarts "Lire aussi : [titre](url)"
- Ne force pas les liens s'ils ne sont pas pertinents

## Optimisation SEO
- Titre : inclure le mot-cle principal naturellement, max 65 caracteres
- Chapeau : reprendre le mot-cle principal et un secondaire
- Utiliser des sous-titres H2/H3 avec des mots-cles
- Meta description (excerpt) : 150-160 caracteres, engageante, avec mot-cle
- Densite de mots-cles naturelle (pas de bourrage)
- Slug SEO optimise (court, mots-cles, sans accent)

Reponds UNIQUEMENT en JSON valide :
{
  "title": "Titre SEO de l'article (max 65 car)",
  "slug": "slug-seo-optimise",
  "excerpt": "Meta description SEO 150-160 caracteres",
  "html": "<div style=\\"...\\">En bref...</div><p>Chapeau...</p><h2>Sous-titre</h2><p>Corps...</p>...<h3>Sources</h3><ul><li>...</li></ul><h3>Participez !</h3><p>...</p>",
  "keywords": ["mot-cle-1", "mot-cle-2", "mot-cle-3"]
}`,
      },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Claude did not return valid JSON");

  const article = JSON.parse(jsonMatch[0]);

  // 7. Create draft in Ghost
  console.log("Creating Ghost draft...");
  const token = await makeGhostToken();
  const ghostRes = await fetch(
    `${env.ghostUrl}/ghost/api/admin/posts/?source=html`,
    {
      method: "POST",
      headers: {
        Authorization: `Ghost ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        posts: [
          {
            title: article.title,
            slug: article.slug,
            custom_excerpt: article.excerpt,
            html: article.html,
            status: "draft",
          },
        ],
      }),
    }
  );

  if (!ghostRes.ok) {
    const err = await ghostRes.text();
    throw new Error(`Ghost API error ${ghostRes.status}: ${err}`);
  }

  const ghostData = await ghostRes.json();
  const postUrl = `${env.ghostUrl}/ghost/#/editor/post/${ghostData.posts[0].id}`;

  console.log(
    `Draft created: "${article.title}" (${relatedPosts.length} internal links, web research: ${webResults ? "yes" : "no"})`
  );
  return postUrl;
}
