# Ideas view redesign — design plan

## Subject

Trails' **Ideas** view is the shortlist: unconfirmed candidates for a trip,
weighed against each other before any becomes a real plan. Audience: the one
or two people planning the trip. Primary job: **scan and compare many
candidates fast, then promote the ones you commit to.**

Today it can't do that — six ideas occupy 4,000px of full-width stack.

## Diagnosis (from the brief's screenshot + live seed)

1. **The cover photo renders twice.** An 80px `float: right` thumbnail beside
   the title, *and* the whole `PhotoGallery` again at the card foot under a
   `FOTON` label with an `OMSLAG` badge on the same image. The float also
   leaves a dead gap on cards whose text is too short to wrap around it.
2. **Convert is a full-width solid green bar** on every card — the loudest
   element on the page, for the rarest and most consequential action, while
   Edit sits next to the title as a small outline pill. They share nothing.
3. `locationName` repeats the title verbatim ("Hong Island" / "Hong Island").
4. Metadata is a bare run of soft-grey words (`Krabi  Tours  Utomhus`) that
   reads as three broken links.
5. Six all-caps micro-labels per screen (`PRIORITET`…`FOTON`, `LÄNKAR`).
6. Card title is `1rem/600` — the same size as body copy.
7. `+ Lägg till idé` is a full-width pill, wider than any content on the page.

## Tokens

**Color** — bound to the existing system (a redesign inside an established
identity, not a rebrand; `/workspace/DESIGN.md` is the client's own spec).

| Role | Value |
|---|---|
| Canvas | `#f2f0eb` |
| Card surface | `#ffffff` |
| Quiet fill | `#f9f9f9` |
| Brand (headings) | `#006241` |
| Accent (affirmative fill) | `#00754a` |
| Deep (strong text, group headings) | `#1e3932` |
| Text / soft | `rgba(0,0,0,.87)` / `rgba(0,0,0,.58)` |

Gold is untouched — reserved for the Active-trip ceremony. **No new color is
introduced.** Section identity comes from each Section's own stored `color`
(the curated `SECTION_COLOR_PALETTE`), the same value the Timeline paints
with.

**Type** — one family (`--font-trails`). DESIGN.md is explicit that this
system uses three faces in three named contexts, and Ideas is not one of
them, so hierarchy is carried by size/weight/color per the system's own rule.

| Role | Setting |
|---|---|
| Card title | `1.0625rem / 600 / text` |
| Description | `0.9375rem / 400 / soft`, 2-line clamp |
| Meta chips | `0.8125rem / 600`, **sentence case** |
| Section group heading | `0.9375rem / 600 / brand-deep` |
| Cost | `0.875rem / 600 / text` |

## Layout

From a full-width vertical stack to a **grouped, photo-led grid**:

```
Idéer                                    [+ Lägg till idé]
Obekräftade kandidater för den här resan.
┌─ filter bar: 4 pill selects + Filtrera ─────────────────┐

●  Krabi  ─────────────────────────────────────────  2 idéer
┌───────────────┐ ┌───────────────┐ ┌───────────────┐
│▓▓▓ PHOTO ▓▓▓▓│ │▓▓▓ PHOTO ▓▓▓▓│ │▓ 6px section ▓│
│▓▓▓  4:3  ▓▓▓▓│ │▓▓▓  4:3  ▓▓▓▓│ ├───────────────┤
├───────────────┤ ├───────────────┤ │ Second-hand   │
│ Hong Island   │ │ Sea kayaking  │ │ bookshop      │
│ [Vill göra]   │ │ [Kanske]      │ │ [Kanske]      │
│  Tours        │ │  Tours        │ │               │
│ Longtail boat │ │ Mangrove chan │ │ Name unknown. │
│ out to the la…│ │ nels between… │ │               │
│ 1 400 THB     │ │   900 THB     │ │               │
│ ───────────── │ │ ───────────── │ │ ───────────── │
│ Booking page  │ │               │ │               │
│ [Red.][Konv.] │ │ [Red.][Konv.] │ │ [Red.][Konv.] │
└───────────────┘ └───────────────┘ └───────────────┘
```

Left-aligned throughout (mixed sv/en content, ragged right).
`auto-fill minmax(276px, 1fr)` → 3-up at the 960px page width, 1-up on a
phone. `align-items: start` so a text-only idea stays short rather than
padding itself out to match a photo card.

## Principles

1. **The photo is the idea.** Full-bleed 4:3 at the top of the card, once.
2. **Section is the page's spine, not a repeated field.** Group under the
   Section's own colored heading; drop the section name from every card.
3. **Matched action pair.** Edit and Convert get one geometry and one size in
   the card footer, differing only in fill.
4. **Weight follows commitment.** Must-do takes the solid accent chip,
   Would-like the mint, Maybe a hairline — the page's visual weight maps to
   how committed you are.
5. **Cut what the filter bar already covers.** Weather suitability leaves the
   card face (a filter axis, not card content), as does a `locationName` that
   merely repeats the title.

## Plan review — where would the generic answer have landed?

Working this brief cold, the default output is: keep the vertical stack, move
the photo to a left-hand 120px thumbnail, make Convert an outline button,
done. That addresses the two named complaints and nothing else — the view
still can't be scanned, and 4,000px for six candidates is the actual problem
behind "very much lacking". So both named fixes stay, and the structure went
further.

Checked against the known tells: no middle-dot meta strings (weather dropped,
chips replace the joined string), no tracked-out all-caps eyebrows (four
removed, three sentence-cased), no `01/02/03` markers (a shortlist is not a
sequence), no `→` glyphs, no one-word headline accent, no gradient washes
(the system forbids them outright), no new accent color invented for one page.

The card grid is the one thing that could read as the generic SaaS-card kit.
It stays because a shortlist of comparable candidates is genuinely
card-shaped, cards are already this app's established surface language, and
these cards differ from one another by photograph, priority weight, and
section color rather than being identical rounded boxes.
