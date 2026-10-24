"use client";
import type { Video } from "@/lib/client/api";
import { domainOf, safeHref } from "@/lib/client/save";

const CATEGORY_WORDS: Record<string, string> = {
  figure: "person",
  animal: "animal",
  vehicle: "vehicle",
  watercraft: "boat",
  aircraft: "aircraft",
  spacecraft: "spacecraft",
  building: "building",
  structure: "structure",
  nature: "landscape",
  prop: "object",
  effect: "effect",
};

/** Sources, research notes, accuracy guidance and the cast — shown with every video. */
export function VideoDetails({ video }: { video: Video }) {
  const sources = (video.sources ?? []).filter((s) => s && typeof s.url === "string");
  const models = video.script?.models ?? [];
  return (
    <div className="stack" style={{ gap: 22 }}>
      <div className="notice info" role="note">
        <strong>A note on accuracy.</strong> This film is an AI-assisted interpretation, simplified to fit in under a
        minute. Dates, numbers and names can differ between sources, and historians don’t always agree — check the links
        below for anything important.
      </div>

      <section aria-labelledby={`src-${video.id}`} className="stack" style={{ gap: 12 }}>
        <h3 id={`src-${video.id}`} style={{ fontSize: 20 }}>
          Sources{" "}
          {sources.length ? (
            <span className="faint" style={{ fontWeight: 400 }}>
              ({sources.length})
            </span>
          ) : null}
        </h3>
        {sources.length ? (
          <ol className="sources">
            {sources.map((s, i) => {
              const href = safeHref(s.url);
              const body = (
                <>
                  <span className="n" aria-hidden="true">
                    {i + 1}
                  </span>
                  <span>
                    {s.title || domainOf(s.url)}
                    <span className="domain">{domainOf(s.url)}</span>
                  </span>
                </>
              );
              return (
                <li key={`${s.url}-${i}`}>
                  {href ? (
                    <a href={href} target="_blank" rel="noopener noreferrer nofollow">
                      {body}
                    </a>
                  ) : (
                    <span className="sources-item">{body}</span>
                  )}
                </li>
              );
            })}
          </ol>
        ) : (
          <p className="muted" style={{ fontSize: 16 }}>
            No web sources were recorded for this video, so treat its details with extra care.
          </p>
        )}
      </section>

      {video.research ? (
        <details className="disclosure">
          <summary>What we found while researching</summary>
          <div className="body">{video.research}</div>
        </details>
      ) : null}

      {models.length ? (
        <details className="disclosure">
          <summary>The cast made for this video ({models.length})</summary>
          <div className="body" style={{ whiteSpace: "normal" }}>
            <ul style={{ margin: 0, paddingLeft: 20, display: "grid", gap: 6 }}>
              {models.map((m) => (
                <li key={m.id}>
                  {m.name} <span className="faint">· {CATEGORY_WORDS[m.category] ?? m.category}</span>
                </li>
              ))}
            </ul>
          </div>
        </details>
      ) : null}
    </div>
  );
}
