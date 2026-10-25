import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/LegalPage";
import { SITE } from "@/lib/content/site";

export const metadata: Metadata = { title: "Content & Safety Policy" };

const SECTIONS = [
  { id: "purpose", title: "Our purpose" },
  { id: "welcome", title: "What’s welcome" },
  { id: "hard-history", title: "Difficult history" },
  { id: "not-allowed", title: "What we don’t make" },
  { id: "how", title: "How requests are checked" },
  { id: "accuracy", title: "Accuracy and sources" },
  { id: "appeals", title: "Mistakes and reports" },
];

export default function ContentPolicyPage() {
  return (
    <LegalPage
      eyebrow="Policies"
      title="Content & Safety Policy"
      sections={SECTIONS}
      summary={
        <p>
          PolyChronicle makes respectful, educational videos about real moments in history. We check every request and
          every storyboard, and we decline requests that are hateful, sexual, graphic, harassing, dangerous or not about
          history.
        </p>
      }
    >
      <h2 id="purpose">Our purpose</h2>
      <p>
        We want curious people to understand the past — its achievements, its turning points and its hard lessons. This
        policy explains what we will and won’t make, and is part of our <Link href="/terms">Terms of Service</Link>.
      </p>

      <h2 id="welcome">What’s welcome</h2>
      <ul>
        <li>
          Events, discoveries, inventions, journeys, buildings, movements and turning points from any era and any part
          of the world.
        </li>
        <li>How things worked: machines, cities, trade routes, scientific breakthroughs.</li>
        <li>Questions that compare perspectives or explain causes and consequences.</li>
      </ul>

      <h2 id="hard-history">Difficult history</h2>
      <p>
        War, conquest, slavery, genocide, disasters and injustice are part of history and can be explained. We show them
        with care: through maps, movements, buildings and consequences, and with factual captions — never with gore,
        graphic injury, or a celebratory tone toward harm. Victims are treated with dignity.
      </p>

      <h2 id="not-allowed">What we don’t make</h2>
      <ul>
        <li>
          Hate: content that attacks or demeans people based on protected characteristics, uses slurs, or promotes
          hateful ideologies or symbols.
        </li>
        <li>
          Glorifying violence or atrocities, denying or trivialising well-documented atrocities, or propaganda and
          recruitment for extremist groups.
        </li>
        <li>Sexual content or nudity.</li>
        <li>Graphic violence, gore, torture or cruelty shown for its own sake.</li>
        <li>
          Harassment, bullying or content about identifiable private individuals; requests for personal information.
        </li>
        <li>Instructions for weapons, explosives, or other dangerous or illegal activities.</li>
        <li>Self-harm encouragement.</li>
        <li>
          Requests that aren’t about history, or that try to make the system ignore its rules or reveal internal
          instructions.
        </li>
        <li>Deceptive content designed to pass off invented events as real or to impersonate real people.</li>
      </ul>

      <h2 id="how">How requests are checked</h2>
      <ol>
        <li>
          <strong>Before anything is made,</strong> your question is screened by an automated safety check that looks
          for the categories above.
        </li>
        <li>
          <strong>During research and writing,</strong> the AI services we use apply their own safety filters.
        </li>
        <li>
          <strong>Before saving,</strong> the finished storyboard, captions and model names are screened again.
        </li>
        <li>
          <strong>All requests are recorded</strong> with their outcome, so we can investigate abuse and improve these
          checks.
        </li>
      </ol>
      <p>
        If a request is declined you’ll see a short explanation. Repeated attempts to get around these checks may lead
        to limits on, or removal of, your account.
      </p>

      <h2 id="accuracy">Accuracy and sources</h2>
      <p>
        Every video lists the sources its research found. Videos are simplified and can be wrong, and sources can
        disagree — we encourage you to read further, especially for contested or sensitive topics.
      </p>

      <h2 id="appeals">Mistakes and reports</h2>
      <p>
        Automated checks sometimes get it wrong — in either direction. If a reasonable request was declined, or you see
        a video that you think breaks this policy, email <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a>{" "}
        with the video title or your question and we’ll take a look.
      </p>
    </LegalPage>
  );
}
