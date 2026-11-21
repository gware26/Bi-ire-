# LissanNote accessibility audit (WCAG 2.2 AA)

Date: 2026-11-21 · Target: WCAG 2.2 AA (AAA where cheap) · Method: axe-core automated scan
(`wcag2a`, `wcag2aa`, `wcag21a/aa`, `wcag22aa`, `best-practice`) plus manual code and keyboard review.

## Result

| Screen | axe violations before | after |
|---|---|---|
| Home | 1 (no level-one heading) | 0 |
| Notes (transcript expanded) | 0 | 0 |
| Quiz | not scanned | 0 |
| Recording | needs a real microphone, manual review only | — |

No horizontal scrolling at a 320px viewport (WCAG 1.4.10).

## Findings fixed

| # | Issue | WCAG | Severity | Fix |
|---|---|---|---|---|
| 1 | Quiz gave a fixed 8 seconds to answer; too short for some students with motor or speech impairments | 2.2.1 Timing Adjustable (A) | Critical | Answer time is selectable on Home: 8, 15 (default) or 30 seconds, plus a "Done answering" control |
| 2 | Single-key shortcuts (Space, B, Q, N, H) could not be turned off; speech-input software (e.g. Dragon) can trigger them by accident | 2.1.4 Character Key Shortcuts (A) | Major | On/off setting on Home; shortcuts also ignore Ctrl/Alt/Meta combinations |
| 3 | Space/Enter on a focused button ran the screen shortcut instead of the focused button | 2.1.1 Keyboard (A) | Major | Shortcuts skip Space/Enter when focus is on any interactive element |
| 4 | Recording timer sat inside a live region, so screen readers announced it every 0.5s | 4.1.3 Status Messages (AA) | Major | Only the status text is live; elapsed time has a hidden label |
| 5 | Bookmark, recording start, "notes ready" and heard voice commands were not announced | 4.1.3 Status Messages (AA) | Major | One persistent `role="status"` announcer (`src/lib/announce.ts`) |
| 6 | Source links (#3) pointed into a collapsed transcript and did nothing | 2.4.3 Focus Order (A) | Major | Link expands the transcript, scrolls to the line and moves focus to it |
| 7 | Amharic and Afaan Oromo content not marked with its language | 3.1.2 Language of Parts (AA) | Major | `lang` on notes content, quiz text, language buttons and single-language transcript lines |
| 8 | Home had no `<h1>`; Recording, Quiz, Processing and Error used styled text instead of headings | 1.3.1 Info and Relationships (A) | Moderate | One `<h1>` per screen |
| 9 | Page title never changed between screens | 2.4.2 Page Titled (A) | Moderate | Title per screen, e.g. "Quiz · LissanNote" |
| 10 | No skip link | 2.4.1 Bypass Blocks (A) | Minor | "Skip to main content" as the first focusable element; focus moves to the new screen on navigation |
| 11 | Selected language / setting shown by colour only | 1.4.1 Use of Color (A) | Minor | Check icon plus `aria-pressed` |
| 12 | Language buttons and the Start button overflowed at 320px | 1.4.10 Reflow (AA) | Minor | Responsive sizes; `min-w-0` on fieldsets and inputs |
| 13 | Button hint text used 90% opacity, dropping white-on-red below 4.5:1 | 1.4.3 Contrast (AA) | Minor | Full-opacity hint text |
| 14 | Source chips about 22px tall | 2.5.8 Target Size (AA) | Minor | At least 28×28px |

## Already in place

- Every text colour pair is at least 4.5:1 in light and dark themes (tokens in `src/index.css`).
- Visible 4px focus outline on every control; nothing removes focus styles.
- Native `<button>`, `<a>`, `<label>`, `<fieldset>`/`<legend>`; no ARIA widgets that need custom keyboard handling.
- Decorative icons are `aria-hidden`; every control has a visible text name.
- `prefers-reduced-motion` disables pulse, spin and smooth scrolling.
- Audio cue plus spoken confirmation for every action, so a student never has to look at the screen.

## Still to do (needs people, not code)

1. Screen-reader pass with NVDA on Windows (free) through the whole flow: start, bookmark, end, notes, quiz.
2. Test with at least one student with an upper-limb impairment; record time to start a session (requirement NFR5: under one minute).
3. Microphone-dependent screens (Recording, Quiz listening) re-scanned with `await window.a11y()` in the dev console.
4. Zoom to 200% and 400% in Chrome and confirm nothing is cut off.

Run the automated scan on any screen: start the dev server, open the console, `await window.a11y()`.
