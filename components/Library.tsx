"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { motion, useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";
import { ApiError, videos, type Video } from "@/lib/client/api";

export const STATUS_LABEL: Record<string, { text: string; cls: string }> = {
  rendered: { text: "Saved", cls: "ok" },
  ready: { text: "Ready to save", cls: "teal" },
  researching: { text: "In progress", cls: "terra" },
  scripting: { text: "In progress", cls: "terra" },
  pending: { text: "In progress", cls: "terra" },
  failed: { text: "Didn’t finish", cls: "bad" },
  rejected: { text: "Not made", cls: "bad" },
};

export const niceDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });

export function Library() {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [list, setList] = useState<Video[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () =>
      videos
        .list()
        .then(({ videos: v }) => {
          if (alive) {
            setList(v);
            setError(null);
          }
        })
        .catch((e) => {
          if (e instanceof ApiError && e.status === 401) router.push("/login?next=/library");
          else if (alive) setError(e instanceof Error ? e.message : "Couldn’t load your library.");
        });
    load();
    const t = setInterval(() => {
      if (document.visibilityState === "visible") load();
    }, 15000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [router]);

  if (error) return <div className="notice error">{error}</div>;
  if (!list)
    return (
      <div className="lib-grid" aria-busy="true">
        {[0, 1, 2].map((i) => (
          <div key={i} className="card lib-card" style={{ opacity: 0.6 }}>
            <div className="lib-thumb" />
            <div className="lib-meta">
              <div className="bar-track" style={{ width: "70%" }} />
              <div className="bar-track" style={{ width: "40%" }} />
            </div>
          </div>
        ))}
      </div>
    );
  if (!list.length)
    return (
      <div className="card soft empty">
        <h2 style={{ fontSize: 28 }}>Your library is empty — for now</h2>
        <p className="muted" style={{ maxWidth: 480 }}>
          Every video you make lands here with your question and its sources. What would you like to learn first?
        </p>
        <Link className="btn terra" href="/studio">
          Make your first video
        </Link>
      </div>
    );

  return (
    <div className="lib-grid">
      {list.map((v, i) => {
        const st = STATUS_LABEL[v.status] ?? { text: v.status, cls: "" };
        const thumb = v.posterUrl ?? v.gifUrl;
        return (
          <motion.div
            key={v.id}
            initial={reduce ? false : { opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: Math.min(i, 8) * 0.05, duration: 0.5 }}
          >
            <Link href={`/videos/${v.id}`} className="card lib-card" style={{ height: "100%" }}>
              <div className="lib-thumb">
                {thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={thumb} alt="" loading="lazy" />
                ) : (
                  <span className="faint" style={{ fontSize: 15 }}>
                    {st.text}
                  </span>
                )}
              </div>
              <div className="lib-meta">
                <div className="spread">
                  <span className={`chip ${st.cls}`}>{st.text}</span>
                  <span className="hint">{niceDate(v.createdAt)}</span>
                </div>
                <h3>{v.title ?? v.prompt}</h3>
                <p className="faint" style={{ fontSize: 15 }}>
                  {v.duration}s · {v.aspect === "portrait" ? "Vertical" : "Widescreen"}
                  {v.sources?.length ? ` · ${v.sources.length} sources` : ""}
                </p>
              </div>
            </Link>
          </motion.div>
        );
      })}
    </div>
  );
}
