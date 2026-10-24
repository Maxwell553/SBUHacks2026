# Design system

Polyhistor should feel like a welcoming, curious place to learn history for a general audience. It's friendly without being childish. The visual identity is low-poly: faceted shapes, original typefaces and animated 3D scenes.

## Principles

- **Curiosity first.** Copy invites exploration ("What would you like to learn about?", "Create a history video", "Your video library").
- **Honest about knowledge.** Sources, dates, context and uncertainty are easy to find. Videos are described as AI-assisted interpretations, never as definitive fact.
- **Plain language.** Provider names, JSON, geometry budgets and other implementation details stay out of the main user flows. Legal pages name providers where the law requires it.
- **Respectful.** Hard chapters of history are shown with care. Errors are explained plainly, suggest a next step, and never blame the learner.
- **Not a children's product.** Don't imply the service is aimed at children, and don't change age or privacy terms without checking the actual requirements.

## Colour

Tokens live in `app/globals.css` (`:root`).

| Token                      | Value                 | Use                                          |
| -------------------------- | --------------------- | -------------------------------------------- |
| `--paper`                  | `#fbf7ef`             | Page background (warm ivory)                 |
| `--paper-2` / `--paper-3`  | `#f3ecdf` / `#ebe2d1` | Tinted sections, tracks                      |
| `--card`                   | `#fffdf8`             | Cards and inputs                             |
| `--ink`                    | `#253b38`             | Body text (dark green-charcoal)              |
| `--ink-2` / `--ink-3`      | `#3f5652` / `#5f716d` | Secondary and tertiary text                  |
| `--teal` / `--teal-deep`   | `#246d62` / `#1b564d` | Primary actions, focus, progress             |
| `--terra` / `--terra-deep` | `#a64f35` / `#8a3f2a` | Accents, eyebrows, secondary calls to action |
| `--sage`, `--gold`         | `#dfe8dc`, `#c99a3c`  | Illustration tints                           |
| `--danger`, `--ok`         | `#b4423a`, `#3e8a5c`  | Status                                       |

Light decorative colours must never be used for body text. Keep WCAG AA contrast for all text.

## Typography

All three typefaces are original. They're generated from hand-designed glyph skeletons by `scripts/build-fonts.mjs` and served from `public/fonts/`. No third-party web fonts are used.

| Face             | Weight    | Use                                                                                                |
| ---------------- | --------- | -------------------------------------------------------------------------------------------------- |
| **Facet**        | 900       | Short expressive headings and the wordmark only. All caps and chamfered. Use the `.display` class. |
| **Tessera**      | 400 / 700 | All reading text, headings longer than a few words, buttons and labels.                            |
| **Tessera Mono** | 400       | Eyebrows, dates and small data labels.                                                             |

Never set paragraphs in all caps. To change a glyph, edit its skeleton in `scripts/build-fonts.mjs`, run `npm run assets:fonts`, and commit the regenerated `public/fonts/*.otf` and `lib/typography/*.json`. The video overlay, the canvas renderer and the 3D lettering all read the same files.

## Components

| Pattern           | Class                                                           | Notes                                                               |
| ----------------- | --------------------------------------------------------------- | ------------------------------------------------------------------- |
| Buttons           | `.btn`, `.btn.terra`, `.btn.ghost`, `.btn.danger`, `.btn.small` | Pill-shaped, soft shadow, at least 44 px tall                       |
| Cards             | `.card`, `.card.soft`, `.card.teal`, `.card.terra`              | 18 px radius, generous padding                                      |
| Notices           | `.notice.info`, `.notice.ok`, `.notice.error`                   | Use `role="alert"` for errors and `role="status"` for confirmations |
| Chips             | `.chip`, `.chip.teal`, `.chip.terra`, `.chip.ok`, `.chip.bad`   | Status labels and topic suggestions                                 |
| Eyebrow           | `.eyebrow`                                                      | Mono, terracotta, with a small triangle marker                      |
| Segmented control | `.seg` with `aria-pressed` buttons                              |                                                                     |
| Disclosure        | `details.disclosure`                                            | Research notes, "the cast made for this video"                      |

Forms always have visible labels, hint text where it helps, and a visible focus ring (`:focus-visible`, teal).

## Motion

- Use motion.dev (`motion/react`) for gentle, purposeful reveals: `FacetText` for display headings and `Reveal` for blocks.
- 3D scenes (`components/three/`) pause when off-screen.
- **Reduced motion is honoured everywhere.** CSS shortens animations. `FacetText` and `Reveal` render statically. The React Three Fiber scenes switch to a single static pose (`frameloop="demand"`). The video player doesn't autoplay.

## Video overlay

The in-video overlay (`lib/lowpoly/overlay.ts`) shares the site's palette. It uses ivory rounded cards with dark text, so captions stay legible over any scene, plus a teal progress rail, terracotta kickers and a soft faceted transition in paper tones. Player controls sit below the canvas, never on top of the footage.
