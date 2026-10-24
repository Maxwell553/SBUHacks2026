import Link from "next/link";
import { Logo } from "@/components/Logo";
import { SITE } from "@/lib/content/site";

export function Footer() {
  return (
    <footer className="site-footer">
      <div className="container">
        <div className="footer-grid">
          <div className="stack" style={{ gap: 14 }}>
            <Link href="/" className="brand" aria-label="Polyhistor home">
              <Logo size={28} />
              <span>POLYHISTOR</span>
            </Link>
            <p className="muted" style={{ maxWidth: 360, fontSize: 16 }}>
              Short animated films that explain moments in history — researched from public sources, with every source
              listed so you can keep exploring.
            </p>
          </div>
          <div>
            <h4>Explore</h4>
            <ul>
              <li>
                <Link href="/studio">Create a video</Link>
              </li>
              <li>
                <Link href="/library">Your library</Link>
              </li>
              <li>
                <Link href="/#showcase">See an example</Link>
              </li>
              <li>
                <Link href="/#how">How it works</Link>
              </li>
            </ul>
          </div>
          <div>
            <h4>Policies</h4>
            <ul>
              <li>
                <Link href="/terms">Terms of Service</Link>
              </li>
              <li>
                <Link href="/privacy">Privacy Policy</Link>
              </li>
              <li>
                <Link href="/content-policy">Content &amp; Safety Policy</Link>
              </li>
              <li>
                <Link href="/privacy#rights">Your privacy choices</Link>
              </li>
            </ul>
          </div>
          <div>
            <h4>Account</h4>
            <ul>
              <li>
                <Link href="/signup">Create an account</Link>
              </li>
              <li>
                <Link href="/login">Sign in</Link>
              </li>
              <li>
                <Link href="/account">Manage or delete account</Link>
              </li>
              <li>
                <a href={`mailto:${SITE.contactEmail}`}>Contact us</a>
              </li>
            </ul>
          </div>
        </div>
        <div className="footer-base">
          <span>© 2026 Polyhistor. The Facet and Tessera typefaces were designed for this site.</span>
          <span>
            <Link href="/terms">Terms</Link> · <Link href="/privacy">Privacy</Link> ·{" "}
            <Link href="/content-policy">Safety</Link>
          </span>
        </div>
      </div>
    </footer>
  );
}
