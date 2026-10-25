import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/LegalPage";
import { SITE } from "@/lib/content/site";

export const metadata: Metadata = { title: "Privacy Policy" };

const SECTIONS = [
  { id: "who", title: "1. Who we are" },
  { id: "collect", title: "2. What we collect" },
  { id: "use", title: "3. How we use it" },
  { id: "ai", title: "4. AI research and your questions" },
  { id: "bases", title: "5. Legal bases" },
  { id: "sharing", title: "6. Who we share it with" },
  { id: "cookies", title: "7. Cookies" },
  { id: "retention", title: "8. How long we keep it" },
  { id: "security", title: "9. Security" },
  { id: "rights", title: "10. Your choices and rights" },
  { id: "transfers", title: "11. International transfers" },
  { id: "age", title: "12. Age requirement" },
  { id: "changes", title: "13. Changes" },
  { id: "contact", title: "14. Contact" },
];

export default function PrivacyPage() {
  return (
    <LegalPage
      eyebrow="Policies"
      title="Privacy Policy"
      sections={SECTIONS}
      summary={
        <div className="stack" style={{ gap: 10 }}>
          <strong>The short version</strong>
          <ul style={{ margin: 0 }}>
            <li>
              We collect what we need to run your account and library: your name, email, a protected form of your
              password, your questions and your videos.
            </li>
            <li>
              Your questions and our research text are processed by Google’s AI services to research and plan each
              video. Your password never is.
            </li>
            <li>
              Everything in your library is stored in our database until you delete it. Deleting your account removes
              it.
            </li>
            <li>We use one essential sign-in cookie. No advertising or tracking cookies.</li>
            <li>We don’t sell your personal information or use it for advertising.</li>
          </ul>
        </div>
      }
    >
      <h2 id="who">1. Who we are</h2>
      <p>
        This policy explains how {SITE.legalEntity} (“PolyChronicle”, “we”, “us”) handles personal information when you
        use the PolyChronicle website and services (the “Service”). We are the controller of the personal information
        described here. Contact details are at the end of this policy.
      </p>

      <h2 id="collect">2. What we collect</h2>
      <table>
        <thead>
          <tr>
            <th>Information</th>
            <th>Details</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Account details</td>
            <td>Your name, email address, the date you joined, and the version and time you accepted our Terms.</td>
          </tr>
          <tr>
            <td>Password</td>
            <td>Stored only as a salted, one-way scrypt hash. We cannot see or recover your password.</td>
          </tr>
          <tr>
            <td>Sign-in sessions</td>
            <td>
              A random session token kept in a secure cookie on your device; we store only a one-way hash of it and its
              expiry date.
            </td>
          </tr>
          <tr>
            <td>Your questions</td>
            <td>The text you type when you ask for a video, the length and format you choose, and when you asked.</td>
          </tr>
          <tr>
            <td>Research and storyboards</td>
            <td>
              The research notes, the list of source links, the storyboard and the 3D model designs created for your
              video.
            </td>
          </tr>
          <tr>
            <td>Safety-check records</td>
            <td>
              For each check of your question and of the finished storyboard: whether it was allowed or declined, a
              short reason, which check made the decision, and a one-way fingerprint and length of the checked text (not
              the text itself).
            </td>
          </tr>
          <tr>
            <td>Saved videos</td>
            <td>
              The animated video (or legacy GIF) and still image created in your browser and uploaded to your library,
              and the recorded narration of its captions, with their size and a checksum.
            </td>
          </tr>
          <tr>
            <td>Abuse-prevention counters</td>
            <td>
              Short-lived usage counters linked to your account ID or to a one-way hash of your IP address, used to
              enforce limits such as sign-in attempts and daily video counts. They reset automatically.
            </td>
          </tr>
          <tr>
            <td>Technical data</td>
            <td>
              Our hosting provider processes standard request information (such as IP address, browser type and time of
              request) to deliver the site and protect it from attacks.
            </td>
          </tr>
        </tbody>
      </table>
      <p>
        We don’t ask for sensitive information, and we ask that you don’t include personal details about yourself or
        others in your questions. Videos are animated on your own device; we do not access your camera, microphone or
        files. A video’s narration is a synthetic voice reading its captions, never a recording of you.
      </p>

      <h2 id="use">3. How we use it</h2>
      <ul>
        <li>
          <strong>To provide the Service:</strong> create your account, sign you in, research and make your videos, and
          keep your library.
        </li>
        <li>
          <strong>To keep things safe:</strong> screen requests and storyboards against our{" "}
          <Link href="/content-policy">Content &amp; Safety Policy</Link>, enforce limits, investigate abuse and protect
          the Service.
        </li>
        <li>
          <strong>To improve the Service:</strong> diagnose errors and understand, in aggregate, how features perform.
        </li>
        <li>
          <strong>To communicate:</strong> respond to your messages and send important notices about your account or
          these policies.
        </li>
        <li>
          <strong>To meet legal obligations:</strong> and to establish or defend legal claims.
        </li>
      </ul>
      <p>
        We do not sell personal information, share it for cross-context behavioural advertising, or use it to make
        decisions that have legal or similarly significant effects on you.
      </p>

      <h2 id="ai">4. AI research and your questions</h2>
      <p>
        To make a video, we send your question — and, at later steps, the research text, the storyboard, draft frames of
        the film rendered in your browser for a quality review, and the finished captions to be read aloud as narration
        — to Google’s Gemini models on Google Cloud (Vertex AI), including Google Search grounding to find public
        sources. Google processes this content to return results to us under its cloud terms. We do not send your name,
        email or password. Please don’t put personal information in your questions.
      </p>
      <p>
        We use the results to write captions and design the scenes, and we keep the list of sources with your video so
        you can check them. AI output can be inaccurate; see the accuracy section of our{" "}
        <Link href="/terms#accuracy">Terms</Link>.
      </p>

      <h2 id="bases">5. Legal bases (where applicable, e.g. EEA/UK)</h2>
      <ul>
        <li>
          <strong>Contract:</strong> to provide the account and videos you ask for.
        </li>
        <li>
          <strong>Legitimate interests:</strong> to keep the Service safe and secure, prevent abuse and improve
          features, balanced against your rights.
        </li>
        <li>
          <strong>Legal obligation:</strong> where we must keep or disclose information by law.
        </li>
        <li>
          <strong>Consent:</strong> where we ask for it; you can withdraw consent at any time.
        </li>
      </ul>

      <h2 id="sharing">6. Who we share it with</h2>
      <p>
        We share personal information only with service providers who help us run PolyChronicle, under contracts that
        limit their use of it:
      </p>
      <table>
        <thead>
          <tr>
            <th>Provider</th>
            <th>Purpose</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>Google Cloud (Vertex AI, Gemini, Google Search grounding)</td>
            <td>Safety screening, research, storyboard and model design, and narration.</td>
          </tr>
          <tr>
            <td>TigerData (managed PostgreSQL)</td>
            <td>
              Stores accounts, session hashes, questions, research, storyboards, models, saved videos and usage
              counters.
            </td>
          </tr>
          <tr>
            <td>Our web hosting provider (e.g. Vercel)</td>
            <td>Serves the website and application code and processes request logs.</td>
          </tr>
        </tbody>
      </table>
      <p>
        We may also disclose information if required by law, to protect the rights, safety and property of our users or
        others, or as part of a merger or acquisition (with notice to you). We never share your videos publicly; your
        library is private to your account unless you download and share a video yourself.
      </p>

      <p>
        Your library contains completed videos only. Failed or declined attempts are discarded. If you leave before a
        video finishes, we attempt to discard it immediately; abandoned temporary records are also removed on your next
        library visit once they are over 30 minutes old. Safety-check fingerprints remain until account deletion.
      </p>

      <h2 id="cookies">7. Cookies</h2>
      <p>
        We use a single essential cookie, <code>polychronicle_session</code>, to keep you signed in. It is HTTP-only,
        sent only over secure connections in production, restricted to our site, and expires after 30 days or when you
        sign out. We don’t use advertising, analytics or third-party tracking cookies, so there is nothing to opt out
        of.
      </p>

      <h2 id="retention">8. How long we keep it</h2>
      <ul>
        <li>
          <strong>Account details and library:</strong> until you delete the video or your account.
        </li>
        <li>
          <strong>Safety-check records:</strong> kept while your account exists so we can investigate misuse, and
          deleted together with your account.
        </li>
        <li>
          <strong>Unfinished uploads:</strong> removed automatically after about 24 hours.
        </li>
        <li>
          <strong>Sessions:</strong> until they expire (30 days) or you sign out.
        </li>
        <li>
          <strong>Usage counters:</strong> overwritten when their time window resets.
        </li>
        <li>
          <strong>Backups:</strong> our database provider keeps encrypted operational backups for a limited period;
          deleted data can persist in backups until they roll over.
        </li>
      </ul>
      <p>
        We may keep limited information longer where the law requires it or to resolve disputes and enforce our
        policies.
      </p>

      <h2 id="security">9. Security</h2>
      <p>
        We protect your information with salted password hashing, hashed session tokens, secure HTTP-only cookies,
        same-origin checks on account actions, encrypted connections to our database with certificate verification,
        private-by-default storage of videos, and rate limits. No system is perfectly secure; please use a unique
        password and tell us if you notice anything unusual.
      </p>

      <h2 id="rights">10. Your choices and rights</h2>
      <ul>
        <li>
          <strong>Access and copies:</strong> your library shows your questions, sources and videos, and you can
          download each saved video.
        </li>
        <li>
          <strong>Delete:</strong> delete individual videos from your library, or delete your whole account from your{" "}
          <Link href="/account">account page</Link>. This removes your account, sessions, videos, saved files,
          questions, research and safety-check records from our live database.
        </li>
        <li>
          <strong>Correct:</strong> contact us to correct your account details.
        </li>
        <li>
          <strong>Other requests:</strong> depending on where you live (for example under the GDPR, UK GDPR or
          California law), you may have rights to access, portability, restriction, objection, and to not be
          discriminated against for exercising your rights. Email us and we will respond within the time required by
          law. You may also complain to your local data-protection authority.
        </li>
      </ul>

      <h2 id="transfers">11. International transfers</h2>
      <p>
        Our providers may process information in the United States and other countries. Where required, we rely on
        appropriate safeguards such as standard contractual clauses offered by our providers.
      </p>

      <h2 id="age">12. Age requirement</h2>
      <p>
        You need to be at least 13 (or older where local law requires) to create an account. If you believe someone
        under that age has created an account, contact us and we will delete it.
      </p>

      <h2 id="changes">13. Changes</h2>
      <p>
        We will update this policy as the Service changes. If changes are material, we will tell you in the Service or
        by email before they take effect. The effective date at the top shows the latest version.
      </p>

      <h2 id="contact">14. Contact</h2>
      <p>
        Privacy questions or requests: <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a>.
      </p>
    </LegalPage>
  );
}
