import { env } from "./config.js";
import { makeGhostToken } from "./ghost.js";
import { readFile, writeFile, mkdir } from "fs/promises";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, "..", "data");
const SCORES_FILE = join(DATA_DIR, "scoring.json");
const CONFIG_FILE = join(DATA_DIR, "scoring-config.json");

// --- Thematiques ---

export interface Thematique {
  id: string;
  label: string;
  keywords: string[];
}

export const THEMATIQUES: Thematique[] = [
  {
    id: "immigration",
    label: "Immigration & Visas",
    keywords: ["visa", "immigration", "home office", "settled status", "brp", "passeport", "titre de sejour", "permis de travail", "sponsor", "right to work", "naturalisation", "citoyennete", "nationality", "ukvi"],
  },
  {
    id: "economie",
    label: "Economie & Finance",
    keywords: ["livre sterling", "euro", "inflation", "budget", "impot", "hmrc", "tax", "taux", "banque", "bank of england", "bourse", "economie", "recession", "croissance", "pib", "salaire", "cout de la vie", "prix", "pension", "retraite", "epargne"],
  },
  {
    id: "transport",
    label: "Transport",
    keywords: ["eurostar", "tfl", "metro", "train", "heathrow", "gatwick", "transport", "bus", "tube", "elizabeth line", "northern line", "overground", "avion", "vol", "ryanair", "easyjet", "greve transport"],
  },
  {
    id: "logement",
    label: "Logement",
    keywords: ["loyer", "immobilier", "rent", "housing", "council tax", "logement", "appartement", "flat", "achat", "mortgage", "hypotheque", "propriete", "rightmove", "zoopla", "demenagement"],
  },
  {
    id: "education",
    label: "Education",
    keywords: ["ecole", "universite", "university", "ofsted", "bourse", "etudiant", "student", "lycee", "college", "formation", "diplome", "school", "nursery", "creche", "education"],
  },
  {
    id: "sante",
    label: "Sante & Vie quotidienne",
    keywords: ["nhs", "sante", "health", "medecin", "gp", "hopital", "hospital", "pharmacie", "dentiste", "supermarche", "shopping", "tesco", "sainsbury", "waitrose", "marks spencer"],
  },
  {
    id: "culture",
    label: "Culture & Loisirs",
    keywords: ["musee", "museum", "exposition", "restaurant", "festival", "theatre", "concert", "cinema", "spectacle", "galerie", "art", "sortie", "loisir", "pub", "bar", "time out", "evenement"],
  },
  {
    id: "brexit",
    label: "Brexit & Politique",
    keywords: ["brexit", "election", "parlement", "parliament", "starmer", "sunak", "labour", "conservative", "politique", "referendum", "accord", "deal", "trade", "douane", "customs", "frontiere"],
  },
  {
    id: "communaute",
    label: "Communaute francaise",
    keywords: ["consulat", "ambassade", "vote", "francais", "expatrie", "expat", "communaute", "association", "institut francais", "lycee charles de gaulle", "dispensaire"],
  },
];

// --- Types ---

export interface ScoringConfig {
  weights: {
    pageviews: number;
    visitDuration: number;
    freeSignups: number;
    paidConversions: number;
  };
  period: string;
}

export interface ArticleScore {
  page: string;
  title: string;
  visitors: number;
  pageviews: number;
  visitDuration: number;
  bounceRate: number;
  thematique: string;
}

export interface ThematiqueScore {
  id: string;
  label: string;
  score: number;
  avgVisitors: number;
  avgPageviews: number;
  avgDuration: number;
  avgBounceRate: number;
  articleCount: number;
  topArticles: ArticleScore[];
}

export interface MemberStats {
  totalFree: number;
  totalPaid: number;
  newFree30d: number;
  newPaid30d: number;
}

export interface ScoringResult {
  generatedAt: string;
  period: string;
  config: ScoringConfig;
  siteStats: { visitors: number; pageviews: number; avgDuration: number; bounceRate: number };
  memberStats: MemberStats;
  thematiques: ThematiqueScore[];
  topArticles: ArticleScore[];
}

// --- Config ---

const DEFAULT_CONFIG: ScoringConfig = {
  weights: {
    pageviews: 0.2,
    visitDuration: 0.3,
    freeSignups: 0.2,
    paidConversions: 0.3,
  },
  period: "30d",
};

export async function loadConfig(): Promise<ScoringConfig> {
  try {
    const data = await readFile(CONFIG_FILE, "utf-8");
    return { ...DEFAULT_CONFIG, ...JSON.parse(data) };
  } catch {
    return DEFAULT_CONFIG;
  }
}

export async function saveConfig(config: ScoringConfig): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(CONFIG_FILE, JSON.stringify(config, null, 2));
}

// --- Plausible API ---

async function plausibleGet(endpoint: string, params: Record<string, string>): Promise<unknown> {
  if (!env.plausibleApiKey) throw new Error("PLAUSIBLE_API_KEY not configured");

  const url = new URL(`https://plausible.io/api/v1/stats/${endpoint}`);
  url.searchParams.append("site_id", env.plausibleSiteId);
  for (const [k, v] of Object.entries(params)) {
    url.searchParams.append(k, v);
  }

  const res = await fetch(url.toString(), {
    headers: { Authorization: `Bearer ${env.plausibleApiKey}` },
    signal: AbortSignal.timeout(15000),
  });

  if (!res.ok) {
    throw new Error(`Plausible API error ${res.status}: ${await res.text()}`);
  }

  return res.json();
}

async function fetchPlausibleArticles(period: string): Promise<ArticleScore[]> {
  const data = (await plausibleGet("breakdown", {
    period,
    property: "event:page",
    limit: "100",
    metrics: "visitors,pageviews,visit_duration,bounce_rate",
    filters: "event:page!=/;event:page!=/offres-publicitaires/;event:page!=/visites-guidees/;event:page!=/annuaire/",
  })) as { results: Array<{ page: string; visitors: number; pageviews: number; visit_duration: number; bounce_rate: number }> };

  return data.results
    .filter((r) => {
      // Exclude non-article pages
      if (r.page.includes("#/portal/")) return false;
      if (r.page.startsWith("/c/")) return false;
      if (r.page.startsWith("/p/")) return false;
      if (r.page === "/tag/") return false;
      if (r.page.includes("?")) return false;
      if (r.page.length < 5) return false;
      return true;
    })
    .map((r) => ({
      page: r.page,
      title: slugToTitle(r.page),
      visitors: r.visitors,
      pageviews: r.pageviews,
      visitDuration: r.visit_duration,
      bounceRate: r.bounce_rate,
      thematique: detectThematique(r.page),
    }));
}

async function fetchPlausibleAggregate(period: string): Promise<{ visitors: number; pageviews: number; avgDuration: number; bounceRate: number }> {
  const data = (await plausibleGet("aggregate", {
    period,
    metrics: "visitors,pageviews,visit_duration,bounce_rate",
  })) as { results: { visitors: { value: number }; pageviews: { value: number }; visit_duration: { value: number }; bounce_rate: { value: number } } };

  return {
    visitors: data.results.visitors.value,
    pageviews: data.results.pageviews.value,
    avgDuration: data.results.visit_duration.value,
    bounceRate: data.results.bounce_rate.value,
  };
}

// --- Ghost Members API ---

async function fetchMemberStats(): Promise<MemberStats> {
  const token = await makeGhostToken();

  const fetchCount = async (filter: string): Promise<number> => {
    const url = new URL(`${env.ghostUrl}/ghost/api/admin/members/`);
    url.searchParams.append("filter", filter);
    url.searchParams.append("limit", "1");

    const res = await fetch(url.toString(), {
      headers: { Authorization: `Ghost ${token}` },
    });
    if (!res.ok) return 0;
    const data = await res.json();
    return data.meta?.pagination?.total || 0;
  };

  const [totalFree, totalPaid, newFree30d, newPaid30d] = await Promise.all([
    fetchCount("status:free"),
    fetchCount("status:paid"),
    fetchCount("status:free+created_at:>now-30d"),
    fetchCount("status:paid+created_at:>now-30d"),
  ]);

  return { totalFree, totalPaid, newFree30d, newPaid30d };
}

// --- Scoring logic ---

function detectThematique(pageSlug: string): string {
  const slug = pageSlug.toLowerCase().replace(/-/g, " ").replace(/\//g, " ");

  for (const t of THEMATIQUES) {
    for (const kw of t.keywords) {
      if (slug.includes(kw.replace(/ /g, " "))) {
        return t.id;
      }
    }
  }
  return "autre";
}

function slugToTitle(page: string): string {
  return page
    .replace(/^\//, "")
    .replace(/\/$/, "")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .slice(0, 80);
}

function normalize(values: number[]): number[] {
  const max = Math.max(...values, 1);
  return values.map((v) => v / max);
}

export function calculateThematiqueScores(
  articles: ArticleScore[],
  memberStats: MemberStats,
  config: ScoringConfig
): ThematiqueScore[] {
  // Group articles by thematique
  const groups = new Map<string, ArticleScore[]>();
  for (const a of articles) {
    const existing = groups.get(a.thematique) || [];
    existing.push(a);
    groups.set(a.thematique, existing);
  }

  const scores: ThematiqueScore[] = [];

  for (const t of THEMATIQUES) {
    const arts = groups.get(t.id) || [];
    if (arts.length === 0) {
      scores.push({
        id: t.id,
        label: t.label,
        score: 0,
        avgVisitors: 0,
        avgPageviews: 0,
        avgDuration: 0,
        avgBounceRate: 0,
        articleCount: 0,
        topArticles: [],
      });
      continue;
    }

    const avgVisitors = arts.reduce((s, a) => s + a.visitors, 0) / arts.length;
    const avgPageviews = arts.reduce((s, a) => s + a.pageviews, 0) / arts.length;
    const avgDuration = arts.reduce((s, a) => s + a.visitDuration, 0) / arts.length;
    const avgBounceRate = arts.reduce((s, a) => s + a.bounceRate, 0) / arts.length;

    scores.push({
      id: t.id,
      label: t.label,
      score: 0, // calculated below
      avgVisitors,
      avgPageviews,
      avgDuration,
      avgBounceRate,
      articleCount: arts.length,
      topArticles: arts.sort((a, b) => b.visitors - a.visitors).slice(0, 5),
    });
  }

  // Normalize and weight
  const pvNorm = normalize(scores.map((s) => s.avgPageviews));
  const durNorm = normalize(scores.map((s) => s.avgDuration));
  // For conversions, distribute proportionally by article count
  const totalArticles = scores.reduce((s, t) => s + t.articleCount, 0) || 1;
  const freeNorm = normalize(scores.map((s) => (s.articleCount / totalArticles) * memberStats.newFree30d));
  const paidNorm = normalize(scores.map((s) => (s.articleCount / totalArticles) * memberStats.newPaid30d));

  const w = config.weights;
  for (let i = 0; i < scores.length; i++) {
    scores[i].score = Math.round(
      (pvNorm[i] * w.pageviews +
        durNorm[i] * w.visitDuration +
        freeNorm[i] * w.freeSignups +
        paidNorm[i] * w.paidConversions) * 100
    );
  }

  return scores.sort((a, b) => b.score - a.score);
}

// --- Main scoring job ---

export async function runScoring(): Promise<ScoringResult> {
  console.log(`[${new Date().toISOString()}] Running scoring job...`);

  const config = await loadConfig();

  const [articles, siteStats, memberStats] = await Promise.all([
    fetchPlausibleArticles(config.period),
    fetchPlausibleAggregate(config.period),
    fetchMemberStats(),
  ]);

  console.log(`Fetched ${articles.length} articles from Plausible, ${memberStats.totalFree} free + ${memberStats.totalPaid} paid members`);

  const thematiques = calculateThematiqueScores(articles, memberStats, config);
  const topArticles = articles
    .sort((a, b) => b.visitors - a.visitors)
    .slice(0, 30);

  const result: ScoringResult = {
    generatedAt: new Date().toISOString(),
    period: config.period,
    config,
    siteStats,
    memberStats,
    thematiques,
    topArticles,
  };

  // Persist
  await mkdir(DATA_DIR, { recursive: true });
  await writeFile(SCORES_FILE, JSON.stringify(result, null, 2));
  console.log("Scoring saved to", SCORES_FILE);

  return result;
}

export async function loadScores(): Promise<ScoringResult | null> {
  try {
    const data = await readFile(SCORES_FILE, "utf-8");
    return JSON.parse(data);
  } catch {
    return null;
  }
}
