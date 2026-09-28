# Ember OS Brand — Master Roadmap

Build phases for the Ember OS identity and its sub-brands. Each item is marked open [ ] or completed [x].

## Phase 1 — Ember OS web logo library
- [x] Stacked lockups from the original (full frame 1024, tight 704, 512, 256, JPG)
- [x] Square mark icon with the wordmark removed and background rebuilt (520 native, 1024 upscaled, 512–128)
- [x] Small icons with tighter crop (64/48/32/16) and favicon.ico
- [x] Wordmark on original background (624, 312)
- [x] Transparent wordmark: white, original gray, dark (full and small)
- [ ] Rob review and any re-crops

## Phase 2 — High-resolution / print
- [ ] High-res regeneration of the illustration on a plain background
- [ ] Rebuild library from the high-res source
- [ ] Transparent mark cutout
- [ ] Print-ready files

## Phase 3 — Brand system
- [ ] Color palette pulled from the illustration
- [ ] Typography spec alongside sub-brand fonts
- [ ] "Powered by Ember OS" endorsement lockup
- [ ] One-page brand guidelines

## Phase 4 — Muse Kitchen sub-brand
- [x] Master confirmed: Living Sprout tile (v1, Sept 2026)
- [x] "Impact OS" dropped; text-only "POWERED BY EMBER OS" endorsement in Muse's own palette (mint on dark, copper on light)
- [x] Stacked and horizontal lockups: on-dark, on-light, dark-background, light-background (SVG + PNG 1x/2x)
- [x] Badge variants with the Ember icon beside the endorsement (horizontal with divider; stacked with inline badge)
- [x] Standalone "powered by Ember OS" endorsement, text-only and with badge, for footers and login screens
- [x] Fixed: old stacked masters clipped the bottom of the secondary line; new canvases are measured
- [ ] Rob review
- [ ] Replace the Impact OS lockups inside the Muse Kitchen app

## Phase 5 — Cotyledon sub-brand (formerly Micro Farm)
- [x] Name decided: the microgreens app is **Cotyledon**, powered by Ember OS
- [x] Reference logo cleaned: tile cut out with a rounded mask (876 px native), COTYLEDON wordmark keyed to transparent
- [x] Background studies (6); chose Deep forest #0E3326 (dark) and Cream #F4EEE3 (light)
- [x] Stacked lockups, 1x/2x, four surfaces, plus Ember-badge variants
- [x] Header lockups (80/160/200 px tile), four surfaces, plus Ember-badge variants
- [x] Wordmark alone (full/regular/small), icon set 16–1024, favicon, icon-on-background squares
- [x] Standalone "powered by Ember OS" endorsement, text and badge
- [ ] Rob review
- [ ] Optional: vector redraw of the tile (flat art, close cousin of the Muse tile SVG)
- [ ] Rename Micro Farm → Cotyledon across the app, repo, and docs

## Phase 6 — Rollout
- [ ] Replace logos in Muse Kitchen (getcomptable.com/muse) and the Micro Farm repo
- [ ] OG image and social avatars

---

## Update Log
- **2026-09-27** — Project started. Endorsed architecture decided; Muse Kitchen master confirmed as the Living Sprout tile. Vector redraw attempted and rejected (could not match the painted original). Built the web logo library v1 directly from the original: stacked lockups, square icon set with rebuilt background, favicon, wordmark on background, and transparent wordmarks.
- **2026-09-27** — Muse Kitchen sub-brand v1: Impact OS removed, text-only "POWERED BY EMBER OS" endorsement (Poppins + vector Montserrat EMBER OS) in Muse's palette; stacked/horizontal lockups in four surfaces, two Ember-badge variants, standalone endorsement badges. Endorsement proportions live in `muse-kitchen-ember-logo-files/source/build.py`.
- **2026-09-28** — Micro Farm renamed **Cotyledon**. Cleaned the reference logo into a transparent tile and wordmark; ran six background studies; Rob chose Deep forest #0E3326 and Cream #F4EEE3. Built the Cotyledon kit (78 files): stacked, header, badge variants, wordmark, icons/favicon, endorsements. Endorsement in mint (dark) and copper (light), same system as Muse Kitchen.
