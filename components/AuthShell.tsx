import { ModelTurntable } from "@/components/three/ModelTurntable";
import { EXAMPLE_STONE_KEEP } from "@/lib/content/model-examples";

export function AuthShell({ children, quote }: { children: React.ReactNode; quote: React.ReactNode }) {
  return (
    <div className="auth-wrap">
      <div className="auth-art" aria-hidden="true">
        <div style={{ position: "absolute", inset: 0 }}>
          <ModelTurntable def={EXAMPLE_STONE_KEEP} tint="#246d62" />
        </div>
        <div className="quote">{quote}</div>
      </div>
      <div className="auth-form">{children}</div>
    </div>
  );
}
