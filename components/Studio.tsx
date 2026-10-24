"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { ApiError, videos, type Video } from "@/lib/client/api";
import { saveRender, type SaveProgress } from "@/lib/client/save";
import type { Aspect } from "@/lib/schema/video";
import { TOPIC_IDEAS } from "@/lib/content/topics";
import { Player } from "@/components/Player";
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
  const [aspect, setAspect] = useState<Aspect>("landscape");
  const [busy, setBusy] = useState(false);
  const [steps, setSteps] = useState(fresh);
  const [video, setVideo] = useState<Video | null>(null);
  const [error, setError] = useState<{ title: string; message: string; kind: "declined" | "limit" | "error" } | null>(
    null,
  );
  const [saveProgress, setSaveProgress] = useState<SaveProgress | null>(null);
  const [saveFailed, setSaveFailed] = useState<string | null>(null);
  const [elapsed, setElapsed] = useState(0);
  const abortRef = useRef<AbortController | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(
    () => () => {
      abortRef.current?.abort();
      if (pollRef.current) clearInterval(pollRef.current);
    },
    [],
  );

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
      setVideo(saved);
    } catch (e) {
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

    pollRef.current = setInterval(async () => {
      try {
        const { videos: list } = await videos.list();
        const mine = list.find((v) => v.prompt === q && new Date(v.createdAt).getTime() >= startedAt - 15_000);
        if (!mine) return;
        if (mine.status === "researching") setSteps((s) => ({ ...s, check: "done", research: "active" }));
        if (mine.status === "scripting") setSteps((s) => ({ ...s, check: "done", research: "done", build: "active" }));
      } catch {
        /* polling is best-effort */
      }
    }, 2500);

    try {
      const { video: v } = await videos.create(q, duration, aspect);
      if (pollRef.current) clearInterval(pollRef.current);
      setSteps((s) => ({ ...s, check: "done", research: "done", build: "done" }));
      setVideo(v);
      setBusy(false);
      router.refresh();
      await runSave(v);
    } catch (err) {
      if (pollRef.current) clearInterval(pollRef.current);
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

  const working = busy || !!saveProgress;
  const started = Object.values(steps).some((s) => s !== "idle");
  const pct = saveProgress ? Math.round(saveProgress.fraction * 100) : 0;

  return (
    <div className="studio">
      <form className="card stack" style={{ gap: 22 }} onSubmit={submit} aria-describedby="studio-help">
        <div className="stack" style={{ gap: 8 }}>
          <span className="eyebrow">Create</span>
          <h1 style={{ fontSize: 34 }}>What would you like to learn about?</h1>
          <p className="muted" id="studio-help" style={{ fontSize: 16.5 }}>
            Name a moment in history — an event, a discovery, a journey. Specific is best.
          </p>
        </div>
        <div className="field">
          <label htmlFor="prompt">Your question</label>
          <textarea
            id="prompt"
            className="input"
            rows={4}
            maxLength={2000}
            placeholder="e.g. How did Gutenberg’s printing press work?"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            disabled={working}
            required
          />
        </div>
        <div className="stack" style={{ gap: 10 }}>
          <span className="label">Need an idea?</span>
          <div className="topics">
            {TOPIC_IDEAS.slice(0, 6).map((t) => (
              <button type="button" key={t} className="chip" onClick={() => setPrompt(t)} disabled={working}>
                {t}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label htmlFor="duration">
            Length: <span style={{ color: "var(--teal-deep)" }}>{duration} seconds</span>
          </label>
          <input
            id="duration"
            className="duration"
            type="range"
            min={20}
            max={60}
            step={5}
            value={duration}
            onChange={(e) => setDuration(Number(e.target.value))}
            disabled={working}
          />
          <span className="hint">Shorter videos are quicker to make; longer ones cover more detail.</span>
        </div>
        <div className="field">
          <span className="label" id="format-label">
            Format
          </span>
          <div className="seg" role="group" aria-labelledby="format-label">
            <button
              type="button"
              aria-pressed={aspect === "landscape"}
              onClick={() => setAspect("landscape")}
              disabled={working}
            >
              Widescreen
            </button>
            <button
              type="button"
              aria-pressed={aspect === "portrait"}
              onClick={() => setAspect("portrait")}
              disabled={working}
            >
              Vertical (phones)
            </button>
          </div>
        </div>
        <button className="btn terra" type="submit" disabled={working} style={{ width: "100%" }}>
          {busy ? "Working on it…" : saveProgress ? "Bringing history to life…" : "Create a history video"}
        </button>
        <p className="hint">
          Requests are checked to keep things respectful and historical. See our{" "}
          <Link href="/content-policy">content policy</Link>.
        </p>
      </form>

      <div className="stack" style={{ gap: 22 }}>
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
          <div className="card stack" style={{ gap: 16 }} aria-live="polite">
            <div className="spread">
              <h2 style={{ fontSize: 22 }}>{steps.save === "done" ? "Your video is ready" : "Making your video"}</h2>
              {busy ? (
                <span className="chip teal">
                  {Math.floor(elapsed / 60)}:{String(elapsed % 60).padStart(2, "0")}
                </span>
              ) : null}
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
              <p className="hint">This usually takes one to three minutes. You can keep this tab open while we work.</p>
            ) : null}
            {saveFailed && video ? (
              <div className="notice error" role="alert">
                <strong>Your video was made, but saving it didn’t finish.</strong> {saveFailed}
                <div className="row" style={{ marginTop: 10 }}>
                  <button className="btn small" type="button" onClick={() => runSave(video)}>
                    Try saving again
                  </button>
                </div>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="card soft stack" style={{ gap: 14, minHeight: 280, justifyContent: "center" }}>
            <h2 style={{ fontSize: 24 }}>Your video will appear here</h2>
            <p className="muted">
              You’ll see each step as it happens. When it’s done, you can watch it, read the sources it was built from
              and download it as a GIF.
            </p>
          </div>
        )}

        {video?.script ? (
          <motion.div
            initial={reduce ? false : { opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
            className="stack"
            style={{ gap: 22 }}
          >
            <div className="stack" style={{ gap: 6 }}>
              <span className="eyebrow">
                {video.script.dateLabel} · {video.script.location}
              </span>
              <h2 style={{ fontSize: 30 }}>{video.script.title}</h2>
            </div>
            <Player
              script={video.script}
              aspect={video.aspect === "portrait" ? "portrait" : "landscape"}
              autoPlay
              loop
            />
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
            <VideoDetails video={video} />
          </motion.div>
        ) : null}
      </div>
    </div>
  );
}
