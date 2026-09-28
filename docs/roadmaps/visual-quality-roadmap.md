# BUILD PLAN — visual quality: palette, type, depth

Cotyledon keeps its copper, green and off-white palette and its three-dimensional surface (bevel
highlights, strokes, shadows) and is tuned for many hours a day at a screen: soft colours, no glare, and
contrast strong enough that figures, titles and headers read at arm's length.

Status lives in [`../roadmap.md`](../roadmap.md) (Phase V); this file owns the assessment, the decisions
and the rules. The stylesheet is `apps/web/src/app/(farm)/farm/_components/farm.css`.

## 1. Decisions

1. Keep the palette and the 3D surface style; improve visual quality inside it.
2. Page titles move to copper that reads (item 1). Accepted.
3. Off-white ink ladder stepped by lightness (item 2). Accepted.
4. One type scale with an 11px floor (item 3). Accepted.
5. Elevation ladder, tinted shadows, control borders ≥ 3:1 (item 4). Implement.
6. Solid focus ring, visible row hover (item 5). Implement.
7. Sidebar: a logo colour, a top soil layer, or a mid-tone limestone (item 6). Chosen: the logo's second
   soil layer, deep copper `#8E5323`, the only candidate that meets both the glare and text-contrast
   targets (§3).
8. Provenance: stated is blue, sourced is green, held clearly apart (item 7).
9. Fix the stale stylesheet header (item 8).
10. Convert every inline style to CSS (item 9).

## 2. The assessment (measured 2026-09-17, before the change)

Contrast is WCAG 2.x relative luminance on the card surface unless noted.

| Finding | Before | After |
|---|---|---|
| Page title (dark copper on ground) | 3.9:1 | 6.3:1 (`--farm-accent`) |
| Primary text | #FFFFFF, 16.8:1 (glare) | `--farm-ink` #E6EDE8, 13.7:1; figures `--farm-ink-strong` 15.0:1 |
| Secondary / muted tiers | 11.8 / 10.0 (1.2× apart, hue-only) | 10.3 / 7.5 (clear lightness steps) |
| Font sizes in the stylesheet | 29 distinct; labels 9.6–10.2px | 8-step `--farm-fs-*` scale; floor 11.2px; body 14px |
| Inline style attributes in pages | 1,678 (≈330 inline font sizes, 53 hex colours) | 34, all computed from data (positions, widths, data colours) |
| Card vs ground | 1.09:1 | elevation ladder, each step lighter; shadows tinted to the ground |
| Input / button borders | 1.55:1 | `--farm-line-control`, 3.5–4.0:1 |
| Keyboard focus ring (32% copper glow) | 1.7:1 | solid 2px copper, 5.7:1 |
| Table row hover | 1.06:1 | 4.5% wash, visible |
| Sidebar luminance vs working surface | ~50:1 (limestone) | ~9.6:1 (soil) |
| Stated vs sourced (OKLab ΔE, normal vision) | 14.5 | 18.0 (deutan 15.9) |
| Error / warning text left from the light theme (`#a33417`, `#9a6212`, `#2f7343`) | ~2–3:1 on dark | the semantic tokens (over 4.9, placeholder 8.5, sourced 7.5) |

## 3. Sidebar candidates

| Candidate | Luminance vs surface | Cream text | Verdict |
|---|---|---|---|
| Mid-tone limestone `#B3A88F` | 31:1 | 2.0:1 (dark ink needed, 6.6:1) | glare remains |
| Top soil `#B8733A` | 18:1 | 3.3:1 | nav text fails AA |
| **Second soil `#8E5323` → `#804A1F`** | **9.6:1** | **5.3:1** | **chosen** |
| Soil base `#6B3C1A` | 5.1:1 | 8.0:1 | reads as a dark panel; less brand warmth |

Mint section heads `#C6EAD7` 4.7:1; tagline and active edge light copper `#F1CFA6`.

## 4. Phases

**V1 — tokens and stylesheet**  DONE (2026-09-17)
- [x] Ink ladder (`--farm-ink-strong`, `--farm-ink`, `--farm-ink-soft`, `--farm-ink-faint`)
- [x] Type scale `--farm-fs-2xs … --farm-fs-2xl`; every size in `farm.css` on it (brand lockup excepted)
- [x] Elevation ladder, `--farm-shade` tinted shadows, `--farm-line-control`, `--farm-row-hover`
- [x] Page title copper; KPI, hero and total-row figures in `--farm-ink-strong`
- [x] Solid focus ring on buttons, tabs, inputs, sliders
- [x] Stated re-hued blue `#78A2D8`
- [x] Soil sidebar (`--farm-side-*` tokens); limestone tokens kept for the portals
- [x] Stale header replaced; stylesheet Update Log

**V2 — inline styles to CSS**  DONE (2026-09-17)
- [x] UTILITIES section in `farm.css`: `farm-fs-*`, `farm-c-*`, `farm-mono/serif/sans`, `farm-autofit-N`,
      `farm-cell-control`, `farm-group-row-btn`, `farm-btn-light`
- [x] 1,678 → 34 inline style attributes across 108 files in the `(farm)` route groups; every one left is
      computed from data (timeline positions, bar widths, map pins, the print sheet's page size)
- [x] Style constants (`soft`, `faint`, `small`, `wide`, `selectStyle`, …) replaced by classes and removed
- [x] Light-theme hex colours replaced by semantic tokens
- [x] Verified: `tsc` clean; ESLint adds no new findings; every Tailwind class generated checked against
      the Tailwind compiler
- [x] `financials/ledger/LedgerView.tsx` — codemod run after the Ledger tab work landed (2026-09-17)

**V3 — check in the running app**  OPEN
- [ ] Walk the OS pages at 1440×900 and at 200% zoom; watch dense tables for wrapping now that table text
      is 14px
- [ ] Robert's review of the soil sidebar in place

## 5. Rules

1. No inline `style` in Farm pages except values computed from data. Sizes come from `--farm-fs-*`
   (`farm-fs-*` classes); text colours from the ink and semantic tokens (`farm-c-*`); layout and spacing
   from Tailwind utilities.
2. No hex colours in `.tsx` except brand artwork (the front-door landscape, map pins) and data palettes.
3. New tokens go in `farm.css` with their measured contrast in a comment.
4. Utilities that replace inline styles carry `!important` (Tailwind `!` suffix) so they keep the
   precedence an inline style had.

## Update Log

| Date | Change |
|---|---|
| 2026-09-17 | Plan opened from the visual-quality assessment. V1 and V2 built: ink ladder, type scale, elevation, focus and hover, copper titles, blue stated, soil sidebar, stylesheet header; 1,638 inline styles converted to classes across 107 files. LedgerView held for the other session. V3 open. |
| 2026-09-17 | LedgerView converted by the codemod once the tab work was committed; V2 complete, no file held. Portal event colours moved to tokens (sourced, placeholder, copper); orphaned `soft` constants removed. |
