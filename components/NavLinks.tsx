"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLinks({ signedIn, name }: { signedIn: boolean; name: string | null }) {
  const path = usePathname();
  const cur = (href: string) => (path === href || (href !== "/" && path.startsWith(href)) ? "page" : undefined);
  return (
    <nav className="nav" aria-label="Main">
      <Link className="link hide-sm" href="/#how">
        How it works
      </Link>
      {signedIn ? (
        <>
          <Link className="link" href="/studio" aria-current={cur("/studio")}>
            Create
          </Link>
          <Link className="link" href="/library" aria-current={cur("/library") ?? cur("/videos")}>
            Your library
          </Link>
          <Link className="link hide-sm" href="/account" aria-current={cur("/account")} title={name ?? undefined}>
            Account
          </Link>
        </>
      ) : (
        <>
          <Link className="link hide-sm" href="/#showcase">
            See an example
          </Link>
          <Link className="link" href="/login" aria-current={cur("/login")}>
            Sign in
          </Link>
          <Link className="btn small" href="/signup">
            Get started
          </Link>
        </>
      )}
    </nav>
  );
}
