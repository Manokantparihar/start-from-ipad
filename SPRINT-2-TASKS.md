# Sprint 2 Task Board (Phase 3 Start)

## Sprint Goal
Start Phase 3 learner features with a clean base for auth, profile, and progress tracking.

## Duration
7 days

## Priority Legend
- P0 = must ship
- P1 = should ship
- P2 = nice to have

## Backlog

### P0
- [ ] Finalize Phase 3 data model (`users`, `bookmarks`, `studyProgress`, `streak`).
- [ ] Add sign in / sign out UI flow.
- [ ] Add minimal profile panel (name/email + joined date).
- [ ] Add bookmark save/remove flow from resource cards.
- [ ] Add basic "My Study Plan" page scaffold.

### P1
- [ ] Streak calculation helper (daily activity based).
- [ ] Progress summary cards (completed steps, saved resources).
- [ ] Empty states for first-time users.
- [ ] Event tracking hooks for auth and bookmark actions.

### P2
- [ ] Quick filters in My Study Plan.
- [ ] Export study plan as text/PDF.

## Day-wise Plan

### Day 1
- Freeze auth provider + storage approach.
- Create data model document and field map.

### Day 2
- Build sign in/sign out UI.
- Add protected state check helper.

### Day 3
- Build profile panel + bind basic user data.

### Day 4
- Add bookmark action from homepage cards.
- Add saved items list in profile/study plan.

### Day 5
- Build My Study Plan skeleton with placeholder data.
- Add progress summary calculations.

### Day 6
- QA pass (auth, save/remove, refresh persistence).
- Accessibility and state handling fixes.

### Day 7
- Stabilization, bug fixes, and sprint review notes.

## Definition of Done
- User can sign in and sign out reliably.
- User profile basic info renders correctly.
- User can bookmark and unbookmark resources.
- My Study Plan view shows user-specific data/state.
- No console/runtime errors on main Phase 3 flows.

## Owners
- Product + Engineering: Manokant
- Content QA: Manokant
