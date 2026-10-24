import Link from "next/link";
import { Logo } from "@/components/Logo";
import { NavLinks } from "@/components/NavLinks";
import type { User } from "@/lib/client/api";

export function Header({ user }: { user: User | null }) {
  return (
    <header className="site-header">
      <div className="container bar">
        <Link href="/" className="brand" aria-label="Polyhistor home">
          <Logo size={30} />
          <span>POLYHISTOR</span>
        </Link>
        <NavLinks signedIn={!!user} name={user?.name ?? null} />
      </div>
    </header>
  );
}
