"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ApiError, videos, type Video } from "@/lib/client/api";
import { saveRender, type SaveProgress } from "@/lib/client/save";
import { Player } from "@/components/Player";
import { VideoDetails } from "@/components/VideoDetails";
import { STATUS_LABEL, niceDate } from "@/components/Library";

export function VideoView({ id }: { id: string }) {
  const router = useRouter();
  const [video, setVideo] = useState<Video | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"watch" | "gif">("watch");
  const [save, setSave] = useState<SaveProgress | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const [shownId, setShownId] = useState(id);
  if (shownId !== id) {
    setShownId(id);
    setVideo(null);
    setError(null);
  }

  useEffect(() => {
    let alive = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const load = async () => {
      try {
        const { video: v } = await videos.get(id);
        if (!alive) return;
        setVideo(v);
        setError(null);
        if (["researching", "scripting", "pending"].includes(v.status)) timer = setTimeout(load, 2500);
      } catch (e) {
        if (!alive) return;
        if (e instanceof ApiError && e.status === 401) router.push(`/login?next=/videos/${id}`);
        else {
          setError(
            e instanceof ApiError && e.status === 404
              ? "We couldn’t find this video in your library."
              : e instanceof Error
                ? e.message
                : "Couldn’t load this video.",
          );
          if (!(e instanceof ApiError) || e.status >= 500) timer = setTimeout(load, 5000);
        }
      }
    };
    void load();
    return () => {
      alive = false;
      clearTimeout(timer);
      abortRef.current?.abort();
    };
  }, [id, router]);

  const runSave = async () => {
    if (!video) return;
    setSaveError(null);
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      setVideo(await saveRender(video, setSave, ac.signal));
    } catch (e) {
      if ((e as Error).name !== "AbortError") setSaveError(e instanceof Error ? e.message : "Saving didn’t finish.");
    } finally {
      setSave(null);
    }
  };

  const remove = async () => {
    if (!video) return;
    try {
      await videos.remove(video.id);
      router.push("/library");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn’t delete this video.");
    }
  };

  if (error)
    return (
      <div className="card soft empty" style={{ margin: "48px 0" }}>
        <h2 style={{ fontSize: 26 }}>{error}</h2>
        <Link className="btn" href="/library">
          Back to your library
        </Link>
      </div>
    );
  if (!video)
    return (
      <p className="muted" style={{ padding: "64px 0" }}>
        Loading your video…
      </p>
    );

  const st = STATUS_LABEL[video.status] ?? { text: video.status, cls: "" };
  const portrait = video.aspect === "portrait";
  const pct = save ? Math.round(save.fraction * 100) : 0;

  return (
    <div className="stack" style={{ gap: 28, padding: "40px 0 96px" }}>
      <div className="spread" style={{ alignItems: "flex-end" }}>
        <div className="stack" style={{ gap: 8 }}>
          <Link href="/library" style={{ fontSize: 15 }}>
            ← Your video library
          </Link>
          {video.script ? (
            <span className="eyebrow">
              {video.script.dateLabel} · {video.script.location}
            </span>
          ) : null}
          <h1 style={{ fontSize: "clamp(30px, 4vw, 46px)" }}>{video.title ?? "Untitled video"}</h1>
          <p className="muted">
            You asked: <em>“{video.prompt}”</em>
          </p>
          <div className="row">
            <span className={`chip ${st.cls}`}>{st.text}</span>
            <span className="hint">
              {niceDate(video.createdAt)} · {video.duration}s · {portrait ? "Vertical" : "Widescreen"}
            </span>
          </div>
        </div>
        <div className="row">
          {video.gifUrl ? (
            <a
              className="btn"
              href={video.gifUrl}
              download={`${(video.title ?? "polyhistor").replace(/[^\w-]+/g, "-")}.gif`}
            >
              Download GIF
            </a>
          ) : null}
          {confirming ? (
            <>
              <button className="btn danger small" onClick={remove}>
                Yes, delete it
              </button>
              <button className="btn ghost small" onClick={() => setConfirming(false)}>
                Keep it
              </button>
            </>
          ) : (
            <button className="btn ghost small" onClick={() => setConfirming(true)}>
              Delete video
            </button>
          )}
        </div>
      </div>

      {video.status === "failed" || video.status === "rejected" ? (
        <div className={`notice ${video.status === "rejected" ? "info" : "error"}`}>
          <strong>{video.status === "rejected" ? "We couldn’t make this video." : "This video didn’t finish."}</strong>{" "}
          {video.error ?? ""} <Link href={`/studio?q=${encodeURIComponent(video.prompt)}`}>Try again in Create</Link>
        </div>
      ) : null}

      {video.script ? (
        <div className={`split video-layout${portrait ? " portrait" : ""}`}>
          <div className="stack" style={{ gap: 14 }}>
            {video.gifUrl ? (
              <div className="seg" role="group" aria-label="View">
                <button aria-pressed={tab === "watch"} onClick={() => setTab("watch")}>
                  Watch
                </button>
                <button aria-pressed={tab === "gif"} onClick={() => setTab("gif")}>
                  Saved GIF
                </button>
              </div>
            ) : null}
            {tab === "gif" && video.gifUrl ? (
              <div className="player" style={{ aspectRatio: portrait ? "9 / 16" : "16 / 9" }}>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={video.gifUrl}
                  alt={`Animated GIF: ${video.title ?? video.prompt}`}
                  style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                />
              </div>
            ) : (
              <Player script={video.script} aspect={portrait ? "portrait" : "landscape"} autoPlay loop />
            )}
            {video.status === "ready" ? (
              <div className="card teal stack" style={{ gap: 12 }}>
                <strong>This video isn’t saved as a GIF yet.</strong>
                <p className="muted" style={{ fontSize: 16 }}>
                  Save it to keep a downloadable copy in your library. GIF downloads are silent; “Read aloud” works in
                  the browser.
                </p>
                {save ? (
                  <>
                    <div className="bar-track">
                      <div className="bar-fill" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="hint">
                      {save.stage === "animating" ? "Animating" : "Saving"}… {pct}%
                    </span>
                  </>
                ) : (
                  <button className="btn small" onClick={runSave} style={{ justifySelf: "start" }}>
                    Save as GIF
                  </button>
                )}
                {saveError ? <div className="notice error">{saveError}</div> : null}
              </div>
            ) : null}
          </div>
          <VideoDetails video={video} />
        </div>
      ) : video.status === "researching" || video.status === "scripting" ? (
        <div className="notice info">This video is still being made. Check back in a minute or two.</div>
      ) : null}
    </div>
  );
}
