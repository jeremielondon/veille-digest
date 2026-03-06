import Anthropic from "@anthropic-ai/sdk";
import { env } from "./config.js";

const client = new Anthropic({ apiKey: env.anthropicApiKey });

interface ArticleInput {
  title: string;
  url: string;
  source: string;
  published: string;
  summary: string;
  categories: string[];
}

export interface DigestItem {
  title_fr: string;
  source: string;
  url: string;
  category: string;
  relevance: number;
  published: string;
}

export async function rankAndTranslate(
  articles: ArticleInput[]
): Promise<DigestItem[]> {
  const articleList = articles
    .map(
      (a, i) =>
        `[${i + 1}] Titre: ${a.title}\nSource: ${a.source}\nURL: ${a.url}\nPublie: ${a.published}\nCategories: ${a.categories.join(", ")}\nResume: ${a.summary}`
    )
    .join("\n\n");

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 4096,
    messages: [
      {
        role: "user",
        content: `Tu es un redacteur en chef pour francaisalondres.com, un media en ligne pour les Francais et francophones vivant a Londres et au Royaume-Uni.

Voici ${articles.length} articles collectes aujourd'hui. Selectionne les ${env.digestMaxArticles} plus pertinents pour notre audience (Francais de Londres/UK).

Criteres de pertinence :
- Impact direct sur les expats francais (immigration, visas, sante, education, emploi)
- Actualite londonienne importante (transport, evenements majeurs, politique locale)
- Relations France-UK, diplomatie
- Vie pratique et economie UK
- Culture et evenements francophones

Pour chaque article selectionne, donne :
- Un titre traduit/adapte en francais (court, accrocheur, style media)
- La source originale
- L'URL
- La date de publication originale (champ "published" fourni, au format ISO)
- La categorie (Politique, Immigration, Transport, Economie, Culture, Vie Pratique, Diplomatie, Education, Sante, Sport, Communaute)
- Un score de pertinence de 1 a 10

IMPORTANT: Reponds UNIQUEMENT en JSON valide, sans texte avant ou apres. Format :
[
  {
    "title_fr": "Titre en francais",
    "source": "Nom de la source",
    "url": "https://...",
    "published": "2026-03-06T10:00:00.000Z",
    "category": "Categorie",
    "relevance": 9
  }
]

Trie par pertinence decroissante.

Articles :
${articleList}`,
      },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  const jsonMatch = text.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error("Claude did not return valid JSON");

  const items: DigestItem[] = JSON.parse(jsonMatch[0]);
  return items.slice(0, env.digestMaxArticles);
}
