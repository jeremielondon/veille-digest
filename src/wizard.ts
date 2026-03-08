import Anthropic from "@anthropic-ai/sdk";
import { env } from "./config.js";
import { findRelatedPosts, publishDraft } from "./ghost.js";

const client = new Anthropic({ apiKey: env.anthropicApiKey });

// --- Types ---

export interface WizardSource {
  title: string;
  url: string;
  content: string;
  score?: number;
}

export interface PlanSection {
  heading: string;
  description: string;
}

export interface ArticlePlan {
  title: string;
  slug: string;
  angle: string;
  sections: PlanSection[];
  keywords: string[];
}

// --- Research: search Tavily for sources ---

export async function researchTopic(
  instructions: string
): Promise<{ sources: WizardSource[]; answer: string }> {
  if (!env.tavilyApiKey) throw new Error("TAVILY_API_KEY not configured");

  // Search EN news + FR context in parallel
  const searches = [
    {
      query: instructions,
      topic: "news" as const,
      time_range: "week" as const,
      country: "gb" as const,
      max_results: 8,
    },
    {
      query: instructions,
      topic: "general" as const,
      time_range: "month" as const,
      max_results: 7,
      country: "gb" as const,
    },
  ];

  const allResults: WizardSource[] = [];
  let answer = "";

  const promises = searches.map(async (params, i) => {
    try {
      const res = await fetch("https://api.tavily.com/search", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          api_key: env.tavilyApiKey,
          query: params.query,
          max_results: params.max_results,
          search_depth: "advanced",
          topic: params.topic,
          time_range: params.time_range,
          country: params.country,
          include_answer: i === 0 ? "advanced" : false,
          include_raw_content: false,
          exclude_domains: ["frenchmorning.com", "lepetitjournal.com"],
        }),
        signal: AbortSignal.timeout(20000),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (data.answer) answer = data.answer;
      for (const item of data.results || []) {
        allResults.push({
          title: item.title,
          url: item.url,
          content: (item.content || "").slice(0, 500),
          score: item.score,
        });
      }
    } catch {
      // Skip failed searches
    }
  });

  await Promise.all(promises);

  // Deduplicate by URL
  const seen = new Set<string>();
  const unique = allResults.filter((r) => {
    if (seen.has(r.url)) return false;
    seen.add(r.url);
    return true;
  });
  unique.sort((a, b) => (b.score || 0) - (a.score || 0));

  return { sources: unique.slice(0, 15), answer };
}

// --- Research more: additional keyword search ---

export async function researchMore(query: string): Promise<WizardSource[]> {
  if (!env.tavilyApiKey) return [];

  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: env.tavilyApiKey,
        query,
        max_results: 5,
        search_depth: "advanced",
        topic: "news",
        time_range: "month",
        exclude_domains: ["frenchmorning.com", "lepetitjournal.com"],
      }),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results || []).map(
      (item: { title: string; url: string; content: string; score: number }) => ({
        title: item.title,
        url: item.url,
        content: (item.content || "").slice(0, 500),
        score: item.score,
      })
    );
  } catch {
    return [];
  }
}

// --- Extract URL content via Tavily ---

export async function extractUrls(urls: string[]): Promise<WizardSource[]> {
  if (!env.tavilyApiKey || urls.length === 0) return [];

  try {
    const res = await fetch("https://api.tavily.com/extract", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: env.tavilyApiKey,
        urls: urls.slice(0, 5),
        extract_depth: "advanced",
        format: "markdown",
      }),
      signal: AbortSignal.timeout(30000),
    });
    if (!res.ok) return [];
    const data = await res.json();
    return (data.results || []).map(
      (item: { url: string; content: string }) => ({
        title: new URL(item.url).hostname.replace("www.", ""),
        url: item.url,
        content: (item.content || "").slice(0, 2000),
      })
    );
  } catch {
    return [];
  }
}

// --- Generate article plan ---

export async function generatePlan(
  instructions: string,
  sources: WizardSource[],
  feedback?: string
): Promise<ArticlePlan> {
  const sourcesContext = sources
    .map((s, i) => `[${i + 1}] ${s.title}\n    URL: ${s.url}\n    ${s.content}`)
    .join("\n\n");

  const feedbackContext = feedback
    ? `\n\n## Retour utilisateur sur le plan precedent\n${feedback}\nAdapte le nouveau plan en tenant compte de ces modifications.`
    : "";

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 2048,
    messages: [
      {
        role: "user",
        content: `Tu es redacteur en chef pour francaisalondres.com, un media en ligne pour les Francais et francophones vivant a Londres et au Royaume-Uni (45 000+ membres).

A partir des instructions et des sources ci-dessous, propose un PLAN D'ARTICLE structure.

## Instructions de l'auteur
${instructions}
${feedbackContext}

## Sources disponibles (${sources.length})
${sourcesContext}

## Ce que tu dois produire
Un plan d'article avec :
- Titre SEO accrocheur (max 65 caracteres)
- Slug SEO (court, sans accent)
- Angle editorial : en une phrase, quel est l'angle/la perspective de l'article
- 5-8 sections avec pour chacune : un titre de section (H2/H3) et une description de ce qu'elle doit couvrir (2-3 phrases)
- Mots-cles SEO principaux (3-5)

Les sections doivent inclure :
- Un bloc "En bref" (resume des points cles)
- Contexte et faits principaux
- Impact pour les Francais du UK
- Donnees chiffrees si pertinent
- Sources (liste des sources citees)
- Participez ! (invitation aux commentaires)

Reponds UNIQUEMENT en JSON valide :
{
  "title": "Titre SEO (max 65 car)",
  "slug": "slug-seo",
  "angle": "Angle editorial en une phrase",
  "sections": [
    { "heading": "En bref", "description": "Resume des 3-4 points cles a retenir" },
    { "heading": "Titre section", "description": "Ce que cette section doit couvrir..." }
  ],
  "keywords": ["mot1", "mot2", "mot3"]
}`,
      },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Claude did not return valid JSON");

  return JSON.parse(jsonMatch[0]);
}

// --- Generate full article from plan + sources ---

export async function generateArticle(
  instructions: string,
  plan: ArticlePlan,
  sources: WizardSource[]
): Promise<{ ghostEditorUrl: string; title: string }> {
  // 1. Extract full content for each source via Tavily
  console.log(`Extracting full content for ${sources.length} sources...`);
  let fullSources = sources;
  if (env.tavilyApiKey) {
    const urls = sources.map((s) => s.url);
    // Extract in batches of 5
    const extracted: WizardSource[] = [];
    for (let i = 0; i < urls.length; i += 5) {
      const batch = urls.slice(i, i + 5);
      const results = await extractUrls(batch);
      extracted.push(...results);
    }
    // Merge: use extracted content when available, fallback to snippet
    fullSources = sources.map((s) => {
      const ext = extracted.find((e) => e.url === s.url);
      return ext ? { ...s, content: ext.content } : s;
    });
  }

  // 2. Find related Ghost posts for internal linking
  console.log("Finding related posts for internal linking...");
  const relatedPosts = await findRelatedPosts(plan.keywords);

  const internalLinksContext =
    relatedPosts.length > 0
      ? `\n\n## Articles existants sur francaisalondres.com (pour maillage interne)
Integre naturellement 2 a 4 liens vers ces articles dans le corps du texte.
${relatedPosts.map((p) => `- "${p.title}" : ${p.url}`).join("\n")}`
      : "";

  // 3. Build sources context
  const sourcesContext = fullSources
    .map(
      (s, i) =>
        `[Source ${i + 1}] ${s.title}\nURL: ${s.url}\nContenu:\n${s.content.slice(0, 2000)}`
    )
    .join("\n\n---\n\n");

  // 4. Build plan context
  const planContext = plan.sections
    .map((s, i) => `${i + 1}. **${s.heading}** — ${s.description}`)
    .join("\n");

  // 5. Generate article with Claude
  console.log("Generating article from plan...");
  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 8192,
    messages: [
      {
        role: "user",
        content: `Tu es journaliste et redacteur SEO pour francaisalondres.com, un media en ligne pour les Francais et francophones vivant a Londres et au Royaume-Uni (45 000+ membres).

Redige un article complet EN FRANCAIS en suivant EXACTEMENT le plan ci-dessous.

## Instructions de l'auteur
${instructions}

## Plan de l'article
Titre : ${plan.title}
Angle : ${plan.angle}

${planContext}

## Sources (${fullSources.length})
${sourcesContext}
${internalLinksContext}

## Regles de redaction
- Redige en francais, ton journalistique professionnel et accessible
- Article LONG et approfondi : minimum 800 mots, idealement 1000-1200 mots
- SUIS LE PLAN EXACTEMENT : chaque section du plan doit etre presente dans l'article
- Adapte le contenu pour un public francais vivant au UK
- Explique le contexte si necessaire (lois UK, institutions, termes anglais)
- Ne copie pas mot pour mot les sources, reformule et enrichis
- RECOUPER les informations entre les sources
- Chaque information doit etre sourcee et verifiable
- Cite toutes les sources utilisees

## Format "En bref"
<div style="background:#f0f4ff;border-left:4px solid #2563eb;padding:16px 20px;margin:20px 0;border-radius:4px;">
<strong>En bref</strong>
<ul style="margin:8px 0 0 0;">
<li>Point cle 1</li>
<li>Point cle 2</li>
<li>Point cle 3</li>
</ul>
</div>

## Maillage interne
- Integre les liens internes naturellement dans le texte
- Ne force pas les liens s'ils ne sont pas pertinents

## Optimisation SEO
- Titre : max 65 caracteres, mot-cle principal
- Meta description : 150-160 caracteres, engageante
- Sous-titres H2/H3 avec mots-cles
- Slug : ${plan.slug}

Reponds UNIQUEMENT en JSON valide :
{
  "title": "${plan.title}",
  "slug": "${plan.slug}",
  "excerpt": "Meta description SEO 150-160 caracteres",
  "html": "<div>En bref...</div><p>Chapeau...</p><h2>...</h2><p>...</p>...<h3>Sources</h3><ul>...</ul><h3>Participez !</h3><p>...</p>"
}`,
      },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Claude did not return valid JSON");

  const article = JSON.parse(jsonMatch[0]);

  // 6. Publish draft to Ghost
  console.log("Publishing draft to Ghost...");
  const ghostEditorUrl = await publishDraft({
    title: article.title,
    slug: article.slug,
    excerpt: article.excerpt,
    html: article.html,
  });

  console.log(`Wizard draft created: "${article.title}"`);
  return { ghostEditorUrl, title: article.title };
}
