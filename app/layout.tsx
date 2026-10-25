import type { Metadata, Viewport } from "next";
import "@/app/globals.css";
import { Header } from "@/components/Header";
import { Footer } from "@/components/Footer";
import { AudioUnlock } from "@/components/AudioUnlock";
import { MotionRoot } from "@/components/MotionRoot";
import { getViewer } from "@/lib/server/viewer";
import { SITE } from "@/lib/content/site";

export const metadata: Metadata = {
  metadataBase: new URL(SITE.url),
  title: { default: `${SITE.name} — ${SITE.tagline}`, template: `%s · ${SITE.name}` },
  description: SITE.description,
  openGraph: { title: SITE.name, description: SITE.description, type: "website" },
  twitter: { card: "summary_large_image", title: SITE.name, description: SITE.description },
};

export const viewport: Viewport = {
  themeColor: "#fbf7ef",
  colorScheme: "light",
};

const FONTS = ["Facet-Black.otf", "Tessera-Regular.otf", "Tessera-Bold.otf", "TesseraMono-Regular.otf"];

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const user = await getViewer();
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <head>
        {FONTS.map((f) => (
          <link key={f} rel="preload" href={`/fonts/${f}`} as="font" type="font/otf" crossOrigin="anonymous" />
        ))}
      </head>
      <body>
        <MotionRoot>
          <AudioUnlock />
          <Header user={user} />
          <main>{children}</main>
          <Footer />
        </MotionRoot>
      </body>
    </html>
  );
}
