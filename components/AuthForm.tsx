"use client";
import Link from "next/link";
import { safeNextPath } from "@/lib/shared/navigation";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ApiError, auth } from "@/lib/client/api";

export function AuthForm({ mode, next }: { mode: "login" | "signup"; next?: string }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agree, setAgree] = useState(false);
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dest = safeNextPath(next) ?? "/studio";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (mode === "signup") {
      if (password.length < 10) return setError("Please choose a password with at least 10 characters.");
      if (!agree) return setError("Please agree to the Terms of Service and Privacy Policy to continue.");
    }
    setBusy(true);
    try {
      if (mode === "signup") await auth.signup(name.trim(), email.trim(), password);
      else await auth.login(email.trim(), password);
      router.replace(dest);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "We couldn’t reach the server. Please try again.");
      setBusy(false);
    }
  };

  const other =
    mode === "login"
      ? `/signup${next ? `?next=${encodeURIComponent(next)}` : ""}`
      : `/login${next ? `?next=${encodeURIComponent(next)}` : ""}`;

  return (
    <form onSubmit={submit} noValidate>
      <div className="stack" style={{ gap: 8 }}>
        <span className="eyebrow">{mode === "login" ? "Welcome back" : "Join Polyhistor"}</span>
        <h1 style={{ fontSize: 36 }}>{mode === "login" ? "Sign in to keep exploring" : "Create your free account"}</h1>
        <p className="muted" style={{ fontSize: 16.5 }}>
          {mode === "login"
            ? "Your videos and their sources are waiting in your library."
            : "Make short history films and keep every one — with its sources — in your library."}
        </p>
      </div>
      {error ? (
        <div className="notice error" role="alert">
          {error}
        </div>
      ) : null}
      {mode === "signup" ? (
        <div className="field">
          <label htmlFor="name">Your name</label>
          <input
            id="name"
            className="input"
            autoComplete="name"
            required
            maxLength={80}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
      ) : null}
      <div className="field">
        <label htmlFor="email">Email</label>
        <input
          id="email"
          className="input"
          type="email"
          autoComplete="email"
          required
          maxLength={254}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
      </div>
      <div className="field">
        <label htmlFor="password">Password</label>
        <div style={{ position: "relative" }}>
          <input
            id="password"
            className="input"
            type={show ? "text" : "password"}
            autoComplete={mode === "login" ? "current-password" : "new-password"}
            required
            minLength={10}
            maxLength={128}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            style={{ paddingRight: 84 }}
            aria-describedby={mode === "signup" ? "pw-hint" : undefined}
          />
          <button
            type="button"
            className="chip"
            onClick={() => setShow((s) => !s)}
            style={{ position: "absolute", right: 8, top: 9 }}
            aria-pressed={show}
          >
            {show ? "Hide" : "Show"}
          </button>
        </div>
        {mode === "signup" ? (
          <span id="pw-hint" className="hint">
            At least 10 characters. A short sentence you’ll remember works well.
          </span>
        ) : null}
      </div>
      {mode === "signup" ? (
        <label className="check">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} required />
          <span>
            I agree to the{" "}
            <Link href="/terms" target="_blank">
              Terms of Service
            </Link>{" "}
            and have read the{" "}
            <Link href="/privacy" target="_blank">
              Privacy Policy
            </Link>
            , including how my questions and videos are stored.
          </span>
        </label>
      ) : null}
      <button className="btn" type="submit" disabled={busy} style={{ width: "100%" }}>
        {busy ? "One moment…" : mode === "login" ? "Sign in" : "Create account"}
      </button>
      <p className="muted" style={{ fontSize: 16, textAlign: "center" }}>
        {mode === "login" ? "New here? " : "Already have an account? "}
        <Link href={other}>{mode === "login" ? "Create an account" : "Sign in"}</Link>
      </p>
    </form>
  );
}
