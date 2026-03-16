import Anthropic from "@anthropic-ai/sdk";
import { env } from "./config.js";
import { loadScores } from "./scoring.js";

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

export interface DiscoveryItem {
  title_fr: string;
  source: string;
  url: string;
  published: string;
  hook: string;
}

export interface DigestResult {
  items: DigestItem[];
  mustRead: MustReadItem[];
  discoveries: DiscoveryItem[];
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

  // Load scoring data if available
  let scoringContext = "";
  const scores = await loadScores();
  if (scores && scores.thematiques.length > 0) {
    const ranked = scores.thematiques
      .filter((t) => t.score > 0)
      .map((t) => `- ${t.label}: score ${t.score} (duree moy. ${Math.round(t.avgDuration)}s, rebond ${Math.round(t.avgBounceRate)}%)`)
      .join("\n");
    scoringContext = `\n\n## Scoring par thematique (base sur les 30 derniers jours d'analytics)
Utilise ces scores pour BOOSTER la pertinence des articles qui correspondent aux thematiques les mieux notees. Un article sur une thematique a score eleve devrait etre mieux classe.

${ranked}`;
  }

  const response = await client.messages.create({
    model: "claude-sonnet-4-20250514",
    max_tokens: 6144,
    messages: [
      {
        role: "user",
        content: `Tu es un redacteur en chef pour francaisalondres.com, un media en ligne pour les Francais et francophones vivant a Londres et au Royaume-Uni.

Voici ${articles.length} articles collectes aujourd'hui.${scoringContext}

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
- La categorie EXACTE parmi cette liste : "Immigration & Visas", "Economie & Finance", "Transport", "Logement", "Education", "Sante & Vie quotidienne", "Culture & Loisirs", "Brexit & Politique", "Communaute francaise", "Divers"
  Utilise "Divers" uniquement si l'article ne correspond a aucune autre categorie
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

## TACHE 3 : Decouvertes & Pepites

Parmi les articles que tu n'as PAS selectionnes dans la Tache 1, choisis 3 a 5 articles atypiques ou surprenants. Privilegier :
- Les blogs personnels, medias de niche, sources peu connues (PAS les grands medias comme BBC, Guardian, Le Monde, etc.)
- Les angles originaux, decales, insolites
- Les sujets qu'on ne verrait pas dans un digest classique

Pour chaque decouverte :
- Un titre traduit/adapte en francais (accrocheur, qui donne envie de cliquer)
- La source originale
- L'URL
- La date de publication originale (format ISO)
- Une phrase d'accroche expliquant pourquoi cet article vaut le detour (champ "hook")

Ajoute un champ "discoveries" au JSON :
"discoveries": [
  {
    "title_fr": "Titre accrocheur en francais",
    "source": "Nom du blog ou media",
    "url": "https://...",
    "published": "2026-03-06T10:00:00.000Z",
    "hook": "Pourquoi cet article vaut le detour"
  }
]

Si aucun article ecarte ne merite cette section (tous sont des grands medias classiques), renvoie un tableau vide.

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

  const discoveries: DiscoveryItem[] = (result.discoveries || [])
    .slice(0, 5)
    .map((d: { title_fr: string; source: string; url: string; published: string; hook: string }) => ({
      title_fr: d.title_fr,
      source: d.source,
      url: d.url,
      published: d.published,
      hook: d.hook,
    }));

  return { items, mustRead, discoveries };
}
