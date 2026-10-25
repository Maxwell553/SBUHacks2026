export const SITE = {
  name: "PolyChronicle",
  tagline: "History, rebuilt in polygons.",
  description:
    "Ask for any historical event. Gemini researches it with Google Search, designs bespoke low-poly models, and our renderer animates a 20–60 second film — entirely in code.",
  url: process.env.NEXT_PUBLIC_SITE_URL || process.env.APP_URL || "http://localhost:3000",
  contactEmail: process.env.NEXT_PUBLIC_CONTACT_EMAIL?.trim() || "privacy@polychronicle.app",
  legalEntity: process.env.NEXT_PUBLIC_LEGAL_ENTITY?.trim() || "the PolyChronicle team",
  jurisdiction: "the State of New York, United States",
  termsVersion: "2026-10-23",
  effectiveDate: "October 23, 2026",
};
