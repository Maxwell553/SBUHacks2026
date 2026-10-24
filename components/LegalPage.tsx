import Link from "next/link";
import { SITE } from "@/lib/content/site";

export function LegalPage({
  eyebrow,
  title,
  summary,
  sections,
  children,
}: {
  eyebrow: string;
  title: string;
  summary: React.ReactNode;
  sections: { id: string; title: string }[];
  children: React.ReactNode;
}) {
  return (
    <div className="container legal">
      <nav aria-label="On this page">
        <span className="eyebrow" style={{ marginBottom: 10 }}>
          On this page
        </span>
        {sections.map((s) => (
          <a key={s.id} href={`#${s.id}`}>
            {s.title}
          </a>
        ))}
        <div style={{ marginTop: 18, display: "grid", gap: 2 }}>
          <Link href="/terms">Terms of Service</Link>
          <Link href="/privacy">Privacy Policy</Link>
          <Link href="/content-policy">Content &amp; Safety Policy</Link>
        </div>
      </nav>
      <article>
        <span className="eyebrow">{eyebrow}</span>
        <h1>{title}</h1>
        <p className="faint" style={{ fontSize: 15.5 }}>
          Effective {SITE.effectiveDate} · Version {SITE.termsVersion}
        </p>
        <div className="card teal summary">{summary}</div>
        {children}
      </article>
    </div>
  );
}
