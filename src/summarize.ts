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

export interface MustReadItem {
  title_fr: string;
  sources: string[];
  urls: string[];
  category: string;
  why: string;
}

export interface DigestResult {
  items: DigestItem[];
  mustRead: MustReadItem[];
}

export async function rankAndTranslate(
  articles: ArticleInput[]
): Promise<DigestResult> {
  const articleList = articles
    .map(
      (a, i) =>
        `[${i + 1}] Titre: ${a.title}\nSource: ${a.source}\nURL: ${a.url}\nPublie: ${a.published}\nCategories: ${a.categories.join(", ")}\nResume: ${a.summary}`
    )
    .join("\n\n");

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 6144,
    messages: [
      {
        role: "user",
        content: `Tu es un redacteur en chef pour francaisalondres.com, un media en ligne pour les Francais et francophones vivant a Londres et au Royaume-Uni.

Voici ${articles.length} articles collectes aujourd'hui.

## TACHE 1 : Selection des ${env.digestMaxArticles} articles les plus pertinents

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

## TACHE 2 : Detection des "A ne pas manquer"

Identifie les sujets couverts par PLUSIEURS sources differentes (au moins 2 medias). Ce sont les infos importantes du jour car elles sont reprises partout. Selectionne les 3 principales.

Pour chaque sujet "a ne pas manquer" :
- Un titre synthetique en francais
- La liste des sources qui en parlent
- Les URLs correspondantes
- La categorie
- Une phrase expliquant pourquoi c'est important pour les Francais du UK

IMPORTANT: Reponds UNIQUEMENT en JSON valide, sans texte avant ou apres. Format :
{
  "items": [
    {
      "title_fr": "Titre en francais",
      "source": "Nom de la source",
      "url": "https://...",
      "published": "2026-03-06T10:00:00.000Z",
      "category": "Categorie",
      "relevance": 9
    }
  ],
  "must_read": [
    {
      "title_fr": "Sujet repris par plusieurs medias",
      "sources": ["BBC", "Guardian", "Standard"],
      "urls": ["https://...", "https://...", "https://..."],
      "category": "Categorie",
      "why": "Pourquoi c'est important pour les Francais du UK"
    }
  ]
}

Trie les items par pertinence decroissante et les must_read par nombre de sources decroissant.

Articles :
${articleList}`,
      },
    ],
  });

  const text =
    response.content[0].type === "text" ? response.content[0].text : "";

  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Claude did not return valid JSON");

  const result = JSON.parse(jsonMatch[0]);

  const items: DigestItem[] = (result.items || []).slice(
    0,
    env.digestMaxArticles
  );

  const mustRead: MustReadItem[] = (result.must_read || [])
    .slice(0, 3)
    .map((mr: { title_fr: string; sources: string[]; urls: string[]; category: string; why: string }) => ({
      title_fr: mr.title_fr,
      sources: mr.sources,
      urls: mr.urls,
      category: mr.category,
      why: mr.why,
    }));

  return { items, mustRead };
}
