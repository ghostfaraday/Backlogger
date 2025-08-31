# Backlogger — Design Timeline & Snapshots

This document records major UI/UX design milestones so we can snapshot, compare, and restore designs over time.

## Snapshot: 2025-08-31
Tag: design-snapshot-2025-08-31

Highlights
- Trader Level simplified to a single progress bar with subtle Next-level label
- Cumulative progress across levels; default to Novice; Next-level indicator below bar
- Weekly Challenge setup refined: full-width date picker with hint; Start button below
- Improved Challenge flow: Mon→Fri structure, per-day trades and no-trade, daily summary
- Decluttered Challenge view: focus on current day; end-week visible on Friday only
- Trade Rules redesigned: professional card with 5-star ratings for 4 categories
- Actions aligned: Add Trade and No Trade grouped and responsive
- Mobile polish: equal-width day controls, spacing for Today (P/L), Friday end-week wraps
- Friday behavior: Next Day becomes Return to Monday

Key commits
- 004c30a — UI: simplify Trader Level (single bar + Next)
- be23059 — Add subtle next-level dot marker; cumulative progress
- 992cbd2 — Move next-level dot to label below bar
- 6316d2c — Feature: improved challenge flow (week/day structure, rules, reports)
- 697dd62 — UX: Weekly Challenge layout (full-width date + Start)
- 2ec6b9d — UX: spacing between Weekly Challenge rows
- 01dc8aa — UX: mobile-friendly date hint overlay
- 85a4d24 — UX: declutter Challenge (current day focus, rules card, actions)
- 3f05e5f — Polish: star ratings for rules + logic
- e49af91 — UX: align current-day/Next sizes; spacing; mobile edge layout
- 6d7c950 — UX: Friday ‘Return to Monday’ behavior
- 2eea929 — Revert overflow wrap tweak
- f8ad00c — Mobile: equal-width day controls; P/L spacing; Friday wrap

Restore
- Use the git tag “design-snapshot-2025-08-31” to check out this exact design state.

Notes
- This timeline focuses on design/UI. Functional changes are tracked in commit history and docs.

---

## Snapshot: 2025-08-31 (Header/Menu mobile polish)
Tag: design-snapshot-2025-08-31b

Highlights
- Header/menu cleanup: 4-item centered nav; logo anchored left; Settings moved to right as gear button
- Mobile header: two-row layout (brand+gear first row, centered nav second row) for better balance
- Settings button: added visible “Settings” label next to gear, compact typography to fit on small screens
- Mobile affordances: hide balance on very small screens to avoid overflow; smooth horizontal scroll for nav if needed

Key commits
- 35d9837 — UI: header polish — logo left, centered menu with 4 items, settings gear at right; responsive tweaks
- 06e114e — Mobile header: two-row layout; hide balance on small screens; prevent overflow
- 4940042 — UX: add “Settings” label next to gear; icon button spacing

Restore
- Use the git tag “design-snapshot-2025-08-31b” to check out this design state (post-header/mobile polish).