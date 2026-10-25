import Link from "next/link";
import { FacetText, Reveal } from "@/components/FacetText";
import { HeroScene, ModelTurntable, DeferredPlayer as Player } from "@/components/DeferredVisual";
import { SHOWCASE_SCRIPT } from "@/lib/content/showcase";
import { EXAMPLE_BIPLANE, EXAMPLE_COG_SHIP, EXAMPLE_FOOT_SOLDIER } from "@/lib/content/model-examples";
import { getViewer } from "@/lib/server/viewer";
import { TOPIC_IDEAS } from "@/lib/content/topics";
import { SITE } from "@/lib/content/site";
export default async function Home({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  const [user, { deleted }] = await Promise.all([getViewer(), searchParams]);
  const start = user ? "/studio" : "/signup";
  return (
    <>
      {deleted === "1" && !user ? (
        <div className="container" style={{ paddingTop: 24 }}>
          <div className="notice ok" role="status">
            Your account and everything in your library have been deleted. Thanks for exploring with us.
          </div>
        </div>
      ) : null}
      <section className="container hero">
        <div>
          <Reveal>
            <span className="eyebrow">Explore history</span>
          </Reveal>
          <h1 style={{ marginTop: 18 }}>
            <span className="line" style={{ fontSize: "clamp(30px, 3.4vw, 46px)", color: "var(--ink-2)" }}>
              A little curiosity.
            </span>
            <span className="sr-only">A window into history.</span>
            <span aria-hidden="true">
              <FacetText
                as="span"
                className="display line"
                text="A window into history"
                accentWords={["history"]}
                delay={0.15}
                style={{ fontSize: "clamp(40px, 4.8vw, 72px)", marginTop: 8 }}
              />
            </span>
          </h1>
          <Reveal delay={0.3}>
            <p className="lead">
              Ask about any moment in the past and get a short animated film that explains it — along with the sources
              it was built from, so you can keep exploring.
            </p>
          </Reveal>
          <Reveal delay={0.4}>
            <div className="row" style={{ gap: 14 }}>
              <Link className="btn" href={start}>
                Create a history video
              </Link>
              <Link className="btn ghost" href="#showcase">
                Watch an example
              </Link>
            </div>
            <div className="trust">
              <span>Every video lists its sources</span>
              <span>20–60 second films</span>
              <span>Saved to your library</span>
            </div>
          </Reveal>
        </div>
        <Reveal delay={0.2}>
          <div className="hero-art apollo-art">
            <HeroScene />
            <div className="caption">
              <span>
                <strong>Apollo 11</strong> · The first Moon landing
                <br />
                <small>July 1969 · Sea of Tranquility</small>
              </span>
            </div>
          </div>
        </Reveal>
      </section>

      <section id="how" className="section tint" aria-labelledby="how-title">
        <div className="container">
          <Reveal className="section-head">
            <span className="eyebrow">How it works</span>
            <h2 id="how-title" className="section-title">
              From a question to a short film
            </h2>
            <p className="lead">It usually takes a few minutes. You can watch each step happen.</p>
          </Reveal>
          <div className="steps">
            {[
              ["Ask", "Type a moment you’re curious about — a battle, an invention, a voyage or a turning point."],
              [
                "Look it up",
                "We gather facts from public sources across the web and keep a list of every source we used.",
              ],
              [
                "Build the scene",
                "People, places and machines from that era are designed from scratch as simple 3D shapes.",
              ],
              [
                "Watch & keep",
                "Your film plays right away and is saved to your library as an HD video with ambient sound you can download and share.",
              ],
            ].map(([title, body], i) => (
              <Reveal key={title} delay={i * 0.08}>
                <div className="card step" style={{ height: "100%" }}>
                  <span className="num">{i + 1}</span>
                  <h3>{title}</h3>
                  <p>{body}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section id="showcase" className="section" aria-labelledby="showcase-title">
        <div className="container split" style={{ alignItems: "start" }}>
          <Reveal>
            <Player script={SHOWCASE_SCRIPT} aspect="landscape" autoPlay loop />
          </Reveal>
          <Reveal delay={0.1} className="stack" style={{ gap: 20 }}>
            <span className="eyebrow">See an example</span>
            <h2 id="showcase-title" className="section-title">
              Kitty Hawk, 1903 in 30 seconds
            </h2>
            <p className="lead">
              This sample shows how your films can look. Press play, pause anywhere, or turn Ambience on or off.
            </p>
            <ul className="muted" style={{ margin: 0, paddingLeft: 22, display: "grid", gap: 8 }}>
              <li>The Flyer waits on the dunes at Kill Devil Hills.</li>
              <li>Wilbur, the launch rail and a camera are built for that morning.</li>
              <li>A clock counts the twelve-second flight, then the distance of the fourth.</li>
              <li>Every real video comes with the list of sources it used.</li>
            </ul>
          </Reveal>
        </div>
      </section>

      <section className="section tint" aria-labelledby="ideas">
        <div className="container split">
          <Reveal className="section-head">
            <span className="eyebrow">Get inspired</span>
            <h2 id="ideas" className="section-title">
              What would you like to learn about?
            </h2>
            <p className="lead">
              Pick a starting point or bring your own question — inventions, journeys of exploration, daily life, art
              and scientific discoveries all work.
            </p>
          </Reveal>
          <Reveal delay={0.15}>
            <div className="topics">
              {TOPIC_IDEAS.map((t) => (
                <Link
                  key={t}
                  className="chip"
                  href={`${start}?q=${encodeURIComponent(t)}`}
                  style={{ textDecoration: "none", fontSize: 16, padding: "9px 16px" }}
                >
                  {t}
                </Link>
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      <section className="section" aria-labelledby="cast-title">
        <div className="container">
          <Reveal className="section-head">
            <span className="eyebrow">A new cast every time</span>
            <h2 id="cast-title" className="section-title">
              Designed for the time and place
            </h2>
            <p className="lead">
              Each video gets its own people, buildings and vehicles, shaped to fit the era you asked about.
            </p>
          </Reveal>
          <div className="model-cards">
            {[
              {
                def: EXAMPLE_FOOT_SOLDIER,
                tint: "#246d62",
                moving: true,
                title: "A foot soldier",
                body: "Helmet, spear and shield — and a walk that swings arms and legs.",
              },
              {
                def: EXAMPLE_COG_SHIP,
                tint: "#f1e7d2",
                moving: true,
                title: "A medieval cog",
                body: "A single square sail, raised decks and a pennant in the wind.",
              },
              {
                def: EXAMPLE_BIPLANE,
                tint: "#c99a3c",
                moving: true,
                title: "An early biplane",
                body: "Two wings, wooden struts and a spinning propeller.",
              },
            ].map((m, i) => (
              <Reveal key={m.def.id} delay={i * 0.08}>
                <div className="card model-card">
                  <div className="stage">
                    <ModelTurntable def={m.def} tint={m.tint} moving={m.moving} />
                  </div>
                  <div className="meta">
                    <h3>{m.title}</h3>
                    <p className="muted" style={{ fontSize: 16 }}>
                      {m.body}
                    </p>
                  </div>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <section className="section tint" aria-labelledby="trust-title">
        <div className="container split" style={{ alignItems: "stretch" }}>
          <Reveal className="card teal stack" style={{ gap: 14 }}>
            <span className="eyebrow">Honest about what we know</span>
            <h2 id="trust-title" style={{ fontSize: 30 }}>
              Sources first, always
            </h2>
            <p className="muted">
              Each video is built from research gathered across public websites, and every source is listed next to it.
              History is full of debate, so dates and numbers can differ between sources — when something matters to
              you, follow the links and check.
            </p>
            <p className="muted">
              Each film is an AI-assisted interpretation, simplified to fit in under a minute. Think of it as a friendly
              starting point, not the final word.
            </p>
          </Reveal>
          <Reveal delay={0.1} className="card terra stack" style={{ gap: 14 }}>
            <span className="eyebrow">Made with care</span>
            <h2 style={{ fontSize: 30 }}>Respectful by design</h2>
            <p className="muted">
              We make videos about real historical events. Requests are checked before anything is made, and we decline
              ones that are hateful, graphic or unsafe. Hard chapters of history are shown with care — no gore, no
              glorifying harm.
            </p>
            <p>
              <Link href="/content-policy">Read our content &amp; safety policy →</Link>
            </p>
          </Reveal>
        </div>
      </section>

      <section className="section" aria-labelledby="cta-title">
        <div className="container" style={{ textAlign: "center", display: "grid", gap: 22, justifyItems: "center" }}>
          <Reveal>
            <h2 id="cta-title" className="section-title">
              What would you like to learn today?
            </h2>
          </Reveal>
          <Reveal delay={0.1}>
            <p className="lead" style={{ margin: "0 auto" }}>
              Create a free account and make your first video in a few minutes. Each account can make {SITE.dailyVideos}{" "}
              videos per day.
            </p>
          </Reveal>
          <Reveal delay={0.2}>
            <Link className="btn terra" href={start}>
              {user ? "Create a history video" : "Create a free account"}
            </Link>
          </Reveal>
        </div>
      </section>
    </>
  );
}
