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

export async function createGhostDraft(
  sourceUrl: string,
  titleFr: string,
  sourceName: string
): Promise<string> {
  // 1. Fetch source content
  const pageRes = await fetch(sourceUrl, {
    headers: { "User-Agent": "Mozilla/5.0 (compatible; FALBot/1.0)" },
    signal: AbortSignal.timeout(10000),
  });
  const pageHtml = await pageRes.text();

  // Extract text content (basic)
  const textContent = pageHtml
    .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 10000);

  // 2. Generate article with Claude
  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: `Tu es journaliste et redacteur SEO pour francaisalondres.com, un media en ligne pour les Francais et francophones vivant a Londres et au Royaume-Uni (45 000+ membres).

A partir de cette source, redige un article complet EN FRANCAIS optimise pour le referencement.

Titre suggere : ${titleFr}
Source : ${sourceName} (${sourceUrl})

Contenu source :
${textContent}

## Regles de redaction
- Redige en francais, ton journalistique professionnel et accessible
- Adapte le contenu pour un public francais vivant au UK
- Explique le contexte si necessaire (lois UK, institutions, termes anglais)
- Ne copie pas mot pour mot la source, reformule et enrichis
- Enrichis l'article avec des informations complementaires pertinentes (chiffres, contexte historique, comparaison FR/UK) quand c'est utile

## Structure de l'article
1. Titre accrocheur et optimise SEO (inclure des mots-cles pertinents)
2. Chapeau (2 phrases qui resument l'essentiel et donnent envie de lire)
3. Corps de l'article (4-6 paragraphes bien structures avec des sous-titres H2/H3)
4. Source : mention de la source originale avec lien
5. Appel aux commentaires : une question ouverte a la fin pour inciter les lecteurs a reagir et partager leur experience (ex: "Et vous, avez-vous ete concerne par... ?", "Qu'en pensez-vous ?", "Partagez votre experience dans les commentaires")

## Optimisation SEO
- Titre : inclure le mot-cle principal naturellement, max 65 caracteres
- Chapeau : reprendre le mot-cle principal et un secondaire
- Utiliser des sous-titres H2/H3 avec des mots-cles
- Meta description (excerpt) : 150-160 caracteres, engageante, avec mot-cle
- Densite de mots-cles naturelle (pas de bourrage)

Reponds UNIQUEMENT en JSON valide :
{
  "title": "Titre SEO de l'article (max 65 car)",
  "excerpt": "Meta description SEO 150-160 caracteres",
  "html": "<h2>Sous-titre</h2><p>Corps...</p>...<hr><p><em>Source : <a href='url'>nom</a></em></p><h3>Et vous ?</h3><p>Question pour les commentaires...</p>"
}`,
      },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Claude did not return valid JSON");

  const article = JSON.parse(jsonMatch[0]);

  // 3. Create draft in Ghost (source: "html" tells Ghost to convert HTML to Lexical)
  const token = await makeGhostToken();
  const ghostRes = await fetch(`${env.ghostUrl}/ghost/api/admin/posts/?source=html`, {
    method: "POST",
    headers: {
      Authorization: `Ghost ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      posts: [
        {
          title: article.title,
          custom_excerpt: article.excerpt,
          html: article.html,
          status: "draft",
        },
      ],
    }),
  });

  if (!ghostRes.ok) {
    const err = await ghostRes.text();
    throw new Error(`Ghost API error ${ghostRes.status}: ${err}`);
  }

  const ghostData = await ghostRes.json();
  const postUrl = `${env.ghostUrl}/ghost/#/editor/post/${ghostData.posts[0].id}`;

  return postUrl;
}
