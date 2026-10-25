import { LandmarkReel } from "@/components/LandmarkReel";
import type { Aspect } from "@/lib/schema/video";

/** A lightweight, responsive storyboard preview; no renderer needed before creation. */
export function StudioPreview({ duration, aspect, prompt }: { duration: number; aspect: Aspect; prompt: string }) {
  return (
    <section className="studio-preview" aria-label="Your film plan">
      <div className="spread preview-topline">
        <span className="mono">YOUR NEXT CHRONICLE</span>
        <span className="preview-live">
          {duration}s · {aspect === "portrait" ? "9:16" : "16:9"}
        </span>
      </div>
      <LandmarkReel />
      <div className="preview-copy">
        <span className="eyebrow">{prompt.trim() ? "Your starting point" : "The past, in motion"}</span>
        <h2>{prompt.trim() || "A moment worth exploring."}</h2>
        <p>
          {prompt.trim()
            ? "We’ll research your question and turn it into a short, illustrated history film."
            : "From your first question to the final scene, a new way to see history."}
        </p>
      </div>
      <div
        className="preview-filmstrip"
        aria-label={`A ${duration}-second film in ${aspect === "portrait" ? "vertical" : "widescreen"} format`}
      >
        <div>
          <span>01</span>
          <strong>The spark</strong>
        </div>
        <div>
          <span>02</span>
          <strong>The story</strong>
        </div>
        <div>
          <span>03</span>
          <strong>What changed</strong>
        </div>
      </div>
      <div className="preview-bottom">
        <span>Researched sources · Animated scenes</span>
        <span>Your finished film appears here.</span>
      </div>
    </section>
  );
}
