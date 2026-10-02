# Inventory 02 — Wolves To Feed and related wellness repos

Status: TEMPORARY inventory. What exists, what it says about Rob/Joshin's background, and what is reusable for the Austin wellness-center plan.

## A. Wolves To Feed website — `/Users/robertbogatin/Documents/Wolves To Feed/WTF website`

- Next.js 16 / React 19 / TS / Tailwind 4 / Framer Motion; Clerk auth; Stripe checkout + webhooks; UploadThing digital delivery with HMAC download tokens; Resend email; GA4; Sanity configured but unused; Vercel. Git repo, last touched 2026-09-21.
- Pages: Home, Coaching, Publishing (books, workbooks, "The Workshop" product grid), The Pack (community, Austin men's group), Contact (Google Form), Podcast (hidden), success/cancel.
- Brand: obsidian #000, aged-gold #D4AF37, fire-orange #E25822, shadow-red #ff4d00, spirit-blue #70d6ff. Cinzel headings, Tahoma body. Dark-mode default. Shadow/Spirit duality motif.
- Positioning: "Integrated Wellness Collective for Men in Mid-Life." Already relocated to **Austin, TX** in copy (Sept 2026): local men's group forming in Austin, gatherings Oct/Nov/Dec 2026.
- **Coaching page (the credential story):**
  - Joshin bio: lifelong entrepreneur, systems designer, martial artist, student of Zen and contemplative practices; three decades of values-driven small businesses and nonprofits in wellness, sustainability, community; lives in Austin with Maska Tigre.
  - Expertise line: Fitness, Nutrition, Meditation, Warrior Qigong, Ayurveda.
  - Disciplines grid: Fitness, Qigong, Nutrition, Meditation, Ayurveda, Mental Models (Yoga and Kundalini removed with Brian).
  - Packages (currently commented out): Single 75 min $75; 4-pack $270; 12-pack $720. Stripe price IDs wired via env.
  - Dubsado CRM env var present.
- The Workshop grid lists Rob's other products: AxiomDelta.ai, GetCompTable.com, AxiomDelta.coach, Muse Kitchen · Impact OS, RVMasterPlan.app, WellBodyMind.com.
- Reusable for Cotyledon: Stripe checkout + webhook pattern, digital delivery pattern, Google Form embed, brand system if the wellness center sits under the WTF umbrella, Austin men's-group audience as first subscriber pool.

## B. Feed The Wolf App — `/WTF Publishing/Feed The Wolf App`

- Same stack + Neon Postgres + Drizzle + Claude API scoring + Vercel Blob. Coaching engine: activities, levers, journey, daily resilience checks, admin exports.
- Relevant as a pattern for client intake/tracking (nutrition objectives, deficiency targets, session outcomes), not as code to fork wholesale.

## C. Background material on Rob (for the wellness-center narrative)

- **The Big Picture (VMF):** stopped breathing as infant; antibiotic allergy at 7; lifelong athlete; poison ivy years → early study of inflammation, skin, meditation; first Kensho at 12; 20 years insomnia; dual degree Entrepreneurship + Phenomenology; season on a biodynamic CSA (300 people / 35 weeks / <2 acres); **became a massage therapist and energy worker** after the farm; studied life energy, frequency, vibration, color, nutrition, naturopathy; **extensive Ayurveda training via MAPI (Maharishi Ayurveda) Colorado Springs, mid-90s**; co-owned two family restaurants and a food truck; 2022 Good Food Collective contract (heritage apples, La Plata County).
- **career/Docs/Roadmap.md line 35:** microgreens/sprouts; Rinzai/Integral Zen, dharma name Joshin (2014); Shaolin Kung Fu / qigong / tai chi; bodywork & energy work (massage, Reiki); Ayurveda; shadow work; NVC; author of *On the Edge of Greatness*.
- **WTF "Men Over 50" doc:** mission, transformation statement, a Topics Matrix mapping core teachings (Awareness, Breath, Focus, Daily Practice, Consumption, …) across Western / Eastern / Modern Science / Integration columns — a ready-made curriculum skeleton for movement/meditation programming.
- So: prior massage/energy-work experience exists but is uncredentialed in Texas; the massage-school plan re-credentials an existing skill.

## D. Sibling repos and what they contribute

| Repo | What it is | Relevance |
|---|---|---|
| AxiomDelta / AxiomDelta.coach | Coaching-business platform (booking, video, forms, Stripe billing, accounting, "Delta" outcome tracking). Yoga Farm letter pitches it to instructors. | Could be the back-office for massage/bodywork bookings and subscriptions instead of building new. |
| Comptable | Accounting / admin platform (Muse, Impact OS). | Financial modeling + bookkeeping engine option. |
| Well Body Mind Yoga | Static site, Brian Winters' yoga/qigong in Dryden NY. | Template for a simple studio landing page only. |
| Kensho Earth | Static art/astronomy page. | Not relevant. |
| Vestibular Ocular Tools | Next.js drills/assessment app. | Possible movement-therapy module later. |
| Basin Collective | Turborepo monorepo with financials/ledger packages. | Financial-model package pattern. |
| On the Edge of Greatness / Edges workbook | Book + workbook assets. | Retail-corner merchandise. |
| WTF Assets | Audio tracks, logos, video, financials_roadmap.txt. | Brand + retail media. |
| Wolves To Feed/Ancient Texts | Offline mirror of a sacred-texts archive. | Library content for the app; not for this repo. |

## E. Existing infrastructure choices worth inheriting (if we build software)

Next.js App Router + Tailwind 4 + Clerk + Stripe + Resend + Vercel is the house stack across four live projects; Neon/Drizzle where a DB exists. Any Cotyledon app or site should match unless there's a reason not to.
