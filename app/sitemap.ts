import type { MetadataRoute } from "next";
import { SITE } from "@/lib/content/site";

const PUBLIC_ROUTES = ["", "/signup", "/login", "/terms", "/privacy", "/content-policy"];

export default function sitemap(): MetadataRoute.Sitemap {
  const base = SITE.url.replace(/\/$/, "");
  return PUBLIC_ROUTES.map((path) => ({
    url: `${base}${path}`,
    changeFrequency: path ? "yearly" : "monthly",
    priority: path ? 0.4 : 1,
  }));
}
