import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/LegalPage";
import { SITE } from "@/lib/content/site";

export const metadata: Metadata = { title: "Terms of Service" };

const SECTIONS = [
  { id: "agreement", title: "1. Agreement" },
  { id: "eligibility", title: "2. Who can use Polyhistor" },
  { id: "accounts", title: "3. Your account" },
  { id: "service", title: "4. What Polyhistor does" },
  { id: "accuracy", title: "5. Accuracy and educational use" },
  { id: "acceptable-use", title: "6. Acceptable use" },
  { id: "your-content", title: "7. Your questions and videos" },
  { id: "our-content", title: "8. Our software, fonts and designs" },
  { id: "third-parties", title: "9. Third-party services and sources" },
  { id: "moderation", title: "10. Review, refusal and removal" },
  { id: "limits", title: "11. Usage limits and changes" },
  { id: "termination", title: "12. Ending your use" },
  { id: "disclaimers", title: "13. Disclaimers" },
  { id: "liability", title: "14. Limitation of liability" },
  { id: "indemnity", title: "15. Indemnity" },
  { id: "law", title: "16. Governing law and disputes" },
  { id: "copyright", title: "17. Copyright concerns" },
  { id: "changes", title: "18. Changes to these terms" },
  { id: "contact", title: "19. Contact" },
];

export default function TermsPage() {
  return (
    <LegalPage
      eyebrow="Policies"
      title="Terms of Service"
      sections={SECTIONS}
      summary={
        <div className="stack" style={{ gap: 10 }}>
          <strong>The short version</strong>
          <ul style={{ margin: 0 }}>
            <li>
              Polyhistor makes short educational animations about real historical events. Use it for learning, teaching
              and sharing.
            </li>
            <li>
              Videos are researched with AI assistance and simplified. They can contain mistakes — always check the
              listed sources for anything important.
            </li>
            <li>
              We check every request and may decline ones that break our{" "}
              <Link href="/content-policy">Content &amp; Safety Policy</Link>.
            </li>
            <li>
              We store your questions, research notes and videos so your library works and so we can keep the service
              safe.
            </li>
            <li>You can delete your account and everything in your library at any time from your account page.</li>
          </ul>
          <p className="faint" style={{ fontSize: 15 }}>
            This summary is for convenience; the full terms below are what apply.
          </p>
        </div>
      }
    >
      <h2 id="agreement">1. Agreement</h2>
      <p>
        These Terms of Service (“Terms”) are an agreement between you and {SITE.legalEntity} (“Polyhistor”, “we”, “us”)
        about your use of the Polyhistor website, applications and related services (the “Service”). By creating an
        account or using the Service you agree to these Terms, our <Link href="/privacy">Privacy Policy</Link> and our{" "}
        <Link href="/content-policy">Content &amp; Safety Policy</Link>, which form part of these Terms. If you do not
        agree, please don’t use the Service.
      </p>

      <h2 id="eligibility">2. Who can use Polyhistor</h2>
      <p>
        You must be at least 13 years old, and old enough to agree to these Terms where you live, to create an account.
        If you use the Service on behalf of a school, company or other organisation, you confirm you are authorised to
        accept these Terms for it, and “you” includes that organisation. You may not use the Service if you are barred
        from doing so under applicable law.
      </p>

      <h2 id="accounts">3. Your account</h2>
      <ul>
        <li>Give accurate information when you sign up and keep your email address current.</li>
        <li>
          Keep your password private and use one you don’t use elsewhere. You are responsible for activity under your
          account.
        </li>
        <li>
          Tell us promptly at <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a> if you think someone has
          accessed your account without permission.
        </li>
        <li>One person per account. Don’t sell, share or transfer accounts, or create accounts by automated means.</li>
      </ul>

      <h2 id="service">4. What Polyhistor does</h2>
      <p>
        When you ask about a historical event, the Service checks the request, researches the topic using AI models and
        web search provided by Google, writes a short storyboard, designs simple three-dimensional models for the
        people, places and objects involved, and animates the result in your web browser. The finished animation is
        saved to your library as an animated GIF together with a still image, your question, the research notes, the
        storyboard and the list of sources. We describe this processing in more detail in our{" "}
        <Link href="/privacy">Privacy Policy</Link>.
      </p>
      <p>
        The Service is provided free of charge at this time. We may add, change or remove features, and we may introduce
        paid plans in future; we will tell you before anything you use becomes paid.
      </p>

      <h2 id="accuracy">5. Accuracy and educational use</h2>
      <p>
        Videos are produced automatically with the help of AI and are simplified to fit into 20–60 seconds. They{" "}
        <strong>may contain errors, omissions, anachronisms or contested interpretations</strong>, and the visual models
        are stylised representations, not historically exact reconstructions. Sources can disagree, and AI systems can
        misread or misstate them.
      </p>
      <p>
        Use videos as a starting point for learning, not as authoritative references. Check the listed sources, and
        consult qualified experts or primary materials before relying on any detail for study, publication, legal,
        medical, financial or other important decisions. We do not endorse the content of third-party sources.
      </p>

      <h2 id="acceptable-use">6. Acceptable use</h2>
      <p>You agree not to use the Service to:</p>
      <ul>
        <li>
          request or create content prohibited by our <Link href="/content-policy">Content &amp; Safety Policy</Link>,
          including hateful, sexual, graphically violent or harassing content;
        </li>
        <li>glorify, deny or trivialise atrocities, or create propaganda for violent or extremist groups;</li>
        <li>
          impersonate others, harass identifiable private individuals, or request personal information about private
          people;
        </li>
        <li>
          attempt to bypass, probe or disable our safety checks, rate limits or security, including through prompt
          injection;
        </li>
        <li>
          scrape, overload or reverse-engineer the Service, or access it through automated means other than a normal web
          browser;
        </li>
        <li>break any law, or infringe anyone’s intellectual property, privacy or other rights;</li>
        <li>
          present videos as authoritative fact in a way intended to mislead, or remove indications that a video was made
          with AI assistance in order to deceive.
        </li>
      </ul>

      <h2 id="your-content">7. Your questions and videos</h2>
      <h3>Your input</h3>
      <p>
        You keep any rights you have in the questions you submit. You grant us a worldwide, non-exclusive, royalty-free
        licence to host, store, reproduce, process and display your questions and the resulting videos as needed to
        operate, secure and improve the Service and to comply with law. This licence ends when the content is deleted
        from our systems, except where we must keep it as described in our Privacy Policy.
      </p>
      <h3>Your videos</h3>
      <p>
        As between you and us, and to the extent we have rights in them, we assign to you our rights in the videos
        generated for you, and you may use, download and share them for any lawful purpose. Because videos are generated
        automatically, similar requests may produce similar results for other people, and some jurisdictions may not
        grant copyright in AI-assisted output. Please attribute “Made with Polyhistor” where practical and keep the
        source list with the video when you share it for educational purposes.
      </p>
      <h3>Responsibility</h3>
      <p>You are responsible for your questions and for how you use and share your videos.</p>

      <h2 id="our-content">8. Our software, fonts and designs</h2>
      <p>
        The Service — including its software, renderer, visual design, the Facet and Tessera typefaces, logos and
        example materials — is owned by us or our licensors and protected by intellectual-property laws. Except for your
        own videos as described above, you may not copy, modify, distribute or create derivative works from the Service
        or its typefaces without our written permission. Feedback you send us may be used without obligation to you.
      </p>

      <h2 id="third-parties">9. Third-party services and sources</h2>
      <p>
        The Service relies on third-party providers, including Google (AI models and search grounding), TigerData
        (database hosting) and our web hosting provider. Videos link to third-party websites that we do not control and
        are not responsible for. Your use of third-party sites is governed by their own terms and policies.
      </p>

      <h2 id="moderation">10. Review, refusal and removal</h2>
      <p>
        We automatically screen every request before research begins and screen the generated storyboard before it is
        saved. We may decline any request, stop a video from being made or saved, remove content, or limit or suspend
        accounts if we reasonably believe that content or conduct breaks these Terms, creates risk for others, or is
        required by law. We keep records of requests, decisions and videos as described in our Privacy Policy so that we
        can investigate abuse and improve safety. Automated systems are not perfect; if you think we made a mistake,
        contact us.
      </p>

      <h2 id="limits">11. Usage limits and changes</h2>
      <p>
        To keep the Service available to everyone we apply limits, which currently include a daily number of new videos
        per account, a maximum library size and storage limits for saved files. We may change limits at any time. We may
        also change, suspend or discontinue the Service or any part of it; where reasonable we will give notice and an
        opportunity to download your videos.
      </p>

      <h2 id="termination">12. Ending your use</h2>
      <p>
        You may stop using the Service and delete your account at any time from your{" "}
        <Link href="/account">account page</Link>. We may suspend or end your access if you materially or repeatedly
        break these Terms, if required by law, or if we discontinue the Service. Sections 5, 7 (licences needed to
        complete deletion), 8, and 13–16 survive termination.
      </p>

      <h2 id="disclaimers">13. Disclaimers</h2>
      <p>
        THE SERVICE AND ALL CONTENT ARE PROVIDED “AS IS” AND “AS AVAILABLE”. TO THE FULLEST EXTENT PERMITTED BY LAW, WE
        DISCLAIM ALL WARRANTIES, EXPRESS OR IMPLIED, INCLUDING WARRANTIES OF ACCURACY, MERCHANTABILITY, FITNESS FOR A
        PARTICULAR PURPOSE, TITLE AND NON-INFRINGEMENT, AND ANY WARRANTY THAT THE SERVICE WILL BE UNINTERRUPTED, SECURE
        OR ERROR-FREE OR THAT VIDEOS WILL BE HISTORICALLY ACCURATE OR COMPLETE. Some jurisdictions do not allow certain
        disclaimers, so some of these may not apply to you.
      </p>

      <h2 id="liability">14. Limitation of liability</h2>
      <p>
        TO THE FULLEST EXTENT PERMITTED BY LAW, WE WILL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL,
        CONSEQUENTIAL OR PUNITIVE DAMAGES, OR FOR ANY LOSS OF DATA, PROFITS, REVENUE OR GOODWILL, ARISING FROM OR
        RELATED TO THE SERVICE. OUR TOTAL LIABILITY FOR ALL CLAIMS RELATING TO THE SERVICE IS LIMITED TO THE GREATER OF
        THE AMOUNT YOU PAID US IN THE TWELVE MONTHS BEFORE THE CLAIM OR US $50. Nothing in these Terms limits liability
        that cannot be limited by law, including for fraud or for death or personal injury caused by negligence.
      </p>

      <h2 id="indemnity">15. Indemnity</h2>
      <p>
        To the extent permitted by law, you agree to indemnify us against third-party claims, losses and reasonable
        costs arising from your misuse of the Service or your breach of these Terms. This does not apply to consumers
        where prohibited by law.
      </p>

      <h2 id="law">16. Governing law and disputes</h2>
      <p>
        These Terms are governed by the laws of {SITE.jurisdiction}, without regard to conflict-of-law rules. Courts
        located in New York shall have exclusive jurisdiction, except that if you are a consumer living elsewhere you
        may also have the right to bring claims in your local courts and to benefit from mandatory consumer protections
        where you live. Before filing a claim, please contact us so we can try to resolve the issue informally.
      </p>

      <h2 id="copyright">17. Copyright concerns</h2>
      <p>
        If you believe content on the Service infringes your copyright, email{" "}
        <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a> with: your contact details; a description of the
        work; the location of the material on the Service; a statement that you have a good-faith belief the use is not
        authorised; a statement, under penalty of perjury, that your notice is accurate and that you are authorised to
        act; and your physical or electronic signature. We may remove material and terminate repeat infringers.
      </p>

      <h2 id="changes">18. Changes to these terms</h2>
      <p>
        We may update these Terms. If a change is material we will notify you in the Service or by email before it takes
        effect, and we record which version you accepted. Continuing to use the Service after changes take effect means
        you accept them; if you don’t, please stop using the Service and delete your account.
      </p>

      <h2 id="contact">19. Contact</h2>
      <p>
        Questions about these Terms: <a href={`mailto:${SITE.contactEmail}`}>{SITE.contactEmail}</a>.
      </p>
    </LegalPage>
  );
}
