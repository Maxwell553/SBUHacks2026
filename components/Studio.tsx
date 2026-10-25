"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState, type CSSProperties } from "react";
import { ApiError, videos, type Video } from "@/lib/client/api";
import { saveRender, type SaveProgress } from "@/lib/client/save";
import type { Aspect } from "@/lib/schema/video";
import { TOPIC_IDEAS } from "@/lib/content/topics";
import dynamic from "next/dynamic";
import { StudioPreview } from "@/components/StudioPreview";
const Player = dynamic(() => import("@/components/Player").then((m) => m.Player));
import { VideoDetails } from "@/components/VideoDetails";

type StepKey = "check" | "research" | "build" | "animate" | "save";
type StepState = "idle" | "active" | "done" | "error";

const STEPS: { key: StepKey; label: string; hint: string }[] = [
  {
    key: "check",
    label: "Checking your request",
    hint: "Making sure it’s a real moment in history we can show respectfully.",
  },
  {
    key: "research",
    label: "Finding reliable sources",
    hint: "Gathering facts from public websites and noting every source.",
  },
  { key: "build", label: "Building your scenes", hint: "Designing the people, places and machines of the time." },
  { key: "animate", label: "Bringing history to life", hint: "Animating every frame right here in your browser." },
  { key: "save", label: "Saving to your library", hint: "Storing your video, your question and its sources." },
];

const fresh = (): Record<StepKey, StepState> => ({
  check: "idle",
  research: "idle",
  build: "idle",
  animate: "idle",
  save: "idle",
});

export function Studio({ initialPrompt = "" }: { initialPrompt?: string }) {
  const router = useRouter();
  const reduce = useReducedMotion();
  const [prompt, setPrompt] = useState(initialPrompt);
  const [duration, setDuration] = useState(40);
  const [ideaOffset, setIdeaOffset] = useState(0);
  const [aspect, setAspect] = useState<Aspect>("portrait");
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState(fresh);
  const [video, setVideo] = useState<Video | null>(null);
  const [error, setError] = useState<{ title: string; message: string; kind: "declined" | "limit" | "error" } | null>(
    null,
  );
  const [saveProgress, setSaveProgress] = useState<SaveProgress | null>(null);
  const [saveFailed, setSaveFailed] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const completedTitleRef = useRef<HTMLHeadingElement>(null);
  const incompleteRef = useRef<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const discard = () => {
      abortRef.current?.abort();
      if (pollRef.current) clearInterval(pollRef.current);
      if (incompleteRef.current) void videos.discard(incompleteRef.current).catch(() => {});
    };
    window.addEventListener("pagehide", discard);
    return () => {
      window.removeEventListener("pagehide", discard);
      discard();
    };
  }, []);

  useEffect(() => {
    if (!busy) return;
    const started = Date.now();
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(t);
  }, [busy]);

  const mark = (key: StepKey, state: StepState) => setSteps((s) => ({ ...s, [key]: state }));

  const runSave = async (v: Video) => {
    setSaveFailed(null);
    mark("animate", "active");
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const saved = await saveRender(
        v,
        (p) => {
          setSaveProgress(p);
          if (p.stage === "saving") {
            mark("animate", "done");
            mark("save", "active");
          }
        },
        ac.signal,
      );
      mark("animate", "done");
      mark("save", "done");
      incompleteRef.current = null;
      setVideo(saved);
    } catch (e) {
      await videos.discard(v.id).catch(() => {});
      incompleteRef.current = null;
      setVideo(null);
      if ((e as Error).name === "AbortError") return;
      setSteps((s) => ({
        ...s,
        animate: s.animate === "done" ? "done" : "error",
        save: s.animate === "done" ? "error" : "idle",
      }));
      setSaveFailed(e instanceof Error ? e.message : "Saving didn’t work this time.");
    } finally {
      setSaveProgress(null);
    }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const q = prompt.trim();
    if (q.length < 8) {
      setError({
        title: "Tell us a little more",
        message: "Describe the moment in a few words — for example “The first Moon landing in 1969”.",
        kind: "error",
      });
      return;
    }
    setBusy(true);
    setElapsed(0);
    setError(null);
    setVideo(null);
    setSaveFailed(null);
    setSteps({ ...fresh(), check: "active" });
    const startedAt = Date.now();
    const ac = new AbortController();
    abortRef.current = ac;

    let polling = true;
    pollRef.current = setInterval(async () => {
      try {
        const { videos: list } = await videos.list(true);
        const mine = list.find((v) => v.prompt === q && new Date(v.createdAt).getTime() >= startedAt - 15_000);
        if (!mine || !polling || ac.signal.aborted) return;
        incompleteRef.current = mine.id;
        if (mine.status === "researching") setSteps((s) => ({ ...s, check: "done", research: "active" }));
        if (mine.status === "scripting") setSteps((s) => ({ ...s, check: "done", research: "done", build: "active" }));
      } catch {
        /* polling is best-effort */
      }
    }, 2500);

    try {
      const { video: v } = await videos.create(q, duration, aspect, ac.signal);
      polling = false;
      if (pollRef.current) clearInterval(pollRef.current);
      setSteps((s) => ({ ...s, check: "done", research: "done", build: "done" }));
      incompleteRef.current = v.id;
      setVideo(v);
      router.refresh();
      await runSave(v);
      router.refresh();
    } catch (err) {
      polling = false;
      if (pollRef.current) clearInterval(pollRef.current);
      if (incompleteRef.current) await videos.discard(incompleteRef.current).catch(() => {});
      incompleteRef.current = null;
      if ((err as Error).name === "AbortError") return;
      setBusy(false);
      setSteps((s) => {
        const active = (Object.keys(s) as StepKey[]).find((k) => s[k] === "active");
        return active ? { ...s, [active]: "error" } : s;
      });
      if (err instanceof ApiError) {
        if (err.status === 401) {
          router.push(`/login?next=${encodeURIComponent("/studio")}`);
          return;
        }
        if (err.status === 422) {
          setError({ title: "We can’t make this one", message: err.message, kind: "declined" });
          return;
        }
        if (err.status === 409 || err.status === 429) {
          setError({ title: "Let’s pause for a moment", message: err.message, kind: "limit" });
          return;
        }
        setError({ title: "Something went wrong", message: err.message, kind: "error" });
        return;
      }
      setError({
        title: "We lost the connection",
        message: "Please check your internet connection and try again.",
        kind: "error",
      });
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (video?.status === "rendered") completedTitleRef.current?.focus();
  }, [video?.status]);

  const completed = video?.status === "rendered" && !!video.script;
  const working = busy || !!saveProgress;
  const started = Object.values(steps).some((s) => s !== "idle");
  const pct = saveProgress ? Math.round(saveProgress.fraction * 100) : 0;

  return (
    <section className="studio-workspace" aria-labelledby="studio-title">
      <header className="studio-heading">
        <div>
          <span className="eyebrow">The history studio</span>
          <h1 id="studio-title">{completed ? "Your chronicle is ready." : "Turn curiosity into a chronicle."}</h1>
          <p className="muted" id="studio-help">
            {completed
              ? "Watch your film, explore its sources, or start a new story."
              : "Choose a moment. Set the pace. Bring it to life."}
          </p>
        </div>
        <span className="studio-heading-note">
          {completed ? "Saved to your library" : "A little curiosity goes a long way."}
        </span>
      </header>
      {completed && video?.script ? (
        <motion.div
          initial={reduce ? false : { opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="stack studio-result"
        >
          <div className="stack" style={{ gap: 6 }}>
            <span className="eyebrow">
              {video.script.dateLabel} · {video.script.location}
            </span>
            <h2 ref={completedTitleRef} tabIndex={-1} className="studio-result-title">
              {video.script.title}
            </h2>
          </div>
          <div className={`studio-result-layout ${video.aspect === "portrait" ? "portrait" : "landscape"}`}>
            <div className="stack studio-result-film">
              <Player
                script={video.script}
                aspect={video.aspect === "portrait" ? "portrait" : "landscape"}
                autoPlay
                loop
              />
              <div className="row">
                {video.movieUrl || video.gifUrl ? (
                  <a
                    className="btn"
                    href={video.movieUrl || video.gifUrl!}
                    download={`${(video.title ?? "polychronicle").replace(/[^\w-]+/g, "-")}.${video.movieUrl ? (video.movieMime === "video/webm" ? "webm" : "mp4") : "gif"}`}
                  >
                    Download {video.movieUrl ? "HD video" : "GIF"}
                  </a>
                ) : null}

                <Link className="btn ghost" href={`/videos/${video.id}`}>
                  Open in your library
                </Link>
                <button
                  className="btn ghost"
                  type="button"
                  onClick={() => {
                    setPrompt("");
                    setVideo(null);
                    setSteps(fresh());
                    setError(null);
                    window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
                  }}
                  disabled={working}
                >
                  Ask something new
                </button>
              </div>
            </div>
            <VideoDetails video={video} />
          </div>
        </motion.div>
      ) : (
        <div className="studio">
          <form className="stack studio-form" onSubmit={submit} aria-describedby="studio-help">
            <div className="field">
              <label htmlFor="prompt">What would you like to explore?</label>
              <textarea
                id="prompt"
                className="input"
                rows={3}
                maxLength={2000}
                placeholder="e.g. How did Gutenberg’s printing press work?"
                value={prompt}
                onChange={(e) => setPrompt(e.target.value)}
                disabled={working}
                required
              />
            </div>
            <div className="stack" style={{ gap: 10 }}>
              <div className="spread">
                <span className="label">Need an idea?</span>
                <button
                  className="idea-refresh"
                  type="button"
                  disabled={working}
                  onClick={() => setIdeaOffset((i) => (i + 3) % TOPIC_IDEAS.length)}
                >
                  More ideas ↻
                </button>
              </div>
              <div className="topics studio-ideas">
                {Array.from({ length: 3 }, (_, i) => TOPIC_IDEAS[(ideaOffset + i) % TOPIC_IDEAS.length]).map((t) => (
                  <button
                    type="button"
                    key={t}
                    className="chip"
                    aria-pressed={prompt === t}
                    onClick={() => setPrompt(t)}
                    disabled={working}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>
            <div className="field duration-panel">
              <div className="spread">
                <label htmlFor="duration">Set the pace</label>
                <output htmlFor="duration" className="duration-value">
                  {duration}
                  <small> sec</small>
                </output>
              </div>
              <input
                id="duration"
                className="duration"
                type="range"
                min={20}
                max={60}
                step={5}
                value={duration}
                aria-valuetext={`${duration} seconds`}
                style={{ "--range-fill": `${((duration - 20) / 40) * 100}%` } as CSSProperties}
                onChange={(e) => setDuration(Number(e.target.value))}
                disabled={working}
              />
              <div className="duration-scale" aria-hidden="true">
                <span>20s · A glimpse</span>
                <span>40s · The story</span>
                <span>60s · Go deeper</span>
              </div>
            </div>
            <div className="field">
              <span className="label" id="format-label">
                Format
              </span>
              <div className="seg format-picker" role="group" aria-labelledby="format-label">
                <button
                  type="button"
                  aria-pressed={aspect === "landscape"}
                  onClick={() => setAspect("landscape")}
                  disabled={working}
                >
                  <span className="format-icon landscape" aria-hidden="true" /> Widescreen
                </button>
                <button
                  type="button"
                  aria-pressed={aspect === "portrait"}
                  onClick={() => setAspect("portrait")}
                  disabled={working}
                >
                  <span className="format-icon portrait" aria-hidden="true" /> Vertical (phones)
                </button>
              </div>
            </div>
            <button className="btn studio-submit" type="submit" disabled={working} style={{ width: "100%" }}>
              {saveProgress ? "Bringing history to life…" : busy ? "Working on it…" : "Bring it to life →"}
            </button>
            <p className="hint">
              Requests are checked to keep things respectful and historical. See our{" "}
              <Link href="/content-policy">content policy</Link>.
            </p>
          </form>

          <div className="stack studio-output" style={{ gap: 22 }}>
            <AnimatePresence mode="wait">
              {error ? (
                <motion.div
                  key="err"
                  initial={reduce ? false : { opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className={`notice ${error.kind === "error" ? "error" : "info"}`}
                  role="alert"
                >
                  <strong>{error.title}.</strong> {error.message}
                  {error.kind === "declined" ? (
                    <> Try asking about a specific historical event, person’s achievement or period.</>
                  ) : null}
                </motion.div>
              ) : null}
            </AnimatePresence>

            {started ? (
              <div className="stack studio-progress" style={{ gap: 16 }} aria-live="polite">
                <div className="spread">
                  <h2 style={{ fontSize: 22 }}>
                    {steps.save === "done"
                      ? "Your video is ready"
                      : error || saveFailed
                        ? "Let’s try another take"
                        : "Making your video"}
                  </h2>
                  {busy ? (
                    <span className="chip teal">
                      {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}
                    </span>
                  ) : null}
                </div>
                <div className="production-banner" data-working={working}>
                  <div className="production-frames" aria-hidden="true">
                    <i>01</i>
                    <i>02</i>
                    <i>03</i>
                  </div>
                  <div>
                    <span className="mono">
                      {duration} SECONDS · {aspect === "portrait" ? "VERTICAL" : "WIDESCREEN"}
                    </span>
                    <h3>
                      {steps.save === "done"
                        ? "A little history, now yours."
                        : error || saveFailed
                          ? "Every story starts with a question."
                          : "A new story is taking shape."}
                    </h3>
                  </div>
                </div>
                <ol className="progress-list">
                  {STEPS.map((s) => (
                    <li key={s.key} data-state={steps[s.key]}>
                      <span className="dot" aria-hidden="true" />
                      <span>
                        {s.label}
                        {steps[s.key] === "active" ? (
                          <span className="hint" style={{ display: "block" }}>
                            {s.hint}
                          </span>
                        ) : null}
                      </span>
                      <span className="hint">
                        {steps[s.key] === "done"
                          ? "Done"
                          : steps[s.key] === "error"
                            ? "Stopped"
                            : steps[s.key] === "active"
                              ? (s.key === "animate" || s.key === "save") && saveProgress
                                ? `${pct}%`
                                : "…"
                              : ""}
                      </span>
                    </li>
                  ))}
                </ol>
                {saveProgress ? (
                  <div className="bar-track" aria-label="Progress">
                    <div className="bar-fill" style={{ width: `${pct}%` }} />
                  </div>
                ) : null}
                {busy ? (
                  <p className="hint">
                    This usually takes one to three minutes. You can keep this tab open while we work.
                  </p>
                ) : null}
                {saveFailed ? (
                  <div className="notice error" role="alert">
                    <strong>This video couldn’t finish.</strong> {saveFailed} The incomplete attempt has been discarded.
                    You can try creating it again.
                  </div>
                ) : null}
              </div>
            ) : (
              <StudioPreview duration={duration} aspect={aspect} prompt={prompt} />
            )}
          </div>
        </div>
      )}
    </section>
  );
}
