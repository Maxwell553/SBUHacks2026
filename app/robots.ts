import type { MetadataRoute } from "next";
import { SITE } from "@/lib/content/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/api/", "/studio", "/library", "/account", "/videos/", "/dev/"],
    },
    sitemap: `${SITE.url.replace(/\/$/, "")}/sitemap.xml`,
  };
}
