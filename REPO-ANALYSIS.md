# Repository Analysis: RPSC/REET Exam Preparation Platform

> **Updated:** April 2026 | **Branch:** main | **Version:** 2.1  
> Comprehensive audit of implemented features and prioritised next-steps.

---

## ✅ Already Implemented

### 1. Authentication & User Management

| What | File / Route | Notes |
|------|-------------|-------|
| Register | `POST /api/auth/register` → `src/routes/auth.js` | Email + password, bcrypt hashing, min 6-char password |
| Login | `POST /api/auth/login` → `src/routes/auth.js` | JWT in HTTP-only cookie (7-day); enforces banned status |
| Logout | `POST /api/auth/logout` → `src/routes/auth.js` | Clears cookie |
| Current user | `GET /api/auth/me` → `src/routes/auth.js` | Re-reads live role from DB |
| Auth middleware | `src/middlewares/auth.js` | Sets `req.userId` + `req.user` from JWT |
| Admin guard | `src/middlewares/isAdmin.js` | Role-based, 403 on non-admin |
| Rate limiting | `src/middlewares/rateLimit.js` | Auth: 25 req/15 min; Contact: 5 req/15 min; Import: 20 req/15 min; Admin: 120 req/min |
| Banned user login block | `src/routes/auth.js` | Returns 403 if `user.status === 'banned'` |

**Remaining gaps:** No forgot-password / reset-password flow; no email verification on register; no 2FA.

---

### 2. User Profile

| What | File / Route | Notes |
|------|-------------|-------|
| View/edit profile | `GET/PATCH /api/profile` → `src/routes/profile.js` | Name, email, bio |
| Change password | `POST /api/profile/password` | bcrypt verify + re-hash |
| Avatar upload | `POST /api/profile/avatar` | multer, saved to `uploads/avatars/` |
| Notification prefs | `PATCH /api/profile/notifications` | Email opt-in flag |
| UI page | `public/profile.html` | Single-page edit form |

---

### 3. Quiz System

| What | File / Route | Notes |
|------|-------------|-------|
| List quizzes | `GET /api/quizzes` → `src/routes/quizzes.js` | Published only; strips correct answers |
| Get quiz | `GET /api/quizzes/:id` | Strips correct answers |
| Start attempt | `POST /api/attempts` → `src/routes/attempts.js` | Timed (quiz `timeLimit` field) |
| Submit attempt | `PATCH /api/attempts/:id` | Scores, records gamification, triggers adaptive recommendation |
| Review attempt | `GET /api/attempts/:id/review` | Per-question breakdown with correct answers |
| List attempts | `GET /api/attempts` | Auth-required; ?type / ?status / ?page filters |
| Admin quiz CRUD | `/api/admin/quizzes` → `src/routes/adminQuizzes.js` | Create/edit/delete/publish |
| Quiz UIs | `public/daily-quiz.html`, `public/topic-tests.html`, `public/mock-tests.html`, `public/quizzes.html` | Multiple modes |
| Client quiz engine | `public/js/modules/quizEngine.js`, `quizResults.js`, `questionBank.js` | Front-end quiz logic |

---

### 4. User Dashboard & Stats

| What | File / Route | Notes |
|------|-------------|-------|
| Attempt history | `GET /api/attempts` | Paginated, filterable |
| Gamification progress | `GET /api/me/progress` → `src/routes/me.js` | XP, tier, streak, badges |
| Adaptive recommendation | `GET /api/me/recommendation` → `src/routes/me.js` | Next quiz/revision suggestion |
| Daily missions | `GET /api/me/missions` | 3 built-in missions with XP rewards |
| Group membership | `GET /api/me/groups` | User's study groups + rank |
| XP balance / rewards | `GET /api/rewards` → `src/routes/rewards.js` | Balance + redemption history |
| Dashboard UI | `public/dashboard.html` | Stats, history, export |
| Help Hub details page | `public/details.html` | Resource details + revision checklist |

---

### 5. Revision System & Bookmarks ⭐ New

| What | File / Route | Notes |
|------|-------------|-------|
| Get revision set metadata | `GET /api/revision/sets` → `src/routes/revision.js` | Counts for lastWrong, weakTopic, retryWrong, retryUnattempted |
| Get revision set questions | `GET /api/revision/sets/:setType` | Up to 20 questions per set |
| Start revision session | `POST /api/revision/sets/:setType/start` | Creates attempt from revision set (auto time limit) |
| Bookmark a question | `POST /api/revision/bookmarks` | Saves to `data/bookmarks.json` |
| Remove a bookmark | `DELETE /api/revision/bookmarks/:questionId` | — |
| List bookmarks | `GET /api/revision/bookmarks` | With full question details |
| Check if bookmarked | `GET /api/revision/bookmarks/check/:questionId` | Quick check |
| Wrong questions data | `data/wrong-questions.json` | Tracked per-user/per-quiz |
| Bookmarks data | `data/bookmarks.json` | Per-user bookmarked questions |

---

### 6. Adaptive Learning Engine ⭐ New

| What | File / Route | Notes |
|------|-------------|-------|
| Topic-level stats builder | `src/utils/adaptiveLearning.js` | `buildTopicStats()` – accuracy, recency, revision flags |
| Adaptive recommendation | `buildAdaptiveRecommendation()` | Suggests next quiz or revision based on weak topics |
| Post-submit recommendation | `src/routes/attempts.js` | Returns `recommendedNextQuiz` on attempt submit |
| Progress recommendation | `src/routes/me.js` | `GET /api/me/recommendation` returns actionable suggestion |
| Dashboard integration | `public/dashboard.html` | "Recommended next step" card driven by adaptive engine |

---

### 7. Admin Analytics & Reporting

| What | File / Route | Notes |
|------|-------------|-------|
| Overview totals | `GET /api/admin/analytics/overview` → `src/routes/adminAnalytics.js` | Users, quizzes, attempts, avg score |
| Per-quiz stats | `GET /api/admin/analytics/quiz-stats` | Attempt counts + avg scores per quiz |
| Score distribution | `GET /api/admin/analytics/score-distribution` | Bucketed 0-100% bands |
| Top/bottom scorers | `GET /api/admin/analytics/user-stats` | Username only (no PII leak) |
| Attempts over time | `GET /api/admin/analytics/attempts-over-time` | ?period=daily\|weekly\|monthly |
| Recent activity feed | `GET /api/admin/analytics/recent-activity` | Last N attempts |
| Analytics UI | `public/admin/analytics.html` | Chart.js powered |

---

### 8. Admin User Management ⭐ Now Implemented

| What | File / Route | Notes |
|------|-------------|-------|
| List all users | `GET /api/admin/users` → `src/routes/adminUsers.js` | Pagination + search + role/status filter; includes attempt stats |
| User detail | `GET /api/admin/users/:id` | Full stats + last 20 attempts |
| Change user role | `PATCH /api/admin/users/:id/role` | user ↔ admin; self-demotion blocked |
| Ban / activate user | `PATCH /api/admin/users/:id/status` | Self-ban blocked |
| Delete user account | `DELETE /api/admin/users/:id` | Removes user + all their attempts; self-delete blocked |
| Delete user attempts | `DELETE /api/admin/users/:userId/attempts` | Clears all attempts + re-syncs gamification |
| Delete user quiz attempts | `DELETE /api/admin/users/:userId/attempts/:quizId` | Per-quiz attempt cleanup |
| Admin UI | `public/admin/users.html` | Full user management panel |

---

### 9. Admin Attempt Management ⭐ New

| What | File / Route | Notes |
|------|-------------|-------|
| Delete a single attempt | `DELETE /api/admin/attempts/:attemptId` → `src/routes/adminAttempts.js` | Re-syncs gamification; clears stale revision wrong-question data |

---

### 10. Resources (Notes / PDFs / Assignments)

| What | File / Route | Notes |
|------|-------------|-------|
| Admin upload | `POST /api/admin/resources` → `src/routes/resources.js` | multer, saved to `uploads/resources/` |
| Admin delete | `DELETE /api/admin/resources/:id` | Soft + file removal |
| Public list | `GET /api/resources` | Metadata only |
| Download | `GET /api/resources/:id/download` | Streams file |
| Metadata store | `data/resources.json` | title, type, tags, uploadedAt |
| User UI | `public/resources.html` | Browse + download |
| Admin UI | `public/admin/resources.html` | Upload + delete |
| Static PDFs | `public/pdfs/` | bed-notes.pdf, ssc-notes.pdf (direct static files) |

---

### 11. Admin Tools (Panel)

| What | File / Route / UI | Notes |
|------|-------------------|-------|
| Admin home | `public/admin/index.html` | Navigation hub |
| Quiz management | `public/admin/` (via `/api/admin/quizzes`) | Full CRUD |
| Analytics dashboard | `public/admin/analytics.html` | Charts + stats |
| Bulk import/export | `public/admin/import-export.html` | CSV |
| Notifications | `public/admin/notifications.html` | Broadcast + logs |
| Resources | `public/admin/resources.html` | Upload/delete |
| Courses | `public/admin/courses.html` | Lesson CRUD |
| User management | `public/admin/users.html` | List, ban, promote, delete users |

---

### 12. Bulk Import / Export

| What | File / Route | Notes |
|------|-------------|-------|
| Import quizzes | `POST /api/admin/import/quizzes` → `src/routes/adminImportExport.js` | CSV; preview mode with `?preview=1` |
| Export quizzes | `GET /api/admin/export/quizzes` | CSV download |
| Export attempts | `GET /api/admin/export/attempts` | CSV download |
| Rate limiting | 20 imports per 15 min | Prevents abuse |
| UI | `public/admin/import-export.html` | Drag-and-drop + preview |

---

### 13. Notification System

| What | File / Route | Notes |
|------|-------------|-------|
| User notifications list | `GET /api/notifications` → `src/routes/notifications.js` | Latest first |
| Mark read (one / all) | `PATCH /api/notifications/:id/read`, `PATCH /api/notifications/read-all` | — |
| Dismiss notification | `DELETE /api/notifications/:id` | — |
| Admin broadcast | `POST /api/admin/notifications/announce` → `src/routes/adminNotifications.js` | Writes to all users |
| Admin logs | `GET /api/admin/notifications/logs` | Audit trail |
| Email delivery | `src/utils/email.js` | Nodemailer + SMTP; silent skip if unconfigured |
| Bell widget | `public/js/notifications.js` | In-page badge + dropdown |
| Admin UI | `public/admin/notifications.html` | Compose + send |
| Data stores | `data/notifications.json`, `data/notification-logs.json` | — |

---

### 14. Gamification & Leaderboards

| What | File / Route | Notes |
|------|-------------|-------|
| XP engine | `src/utils/gamification.js` | XP, tiers (Bronze→Diamond), mastery levels |
| Badges | 8+ badges (first-quiz, perfect-score, streak, etc.) | Auto-awarded on attempt submit |
| Daily missions | 3 missions per day with XP rewards | Reset at UTC midnight |
| Overall leaderboard | `GET /api/leaderboard/overall` → `src/routes/leaderboard.js` | — |
| Streak leaderboard | `GET /api/leaderboard/streak` | — |
| Weekly leaderboard | `GET /api/leaderboard/weekly` | — |
| Topic leaderboard | `GET /api/leaderboard/topic` | Per-topic accuracy ranking |
| Group leaderboard | `GET /api/leaderboard/group/:groupId` | Study group ranking |
| Achievements UI | `public/achievements.html` | Badges + missions |
| Leaderboard UI | `public/leaderboard.html` | All tabs |

---

### 15. Courses & Learning Content

| What | File / Route | Notes |
|------|-------------|-------|
| List published courses | `GET /api/courses` → `src/routes/courses.js` | — |
| Course detail | `GET /api/courses/:id` | Includes lesson list |
| View lesson (PDF) | `GET /api/courses/lessons/:id/view` | Streams PDF inline |
| Admin course CRUD | `/api/admin/courses` → `src/routes/adminCourses.js` | Create/edit/delete/publish |
| Admin lesson upload | PDF upload via multer | Stored in `uploads/lessons/` |
| UI | `public/course.html` | Course viewer |
| Admin UI | `public/admin/courses.html` | Course + lesson management |

---

### 16. Security

| What | Implementation |
|------|---------------|
| CORS allowlist | `src/config.js` → `corsAllowedOrigins`; validated in `server.js` |
| Helmet | HTTP security headers (CSP disabled for CDN compatibility) |
| JWT in HTTP-only cookie | `sameSite: lax`, `secure: true` in production |
| Rate limiting | Custom in-memory limiter (`src/middlewares/rateLimit.js`) on auth, contact, import, admin |
| Input validation | Per-route (quiz, profile, auth, resources) |
| Atomic file writes | Write-queue + temp-file rename in `src/utils/db.js` |
| isAdmin check | Middleware applied to all `/api/admin/*` routes |
| Password hashing | bcrypt, cost factor 10 |
| Banned user enforcement | Login returns 403 if `user.status === 'banned'` |
| Admin self-protect | Cannot delete/ban/demote own account |

---

### 17. Miscellaneous

| What | Notes |
|------|-------|
| Contact form | `POST /api/contact`; stores JSONL + forwards via FormSubmit; rate limited |
| Content manager | `public/content-manager.html` – standalone form-based JSON editor |
| Help Hub docs | `docs/` directory (leaderboard/streak manual tests) |
| Vercel config | `vercel.json` – serverless deployment ready |
| Gamification bootstrap | Syncs XP/tier on server start (`bootstrapGamification` in `server.js`) |
| Content validation tool | `tools/validate-content.mjs` – run via `npm run validate:content` |
| Client-side modules | `public/js/modules/` – navbar, progressTracker, quizEngine, quizResults, questionBank, ui, user |

---

## ⚠️ Technical Debt & Repository Hygiene Issues

| Issue | Severity | File | Action |
|-------|----------|------|--------|
| Accidentally committed cookie file | Medium | `cookies.txt` (root) | Delete from repo + add to `.gitignore` |
| File named `e --continue` in root | Low | Root directory contains a file literally named `e --continue` (contains git log output — appears to be a shell typo during a git command) | Delete from repo |
| File named `et --soft HEAD~1` in root | Low | Root directory contains a file literally named `et --soft HEAD~1` (contains git log output — same cause) | Delete from repo |
| In-memory rate limiter | Medium | `src/middlewares/rateLimit.js` | Resets on server restart; not shared across processes. Use Redis for production. |
| JSON flat-file database | High | `src/utils/db.js` + `data/*.json` | No transactions, not suitable for concurrent writes at scale. Migrate to proper DB (MongoDB/Postgres). |
| Helmet CSP disabled | Medium | `server.js` | `contentSecurityPolicy: false` – re-enable with appropriate directives |
| Uploads directory publicly served | Medium | `server.js` line 134 | `/uploads` is static-served directly; resource files should be behind auth-controlled streaming |
| `rewards.json` deprecated | Low | `data/rewards.json` | Listed in code as deprecated; confirm removal or migrate |
| No `.gitignore` for data files | Low | `.gitignore` | `data/*.json` should be gitignored or use seed files instead to avoid committing real user data |

---

## 🔜 To Implement

Priority is ranked **High / Medium / Low** based on user impact and platform completeness.

### Priority 1 — High (Core Gaps)

| # | Feature | Why Missing / Gap |
|---|---------|-------------------|
| 1 | **Forgot Password / Reset Password** | `POST /api/auth/forgot-password` and `POST /api/auth/reset-password` are absent. Users who forget credentials have no self-service recovery. |
| 2 | **Email Verification on Register** | Registration silently accepts any email. No verification link flow implemented. |
| 3 | **Assignment Submission by Users** | Admin can upload assignments as resources, but users have no way to submit their own work for grading/feedback. |
| 4 | **Cleanup Accidental Repo Files** | `cookies.txt`, `e --continue`, `et --soft HEAD~1` should be deleted and added to `.gitignore`. |

---

### Priority 2 — Medium (Engagement & Polish)

| # | Feature | Why Missing / Gap |
|---|---------|-------------------|
| 5 | **API-wide Rate Limiting** | Rate limiting only covers `/api/auth`, `/api/contact`, `/api/admin/import`, and `/api/admin/*`. Other routes (quiz submit, profile update, revision, etc.) are unprotected from abuse. |
| 6 | **Exam Scheduler & Reminders** | No ability to schedule a quiz for a future date/time with auto-reminder notifications. |
| 7 | **Full-Text Search** | No search across quizzes, resources, or courses. Essential as content grows. |
| 8 | **Teacher / Instructor Role** | Only `user` and `admin` roles exist. A `teacher` role (can create quizzes/lessons but not manage users) is missing. |
| 9 | **Video Content Support** | Courses support PDF lessons only. No video upload/embed or HLS streaming integration. |
| 10 | **Discussion / Q&A Forum** | No community discussion thread or per-quiz Q&A feature. |
| 11 | **PWA / Offline Support** | No `manifest.json`, no service worker, no offline cache. Pages load from CDN Tailwind (not production-bundled). |

---

### Priority 3 — Low / Future

| # | Feature | Why Missing / Gap |
|---|---------|-------------------|
| 12 | **Third-Party Login (Google OAuth)** | Only email+password auth. Google sign-in would lower onboarding friction. |
| 13 | **Two-Factor Authentication (2FA)** | No TOTP or SMS-based 2FA. |
| 14 | **API Documentation (Swagger / OpenAPI)** | No auto-generated API docs. Makes integration harder for future clients. |
| 15 | **Automated Test Suite** | No `test/` directory or test framework configured. No unit, integration, or e2e tests. |
| 16 | **CI/CD Pipeline** | No `.github/workflows/` directory. No GitHub Actions for lint, test, or deploy on push/PR. |
| 17 | **Previous Year Papers / PDF solutions** | Planned in PLATFORM-GUIDE but not implemented. Could be served as specialised resources. |
| 18 | **AI Question Recommendations** | Planned in PLATFORM-GUIDE but not implemented. Adaptive engine exists but no ML/NLP layer. |
| 19 | **Export Results as PDF** | Users can download CSV attempts but not a formatted PDF report. |

---

## 🔒 Security Gaps

| Gap | Risk | Recommendation |
|-----|------|----------------|
| No email verification | Medium | Anyone can register with any email. Add verification token flow. |
| No forgot/reset password | Medium | Locked-out users have no recovery path. |
| `/uploads` publicly served | Medium | Any resource file URL is accessible without auth. Route downloads through `GET /api/resources/:id/download` instead. |
| Helmet CSP disabled | Medium | Re-enable Content-Security-Policy with a proper directive list. |
| In-memory rate limiter | Low-Medium | State lost on restart; no cross-process sharing in scaled deployments. Use Redis (`rate-limiter-flexible`). |
| Rate limiting gaps | Low-Medium | `/api/quizzes`, `/api/attempts`, `/api/revision`, `/api/leaderboard` are unprotected. |
| No 2FA | Low | Accounts can be taken over with only a password. |
| JWT secret fallback | Low | In development, a derived local secret is used — ensure `JWT_SECRET` is always set in staging/production. |

---

## 🚀 Deployment Readiness Gaps

| Gap | Notes |
|-----|-------|
| JSON flat-file DB | Not suitable for multi-instance or high-concurrency deployments; all state is in `data/*.json`. |
| No structured logging | `console.log/error` only — no log levels, no log aggregation (Winston/Pino). |
| No health check endpoint | No `GET /health` or `/api/health` for uptime monitoring. |
| Vercel serverless limitations | Vercel Functions have an ephemeral filesystem — writes succeed during a single invocation but are not shared between invocations and do not persist after the invocation ends. JSON flat-file writes will therefore appear to succeed but data will be lost. Needs a persistent external DB. |
| No process manager config | No `PM2` ecosystem file or container (`Dockerfile`) for self-hosted deployment. |
| CORS origins hardcoded for dev | Production `CORS_ALLOWED_ORIGINS` must be set via env; falls back to empty in production if not set. |

---

## 🧪 Testing / CI Gaps

| Gap | Notes |
|-----|-------|
| No test directory | No `test/`, `__tests__/`, or `spec/` directory present. |
| No test framework | No Jest, Mocha, Supertest, or similar configured in `package.json`. |
| No CI workflow | No `.github/workflows/` directory — no automated tests, lint, or security scan on PRs. |
| No linter | No ESLint, Prettier, or similar configured; code style consistency relies entirely on manual review. |
| Manual test docs only | `docs/leaderboard-streak-manual-tests.md` exists but is manually run. |
| `npm run validate:content` | Only script beyond `start`/`dev`; validates content JSON — not application logic. |

---

## 📋 Prioritised Next-Steps Roadmap

```
Sprint 1 (Immediate – Repo Hygiene & Core Safety)
├── ✅ [done] JWT auth, user profiles, quiz system
├── ✅ [done] Admin analytics, bulk import/export, notifications
├── ✅ [done] Gamification (XP, badges, leaderboards)
├── ✅ [done] Admin User Management page + API (users.html + adminUsers.js)
├── ✅ [done] Admin Attempt delete (adminAttempts.js)
├── ✅ [done] Revision system (wrong questions, bookmarks, revision sets)
├── ✅ [done] Adaptive learning engine (topic stats, recommendations)
├── 🔲 Delete accidental committed files (cookies.txt, e --continue, et --soft HEAD~1)
└── 🔲 Forgot Password / Reset Password flow

Sprint 2 (User Trust & Safety)
├── 🔲 Email verification on register
├── 🔲 API-wide rate limiting (generalise rateLimit middleware to all routes)
├── 🔲 Re-enable Helmet Content-Security-Policy
└── 🔲 Assignment submission + admin grading/feedback loop

Sprint 3 (Testing & CI)
├── 🔲 GitHub Actions workflow (lint + test on PR)
├── 🔲 Add ESLint + Prettier config
└── 🔲 Automated test suite (Jest + Supertest for auth, quiz, attempt routes)

Sprint 4 (Content & Discovery)
├── 🔲 Full-text search (quizzes, resources, courses)
├── 🔲 Exam scheduler + auto-reminder notifications
├── 🔲 Teacher/instructor role (restricted admin)
└── 🔲 Video lesson support (upload + embed)

Sprint 5 (Platform Maturity)
├── 🔲 Migrate JSON DB to MongoDB/Postgres for production scalability
├── 🔲 PWA: manifest.json + service worker + offline cache
├── 🔲 Discussion / Q&A forum (per quiz or global)
└── 🔲 Health check endpoint + structured logging (Winston/Pino)

Sprint 6 (Growth & Extras)
├── 🔲 Google OAuth login
├── 🔲 OpenAPI / Swagger docs
├── 🔲 PDF export of results
└── 🔲 AI-powered question recommendations (ML layer on top of adaptive engine)
```

---

## 🗂️ File & Route Quick-Reference

```
server.js                               ← Express entry point, all route mounts
src/
  config.js                             ← Env vars, CORS, JWT, rate limit config
  middlewares/
    auth.js                             ← JWT cookie → req.userId + req.user
    isAdmin.js                          ← Role check (403 if not admin)
    rateLimit.js                        ← In-memory sliding window rate limiter
  routes/
    auth.js              /api/auth                  ← register, login, logout, me
    quizzes.js           /api/quizzes               ← public quiz list + detail
    attempts.js          /api/attempts              ← start, submit, review, list
    revision.js          /api/revision              ← revision sets, bookmarks, start
    profile.js           /api/profile               ← view/edit, avatar, password, notif prefs
    leaderboard.js       /api/leaderboard           ← overall, streak, weekly, topic, group
    me.js                /api/me                    ← missions, progress, groups, recommendation
    rewards.js           /api/rewards               ← XP balance, redemption history
    resources.js         /api/resources             ← public list + download
    courses.js           /api/courses               ← published courses + lesson stream
    notifications.js     /api/notifications         ← list, mark-read, dismiss
    adminQuizzes.js      /api/admin/quizzes         ← CRUD, publish/unpublish
    adminAnalytics.js    /api/admin/analytics       ← 6 analytics endpoints
    adminImportExport.js /api/admin                 ← import (CSV) + export quizzes/attempts
    adminNotifications.js /api/admin/notifications  ← broadcast, logs
    adminCourses.js      /api/admin/courses         ← course + lesson CRUD
    adminUsers.js        /api/admin/users           ← list, role, status, delete users
    adminAttempts.js     /api/admin/attempts        ← delete individual attempts
    resources.js         /api/admin/resources       ← admin upload/delete
  utils/
    db.js                               ← JSON file DB with write-queue + atomic writes
    email.js                            ← Nodemailer SMTP wrapper
    gamification.js                     ← XP, tiers, badges, missions engine
    leaderboard.js                      ← Leaderboard computation helpers
    adaptiveLearning.js                 ← Topic stats + adaptive quiz/revision recommendations
public/
  index.html              ← Main dashboard (home)
  dashboard.html          ← User quiz history + stats + adaptive recommendation card
  profile.html            ← User profile edit
  quizzes.html            ← Browse all quizzes
  daily-quiz.html         ← Daily random quiz UI
  topic-tests.html        ← Topic-wise test UI
  mock-tests.html         ← Full mock exam with timer
  leaderboard.html        ← All leaderboard tabs
  achievements.html       ← Badges + missions
  resources.html          ← Notes/PDF browser
  course.html             ← Course viewer
  details.html            ← Help Hub resource details + revision checklist
  content-manager.html    ← Standalone content JSON editor
  js/
    notifications.js      ← Bell widget (in-page badge + dropdown)
    modules/
      navbar.js           ← Shared navbar logic
      progressTracker.js  ← Progress UI component
      quizEngine.js       ← Quiz-taking engine
      quizResults.js      ← Results rendering
      questionBank.js     ← Question bank helpers
      ui.js               ← Shared UI utilities
      user.js             ← User state management
  admin/
    index.html            ← Admin nav hub
    analytics.html        ← Admin analytics dashboard
    import-export.html    ← Bulk import/export
    notifications.html    ← Admin broadcast panel
    resources.html        ← Admin resource upload
    courses.html          ← Admin course + lesson CRUD
    users.html            ← Admin user management (list, ban, promote, delete)
data/
  users.json              ← User records (id, name, email, passwordHash, role, XP, status …)
  quizzes.json            ← Quiz + question bank
  attempts.json           ← All quiz attempts
  resources.json          ← Resource metadata
  courses.json            ← Course metadata
  lessons.json            ← Lesson metadata
  notifications.json      ← Per-user notifications
  notification-logs.json  ← Admin broadcast log
  gamification-config.json ← XP / tier / badge config
  groups.json             ← Study group definitions
  bookmarks.json          ← Per-user bookmarked questions
  wrong-questions.json    ← Per-user incorrect question tracking (revision system)
  questions.json          ← Standalone question bank (separate from quizzes)
  content.json            ← Content configuration
  events.json             ← Scheduled events (future use)
  rewards.json            ← (deprecated – badge-only system now)
tools/
  validate-content.mjs    ← Content JSON validator (npm run validate:content)
```
