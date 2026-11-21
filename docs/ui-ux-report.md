# ብዕሬ (Biʼire) — UI/UX Report

**Product:** Hands-free, multilingual AI lecture & study assistant  
**Users:** Students with upper-limb mobility impairments (primary); any student who needs voice-first note-taking (secondary)  
**Languages:** English, Amharic (አማርኛ), Afaan Oromo  
**Date:** 21 Nov 2026  
**Target:** WCAG 2.2 AA · mobile and desktop Chrome/Edge  
**Related docs:** [accessibility-audit.md](./accessibility-audit.md) · [design-system/lissannote/MASTER.md](../design-system/lissannote/MASTER.md)

---

## 1. Executive summary

Biʼire’s interface is built around one idea: **a student who cannot write or type can still capture a lecture, revise it, and study — mostly by voice.**

The UI is deliberately sparse. One primary action fills the first screen (**Start**). Secondary work (notebooks, settings, study tools) sits behind a small bottom bar. Every important action has three paths: **voice**, **large tap**, and **keyboard**. Audio cues and spoken confirmations mean the student does not have to look at the screen.

Automated accessibility scans report **0 axe violations** on Home, Notes, and Quiz. The design system follows Minimalism / Swiss Style with light and dark themes, large touch targets, and Ethiopic-capable typography.

---

## 2. Users and jobs to be done

| User need | How the UI supports it |
|---|---|
| Start a class without fine motor control | One huge round green button; say “start” or press Space |
| Follow the lecture without writing | Live transcript + Bookmark (voice / Space) |
| Get usable notes after class | One “Over” action → structured notes (summary, definitions, takeaways, exam hints) |
| Capture a personal thought later | Notebooks → “Speak a note” → Save |
| Revise without typing | Study tabs: Cards, Ask (tutor), Plan, Materials |
| Work in Amharic / Afaan Oromo | Language setting; `lang` on content; Ethiopic font stack |

**Primary constraint:** upper-limb impairment. So the UI prefers **few large controls**, **no tiny chips as sole affordances**, and **no mouse-only gestures**.

---

## 3. Design principles

1. **One job per screen** — Home start view shows only Start; study tools are separate tabs.
2. **Brand first** — Header always shows ብዕሬ + Biʼire with the pen-nib mark (ብዕሬ ≈ “my pen”).
3. **Voice first, screen second** — Beeps + spoken status for start, bookmark, save, quiz, errors.
4. **Never colour alone** — Selected toggles use check + `aria-pressed`; status uses icon + text.
5. **Large targets** — Primary buttons ≥ ~48–80px tall; source chips ≥ 28×28px (WCAG 2.5.8).
6. **Honest feedback** — Mic level wave, “Listening”, quiet-mic banner, clear error boundary instead of a blank page.
7. **Reduced motion respected** — Pulse, spin, and wave animation stop under `prefers-reduced-motion`.

---

## 4. Information architecture

```
Home
├── Start          → Recording (class) → Processing → Study
├── Notebooks      → Speak a note → Processing → Study
│                  → Open existing note → Study
└── Settings       → Course, notes language, quiz time, shortcuts

Study (per note)
├── Notes          → Read aloud, Quiz, New class
├── Cards          → Flip / Next / Previous flashcards
├── Ask            → Voice or text tutor chat
├── Plan           → Day-by-day study plan
└── Materials      → Upload PDF / image / text linked to lecture
```

**Navigation pattern:** fixed bottom tab bar (3 tabs on Home, 5 on Study). Current tab uses filled icon + `aria-current="page"`.

---

## 5. Screen-by-screen UX

### 5.1 Home — Start

| Element | Intent |
|---|---|
| Round green **Start** button | Single composition; fills the viewport between header and tab bar |
| Listening wave (inside button) | Visible only while voice recognition is live |
| Soft ring when listening | Extra non-text status cue |
| Hint under button | Changes with listening + shortcuts on/off |

**Verdict:** Strong. Matches the product promise (one action to start). Brand remains visible in the header.

### 5.2 Home — Notebooks

| Element | Intent |
|---|---|
| **Speak a note** (large accent CTA) | Personal dictation without starting a “class” |
| Notes grouped by subject | Scannable notebooks (Data Structures, Biology, My notes…) |
| Empty state | Explains both paths: speak a note or start a class |

**Verdict:** Clear separation of “record a lecture” vs “dictate a personal note”. Grouping by subject reduces a flat endless list.

### 5.3 Home — Settings

Course (optional), notes language, quiz answer time (8 / 15 / 30 s), single-key shortcuts on/off.

**Verdict:** Settings that affect accessibility (timing, shortcuts) are first-class, not buried. Course left empty on purpose so AI can label the subject.

### 5.4 Recording (class)

- Live header: red pulse + course name + mic level bars + “next text in Ns”
- Quiet-mic warning names the Chrome device
- Bookmark + Over as large side/stack buttons
- Transcript updates every ~15s; silent chunks are not sent

**Verdict:** Good feedback for a high-stakes flow. Countdown is visual-only (not in a live region) so screen readers are not flooded.

### 5.5 Speak a note

Simpler than class recording: live transcript + one **Save to notebooks** CTA. Voice: “save note”.

**Verdict:** Fits the same mental model as class recording without bookmark clutter.

### 5.6 Study — Notes

Summary, exam hints, definitions, **main takeaways**, source `#id` links into the transcript, Read aloud / Quiz me / New class.

**Verdict:** Content hierarchy matches revision priorities (exam first). Source links expand transcript and move focus (keyboard + SR friendly).

### 5.7 Study — Cards / Ask / Plan / Materials

| Tab | UX highlights |
|---|---|
| **Cards** | Large flip card; Previous / Flip / Next; auto-read; source chips |
| **Ask** | Suggestions, voice question, type field; answers read aloud with sources |
| **Plan** | Days + minutes toggles; read plan aloud; tasks name in-app tools |
| **Materials** | Upload PDF/image/text; “connects to lecture” vs “only in material” |

**Verdict:** Study mode turns one lecture into a full revision suite without leaving the note. Materials closing the loop (upload ↔ transcript) is the strongest differentiator for judges.

### 5.8 Quiz

Timed spoken answers (user-chosen window), Done answering, heard-text + feedback, score summary.

**Verdict:** Aligns with motor/speech needs (adjustable timing, early stop).

---

## 6. Visual design system

| Token | Role |
|---|---|
| Primary blue | Brand, selected nav, secondary CTAs |
| Accent green | Primary “go” actions (Start, Speak, Save) |
| Highlight amber | Bookmark / caution banners |
| Destructive red | Over / stop listening |
| Outfit | Display / headings |
| Work Sans + Noto Sans Ethiopic | Body + Ge’ez script |

- Light theme: soft blue background (`#EFF6FF`)
- Dark theme: deep navy (`#0B1220`) via `prefers-color-scheme`
- All semantic pairs targeted ≥ 4.5:1 contrast
- Spacing is deliberately spacious (density ~3/10) for motor accessibility

**Brand test:** With the header removed, the round green Start control + Ethiopic font still feel tied to Biʼire’s “my pen / voice notes” story more than a generic dashboard.

---

## 7. Interaction model

| Channel | Examples |
|---|---|
| Voice | “start”, “bookmark”, “over”, “take a note”, “save note”, “flip”, “quiz me”, “flashcards”, “ask a question” |
| Touch | Large buttons; bottom tabs; flip card |
| Keyboard | Space / Enter / arrows / letter shortcuts (optional, Settings) |

**Heard toast** (visual) is `aria-hidden`; the same text goes to a persistent live region so SRs hear it once.

**Error boundary** replaces blank crashes with message + Reload (seen when an old Chrome `scrollIntoView` Promise broke cleanup).

---

## 8. Accessibility status (WCAG 2.2 AA)

See full table in [accessibility-audit.md](./accessibility-audit.md).

**Done in product**

- Skip link, per-screen titles and `<h1>`, focus move on navigation  
- Adjustable quiz timing; disable character-key shortcuts  
- Language of parts; status announcements; focus-visible rings  
- Reflow at 320px; reduced motion; target sizes  

**Still needs people (not more code)**

1. Full NVDA pass through class → notes → quiz → cards → ask  
2. Session with at least one student with upper-limb impairment (start under ~1 minute)  
3. Re-scan Recording / Speak / Quiz listening with `await window.a11y()` while mic is live  
4. Zoom 200% / 400% check  

---

## 9. Strengths (demo / judging)

1. **Zero-handwriting story is visible in the UI**, not only in the pitch deck.  
2. **One primary CTA** on first paint — judges understand the product in seconds.  
3. **Multilingual + Ethiopic typography** is visible (Amharic UI labels, Ge’ez transcript).  
4. **Study suite** (Cards, Ask, Plan, Materials) shows depth beyond transcription.  
5. **Accessibility is designed in** (timing, shortcuts, announcements), not bolted on.  
6. **Graceful failure** — quiet mic banner, no-speech message, error boundary, demo mode.

---

## 10. Gaps and recommendations

| Priority | Gap | Recommendation |
|---|---|---|
| P0 | Venue Wi-Fi / Gemini latency | Hotspot backup; `DEMO_MODE=1` + backup video |
| P0 | Manual a11y with NVDA + real student | Schedule before judging |
| P1 | Notebooks list can get long | Filter by subject; pin “My notes” |
| P1 | Five study tabs on small phones | Consider “More” overflow after demo if cramped |
| P1 | Docs still mention Next.js / Firebase | Align PDF with Vite + SQLite + Gemini for credibility |
| P2 | No onboarding coach marks | One first-run spoken tour: “Say start…” |
| P2 | Favicon/tab brand is minimal | Already SVG pen mark; optional PWA icon set |
| P2 | Design-system MASTER still lists light palette as default | Note that production defaults to OS theme (often dark) |

---

## 11. Heuristic snapshot (Nielsen)

| Heuristic | Score (1–5) | Notes |
|---|---|---|
| Visibility of system status | 5 | Mic wave, Listening, quiet banner, processing spinner |
| Match real world | 4 | “Class”, “Bookmark”, “Notebooks”, Ethiopic labels |
| User control & freedom | 4 | Home, cancel via Escape, shortcuts off, Done answering |
| Consistency & standards | 5 | Shared BigButton, TabBar, tokens |
| Error prevention | 4 | Silence filter, confirm delete material |
| Recognition over recall | 5 | Suggestions on Ask; visible commands in hints |
| Flexibility & efficiency | 4 | Voice + keys + tap |
| Aesthetic & minimalist | 4 | Start screen excellent; study tabs denser by need |
| Help recover from errors | 4 | Clear copy + Reload + Try again |
| Help & documentation | 3 | Hints on buttons; no full help page yet |

**Overall UI/UX readiness for hackathon demo: Strong** — ready to show, with P0 demo contingency and one real-user a11y pass as the main remaining UX work.

---

## 12. Demo UI script (2 minutes)

1. **Home** — point at round Start + Listening wave. Say “start”.  
2. **Recording** — talk 20s, say “bookmark”, show level bars, say “over”.  
3. **Notes** — exam hints + takeaways; tap a `#source`.  
4. **Cards** — flip with Space; say “next”.  
5. **Materials** — upload a one-page PDF; show “Connects to your lecture”.  
6. **Ask** — “What will be on the exam?”  
7. **Notebooks** — “Speak a note” → save → appears under a subject.  

If network fails at any step: flip `DEMO_MODE=1`, restart backend, repeat with scripted lecture.

---

*Report owner: Biʼire team · Generated for hackathon judging preparation*
