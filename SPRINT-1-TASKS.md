# Sprint 1 Task Board (Execution Start)

## Sprint Goal
Convert current project into a clean, data-driven MVP base with consistent content operations.

## Duration
7 days

## Priority Legend
- P0 = must ship in sprint
- P1 = should ship
- P2 = nice to have

## Backlog

### P0
- [x] Define content JSON schema for resources, updates, guides.
- [x] Move homepage cards to data-driven rendering.
- [x] Move details page content to shared data source.
- [x] Add robust empty-state/fallback when item not found.
- [ ] Add canonical SEO tags and update Open Graph URL/image placeholders.

### P1
- [ ] Add section-level search/filter (by category).
- [ ] Add download tracking event hooks.
- [ ] Add print footer with platform branding/date.
- [ ] Add dedicated 404-style content state for invalid `item` slug.

### P2
- [ ] Add topic tags and estimated reading time.
- [ ] Add keyboard shortcuts (`/` for search, `p` for print).

## Day-wise Plan

### Day 1
- Freeze schema and create `data/content.json`.
- Add loader utility in `index.js` for shared content.

### Day 2
- Render homepage sections from `content.json`.
- Keep UI identical, replace hardcoded data only.

### Day 3
- Render details page from same JSON source.
- Preserve current progress + checklist functionality.

### Day 4
- Add fallback states + validation for bad slugs.
- Add safe guards for missing fields.

### Day 5
- SEO cleanup + metadata alignment.
- Add lightweight analytics event stubs.

### Day 6
- Manual QA pass: mobile + desktop + print.
- Performance and accessibility quick fixes.

### Day 7
- Release prep, bugfixes, and sprint review notes.

## Definition of Done
- Core pages render from one source of truth.
- No console/runtime errors on main flows.
- All key buttons/links work.
- Contact flow and print/PDF still functional.
- README updated with content update workflow.

## Owners
- Product + Engineering: Manokant
- Content QA: Manokant

## Daily Checkpoint Template
- What shipped today:
- Blockers:
- Tomorrow focus:
