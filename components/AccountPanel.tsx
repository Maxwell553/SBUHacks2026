"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { auth, type User } from "@/lib/client/api";

export function AccountPanel({ user }: { user: User }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState<"logout" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);

  const logout = async () => {
    setBusy("logout");
    setError(null);
    try {
      await auth.logout();
      router.replace("/");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign out failed. Please try again.");
      setBusy(null);
    }
  };

  const remove = async () => {
    setBusy("delete");
    setError(null);
    try {
      await auth.deleteAccount();
      router.replace("/?deleted=1");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "We couldn’t delete your account. Please try again.");
      setBusy(null);
    }
  };

  return (
    <div className="split" style={{ alignItems: "start", gap: 28 }}>
      <div className="card stack" style={{ gap: 18 }}>
        <h2 style={{ fontSize: 24 }}>Your details</h2>
        <dl style={{ margin: 0, display: "grid", gridTemplateColumns: "140px 1fr", gap: "10px 16px" }}>
          <dt className="faint">Name</dt>
          <dd style={{ margin: 0 }}>{user.name}</dd>
          <dt className="faint">Email</dt>
          <dd style={{ margin: 0, wordBreak: "break-all" }}>{user.email}</dd>
          <dt className="faint">Member since</dt>
          <dd style={{ margin: 0 }}>
            {new Date(user.createdAt).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" })}
          </dd>
        </dl>
        <div className="row">
          <Link className="btn ghost small" href="/library">
            Your video library
          </Link>
          <button className="btn ghost small" onClick={logout} disabled={!!busy}>
            {busy === "logout" ? "Signing out…" : "Sign out"}
          </button>
        </div>
        <p className="hint">
          Want a copy of your videos? Open any video in your library and choose “Download GIF”. See our{" "}
          <Link href="/privacy#rights">privacy choices</Link> for other requests.
        </p>
      </div>

      <div className="card terra stack" style={{ gap: 14 }}>
        <h2 style={{ fontSize: 24 }}>Delete your account</h2>
        <p className="muted" style={{ fontSize: 16.5 }}>
          This permanently removes your account, your sign-in sessions, every video in your library, the saved GIFs and
          the questions and sources stored with them. It can’t be undone.
        </p>
        <div className="field">
          <label htmlFor="confirm">Type DELETE to confirm</label>
          <input
            id="confirm"
            className="input"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            autoComplete="off"
          />
        </div>
        {error ? <div className="notice error">{error}</div> : null}
        <button
          className="btn danger"
          onClick={remove}
          disabled={confirm !== "DELETE" || !!busy}
          style={{ justifySelf: "start" }}
        >
          {busy === "delete" ? "Deleting…" : "Delete my account"}
        </button>
      </div>
    </div>
  );
}
