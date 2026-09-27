# Phase 3 — Subscriptions and distribution  status: IN PROGRESS (the rating leftovers removed; the subscription design under agreement with Rob)

What the facility needs to take its first paying subscriber. `outline.md` §4 (Subscriber, Order), §6 (Sales, Distribution, Subscriber portal).

## Steps

- [ ] Subscriptions module: cadence (bi-weekly, monthly), Stripe recurring billing, pause and skip, a subscription cycle deriving orders
- [ ] Subscriber Portal and Flat Builder: sign-in inside the portal, account linked to a subscriber record (the linking Phase 1b deferred), a flat plan composed against nutrition targets with every benefit citing its row
- [ ] The subscriber's profile in the portal: their goals and nutrition targets, and nothing else about their health (CLAUDE.md §2), read on the R&D Blends page when blends are composed for them. What a goal is, a named set of targets and the sources behind it, is agreed with Rob before the build
- [ ] Hemp mat education in the Subscriber Portal: why the greens are grown on hemp mats, from the stated rows (`science-library.md`, document D: the makers' specifications, grade S, and the one primary study), never from the commercial pages that carry no claim
- [ ] Pickup Points and Routes: the farm, shared pickup locations, delivery routes, distribution days
- [ ] Tray returns: a live tray's set coming back for reuse, tracked per subscriber
- [ ] Supplier Portal account linking on the same mechanism
- [x] Rating columns and copy carried from the source client's mark removed from subscribers (migration `0018`): no rating on the subscriber record, the Subscribers page or Plan v Actual, whose rating rows are the suppliers' alone; supplier ratings are untouched
