import { config } from "dotenv";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
config({ path: join(__dirname, "..", ".env") });

function required(key: string): string {
  const val = process.env[key];
  if (!val) throw new Error(`Missing env var: ${key}`);
  return val;
}

export const env = {
  anthropicApiKey: required("ANTHROPIC_API_KEY"),
  ghostUrl: required("GHOST_URL"),
  ghostAdminKey: required("GHOST_ADMIN_KEY"),
  inoreaderAppId: required("INOREADER_APP_ID"),
  inoreaderAppKey: required("INOREADER_APP_KEY"),
  inoreaderAccessToken: required("INOREADER_ACCESS_TOKEN"),
  inoreaderRefreshToken: required("INOREADER_REFRESH_TOKEN"),
  mailgunApiKey: required("MAILGUN_API_KEY"),
  mailgunDomain: required("MAILGUN_DOMAIN"),
  mailgunFrom: required("MAILGUN_FROM"),
  mailgunTo: required("MAILGUN_TO"),
  digestMaxArticles: parseInt(process.env.DIGEST_MAX_ARTICLES || "20", 10),
  adminUsername: required("ADMIN_USERNAME"),
  adminPassword: required("ADMIN_PASSWORD"),
  createArticleUrl: process.env.CREATE_ARTICLE_URL || "http://localhost:3001/create-article",
  tavilyApiKey: process.env.TAVILY_API_KEY || "",
};
