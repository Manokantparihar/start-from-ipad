# Repository Analysis: RPSC/REET Exam Preparation Platform

> **Generated:** April 2026 | **Branch:** `copilot/read-only-repository-analysis` | **Version:** 2.0  
> Full read-only audit of the live codebase. Every claim below is verified against actual source files.  
> See the **File & Route Quick-Reference** at the bottom for a complete map.

---

## ✅ Already Implemented

### 1. Authentication & User Management

| What | File / Route | Notes |
|------|-------------|-------|
| Register | `POST /api/auth/register` → `src/routes/auth.js` | Email + password, bcrypt hashing |
| Login | `POST /api/auth/login` → `src/routes/auth.js` | JWT in HTTP-only cookie (7-day) |
| Logout | `POST /api/auth/logout` → `src/routes/auth.js` | Clears cookie |
| Current user | `GET /api/auth/me` → `src/routes/auth.js` | Re-reads live role from DB |
| Auth middleware | `src/middlewares/auth.js` | Sets `req.userId` + `req.user` from JWT |
| Admin guard | `src/middlewares/isAdmin.js` | Role-based, 403 on non-admin |
| Rate limiting | `src/middlewares/rateLimit.js` | Auth: 25 req/15 min; Contact: 5 req/15 min; Import: 20 req/15 min |

**Gaps in this area:** No forgot-password / reset-password flow (email template exists in `src/utils/email.js` → `buildPasswordResetEmail` but the route does not exist); no email verification on register; no 2FA; no account lockout after repeated failed logins; no CSRF protection; JWT tokens cannot be revoked (7-day lifetime, server-side blacklist missing).

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
| Submit attempt | `PATCH /api/attempts/:id` | Scores, records gamification |
| Review attempt | `GET /api/attempts/:id/review` | Per-question breakdown with correct answers |
| List attempts | `GET /api/attempts` | Auth-required; ?type / ?status / ?page filters |
| Admin quiz CRUD | `/api/admin/quizzes` → `src/routes/adminQuizzes.js` | Create/edit/delete/publish |
| Quiz UIs | `public/daily-quiz.html`, `public/topic-tests.html`, `public/mock-tests.html`, `public/quizzes.html` | Multiple modes |

---

### 4. User Dashboard & Stats

| What | File / Route | Notes |
|------|-------------|-------|
| Attempt history | `GET /api/attempts` | Paginated, filterable |
| Gamification progress | `GET /api/me/progress` → `src/routes/me.js` | XP, tier, streak, badges |
| Daily missions | `GET /api/me/missions` | 3 built-in missions with XP rewards |
| Group membership | `GET /api/me/groups` | User's study groups + rank |
| XP balance / rewards | `GET /api/rewards` → `src/routes/rewards.js` | Balance + redemption history |
| Dashboard UI | `public/dashboard.html` | Stats, history, export |

---

### 5. Admin Analytics & Reporting

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

### 6. Resources (Notes / PDFs / Assignments)

| What | File / Route | Notes |
|------|-------------|-------|
| Admin upload | `POST /api/admin/resources` → `src/routes/resources.js` | multer, saved to `uploads/resources/` |
| Admin delete | `DELETE /api/admin/resources/:id` | Soft + file removal |
| Public list | `GET /api/resources` | Metadata only |
| Download | `GET /api/resources/:id/download` | Streams file |
| Metadata store | `data/resources.json` | title, type, tags, uploadedAt |
| User UI | `public/resources.html` | Browse + download |
| Admin UI | `public/admin/resources.html` | Upload + delete |

---

### 7. Admin Tools (Panel)

| What | File / Route / UI | Notes |
|------|-------------------|-------|
| Admin home | `public/admin/index.html` | Navigation hub |
| Quiz management | `public/admin/` (via `/api/admin/quizzes`) | Full CRUD |
| Analytics dashboard | `public/admin/analytics.html` | Charts + stats |
| Bulk import/export | `public/admin/import-export.html` | CSV |
| Notifications | `public/admin/notifications.html` | Broadcast + logs |
| Resources | `public/admin/resources.html` | Upload/delete |
| Courses | `public/admin/courses.html` | Lesson CRUD |

---

### 8. Bulk Import / Export

| What | File / Route | Notes |
|------|-------------|-------|
| Import quizzes | `POST /api/admin/import/quizzes` → `src/routes/adminImportExport.js` | CSV + JSON; preview mode with `?preview=1` |
| Export quizzes | `GET /api/admin/export/quizzes` | CSV download |
| Export attempts | `GET /api/admin/export/attempts` | CSV download |
| Rate limiting | 20 imports per 15 min | Prevents abuse |
| UI | `public/admin/import-export.html` | Drag-and-drop + preview |

---

### 9. Notification System

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

### 10. Gamification & Leaderboards

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

### 11. Courses & Learning Content

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

### 12. Security

| What | Implementation |
|------|---------------|
| CORS allowlist | `src/config.js` → `corsAllowedOrigins`; validated in `server.js` |
| Helmet | HTTP security headers (CSP disabled for CDN compatibility) |
| JWT in HTTP-only cookie | `sameSite: lax`, `secure: true` in production |
| Rate limiting | Custom in-memory limiter (`src/middlewares/rateLimit.js`) |
| Input validation | Per-route (quiz, profile, auth, resources) |
| Atomic file writes | Write-queue + temp-file rename in `src/utils/db.js` |
| isAdmin check | Middleware applied to all `/api/admin/*` routes |
| Password hashing | bcrypt, cost factor 10 |

---

### 13. Miscellaneous

| What | Notes |
|------|-------|
| Contact form | `POST /api/contact`; stores JSONL + forwards via FormSubmit |
| Content manager | `public/content-manager.html` – standalone form-based JSON editor |
| Help Hub docs | `docs/` directory |
| Vercel config | `vercel.json` – serverless deployment ready |
| Gamification bootstrap | Syncs XP/tier on server start (`bootstrapGamification` in `server.js`) |

---

### 11. Admin User Management *(implemented – previously listed as a gap)*

| What | File / Route | Notes |
|------|-------------|-------|
| List all users | `GET /api/admin/users` → `src/routes/adminUsers.js` | Pagination, search, role/status filters |
| Single user detail | `GET /api/admin/users/:id` | Full attempt stats |
| Promote / demote | `PATCH /api/admin/users/:id/role` | `user` ↔ `admin`; self-demotion blocked |
| Ban / unban | `PATCH /api/admin/users/:id/status` | Self-ban blocked |
| Delete user | `DELETE /api/admin/users/:id` | Permanent; removes all attempts too |
| Delete user's attempts | `DELETE /api/admin/users/:userId/attempts` | Clears all; re-syncs gamification |
| Delete quiz attempts | `DELETE /api/admin/users/:userId/attempts/:quizId` | Per-quiz; clears wrong-questions |
| Admin UI | `public/admin/users.html` | Full page with tables, filters |

---

### 12. Revision System

| What | File / Route | Notes |
|------|-------------|-------|
| Revision sets meta | `GET /api/revision/sets` → `src/routes/revision.js` | lastWrong, weakTopic, retryWrong, retryUnattempted |
| Set questions | `GET /api/revision/sets/:setType` | Full question details |
| Start revision quiz | `POST /api/revision/sets/:setType/start` | Creates timed attempt |
| Bookmarks (add/list/remove) | `POST/GET/DELETE /api/revision/bookmarks` | Per-user |
| Bookmark check | `GET /api/revision/bookmarks/check/:questionId` | Boolean |
| Data | `data/wrong-questions.json`, `data/bookmarks.json` | Persisted |

---

### 13. Admin Attempt Management

| What | File / Route | Notes |
|------|-------------|-------|
| Delete single attempt | `DELETE /api/admin/attempts/:attemptId` → `src/routes/adminAttempts.js` | Clears stale revision data; re-syncs gamification |

---

### 14. Adaptive Learning

| What | File / Route | Notes |
|------|-------------|-------|
| Topic-priority scoring | `src/utils/adaptiveLearning.js` | Penalty-based priority formula |
| Recommendation | `GET /api/me/recommendation` | Returns top topic + best quiz to practice |
| Progress + recommendation | `GET /api/me/progress` | Unified progress payload |

---

### 15. Infrastructure & Security

| What | Implementation |
|------|---------------|
| CORS allowlist | `src/config.js` → validated in `server.js`; dev auto-allows localhost / Codespaces |
| Helmet | HTTP security headers on; **CSP disabled** for CDN compatibility |
| JWT in HTTP-only cookie | `sameSite: lax`, `secure: true` in production |
| Rate limiting | Auth 25/15 min, contact 5/15 min, import 20/15 min, admin 120/min, notifications 60/min (in-memory) |
| Input validation & sanitization | Per-route (quiz, profile, auth, resources, courses, notifications) |
| Atomic file writes | Write-queue + temp-file rename in `src/utils/db.js` |
| isAdmin middleware | Applied to all `/api/admin/*` routes; reads live role from DB |
| Password hashing | bcrypt, cost factor 10 |
| Banned user blocking | Auth middleware rejects banned accounts on every request |
| Config centralised | `src/config.js` – env vars, CORS, JWT, rate limit settings |
| `.env.example` | Provided with all required variables documented |

---

### 16. Miscellaneous

| What | Notes |
|------|-------|
| Contact form | `POST /api/contact`; JSONL log + FormSubmit.co forwarding |
| Content manager | `public/content-manager.html` – standalone form-based JSON editor |
| Gamification bootstrap | Syncs XP/tier for all users on server start (`bootstrapGamification` in `server.js`) |
| Vercel config | `vercel.json` present (see deployment gap below) |

---

## 🔴 Security Gaps

| # | Gap | Evidence |
|---|-----|----------|
| 1 | **Forgot-password route missing** | `buildPasswordResetEmail` in `src/utils/email.js` exists but `POST /api/auth/forgot-password` and `POST /api/auth/reset-password` routes do not exist. Users with forgotten passwords have no recovery path. |
| 2 | **Content Security Policy disabled** | `server.js:93` – `contentSecurityPolicy: false` in Helmet. XSS payloads from third-party CDNs are not blocked. |
| 3 | **Uploads served statically, access-tier not enforced** | `server.js:134` – `app.use('/uploads', express.static(...))`. Anyone who guesses the UUID filename can download any resource, bypassing `accessTier: premium` and `visibility: private` fields in the DB. |
| 4 | **Rate limiting missing on most routes** | `GET /api/quizzes`, `POST /api/attempts`, `GET /api/leaderboard`, `PATCH /api/profile`, `GET /api/resources/*/download` and others have no rate limiting. |
| 5 | **No account lockout on login** | `src/routes/auth.js` never counts failed attempts. Brute-force of passwords is unlimited. |
| 6 | **No JWT revocation** | Tokens are valid for 7 days with no server-side blacklist. Stolen tokens cannot be invalidated before expiry. |
| 7 | **Password policy too weak** | Minimum 6 characters only; no complexity check. Common short passwords are accepted. |
| 8 | **No email verification on register** | Any email address is accepted. Registration creates an account without verifying ownership of the address. |
| 9 | **No CSRF protection** | State-mutating routes (login, profile update, admin actions) accept requests from any origin that satisfies the `sameSite: lax` cookie policy; no CSRF token is checked. |
| 10 | **`cookies.txt` committed to repo** | `cookies.txt` in the repository root likely contains sensitive session data and should be removed and added to `.gitignore`. |
| 11 | **Accidental git command files in root** | `e --continue` and `et --soft HEAD~1` are literal filenames committed to the repo – these are git command strings that were accidentally run as file creates. They should be removed. |
| 12 | **No audit log for admin actions** | Admin mutations (delete user, ban, bulk import, delete attempt) are applied without any write to an audit trail. |

---

## 🟡 Deployment Readiness Gaps

| # | Gap | Evidence |
|---|-----|----------|
| 1 | **JSON file DB is not production-safe** | Concurrent requests from multiple Node processes (clustering, horizontal scaling) will corrupt JSON files. No locking outside one process. |
| 2 | **No DB backup strategy** | No scheduled backup or export. A single `fs.writeFile` error could corrupt the data layer. |
| 3 | **Vercel config incomplete** | `vercel.json` has only static redirects. Vercel serverless requires `functions` or `rewrites` configuration for Express; as-is, API routes would return 404. Also: the permanent (301) redirect from `/dashboard.html → /index.html` is incorrect (the dashboard exists and should be accessible). |
| 4 | **No structured logging** | Only `console.log/error`. No log levels, no timestamps, no JSON log format, no integration with Datadog / Sentry / Papertrail. |
| 5 | **No health-check endpoint** | Load balancers and container orchestrators (Kubernetes, Railway, Render) require a `GET /health` or `GET /api/health` endpoint. |
| 6 | **No Dockerfile or deployment guide** | There is no `Dockerfile`, `docker-compose.yml`, or `DEPLOYMENT.md`. |
| 7 | **No process manager config** | No `Procfile` (Heroku), no `ecosystem.config.js` (PM2), no `railway.json`. |
| 8 | **Tailwind CSS loaded from CDN** | All HTML pages include a CDN link for Tailwind. In production this adds latency, can be blocked by CSP, and is a supply-chain risk. |
| 9 | **Rate limiters are in-memory only** | `src/middlewares/rateLimit.js` and the per-route Maps in `notifications.js` / `adminNotifications.js` reset on restart and do not work across multiple instances. Redis-backed rate limiting is needed for production. |
| 10 | **SMTP not configured out of the box** | Email notifications silently skip without SMTP env vars. No deployment checklist warns operators to set these. |

---

## ⚪ Test Coverage Gaps

| # | Gap | Evidence |
|---|-----|----------|
| 1 | **No test framework** | No `test/` or `__tests__/` directory. `package.json` has no test script beyond the default `echo "Error: no test specified"`. |
| 2 | **No unit tests** | `src/utils/gamification.js` (43 KB), `src/utils/adaptiveLearning.js`, `src/utils/leaderboard.js` contain complex scoring algorithms with no tests. A regression in XP calculation would be invisible. |
| 3 | **No integration tests** | No route-level tests (auth register/login flow, quiz attempt lifecycle, admin CRUD). |
| 4 | **No E2E tests** | No browser-level tests (Playwright, Cypress) for the HTML UI pages. |
| 5 | **No CI/CD pipeline** | No `.github/workflows/` directory; no linting, building, or test execution on pull requests. |
| 6 | **Content validator not automated** | `tools/validate-content.mjs` exists and can validate JSON data files, but it is not run automatically in CI. |

---

## 🔜 To Implement

Priority is ranked **P1 Critical / P2 High / P3 Medium / P4 Low** based on user impact, security, and platform completeness.

### P1 — Critical (Security & Correctness)

| # | Feature | Notes |
|---|---------|-------|
| 1 | **Fix uploads access control** | Serve files via authenticated route instead of `express.static`; enforce `accessTier` + `visibility` per resource. |
| 2 | **Forgot password / reset password** | `POST /api/auth/forgot-password` + `POST /api/auth/reset-password`. Email template already exists in `email.js`. |
| 3 | **Rate limiting on attempt/quiz/leaderboard routes** | Use existing `createRateLimiter` middleware; apply to attempts, quiz, leaderboard, profile. |
| 4 | **Account lockout on login** | Count failed attempts (e.g. 5 attempts → 15 min lock); store lockout in users.json. |
| 5 | **Remove accidental files from repo** | Delete `e --continue`, `et --soft HEAD~1`, `cookies.txt` from root; add `cookies.txt` to `.gitignore`. |
| 6 | **Enable Content Security Policy** | Configure a real CSP that allows only trusted CDN origins (Tailwind, Chart.js); remove `contentSecurityPolicy: false`. |

### P2 — High (Core Features & Deployment)

| # | Feature | Notes |
|---|---------|-------|
| 7 | **Fix Vercel config** | Add `rewrites` to forward `/api/*` to Express; change `/dashboard.html` from 301 to 302 (or remove). |
| 8 | **Structured logging** | Add `winston` or `pino`; replace `console.log/error`; include request IDs in logs. |
| 9 | **Health check endpoint** | `GET /api/health` → `{ status: "ok", uptime, version }`. |
| 10 | **Email verification on register** | Send a confirmation link; prevent login until email verified. |
| 11 | **Admin groups management API** | `data/groups.json` exists but there is no API to create/edit groups. Currently groups must be edited manually. |
| 12 | **Retire rewards UI properly** | `GET /api/rewards` returns `rewardShopEnabled: false`; the redeem endpoint returns HTTP 410. The frontend still shows a "Reward Shop" placeholder. Update UI to reflect badge-only system. |

### P3 — Medium (Engagement & Polish)

| # | Feature | Notes |
|---|---------|-------|
| 13 | **Exam scheduler & reminders** | `data/events.json` schema is in place but no admin UI, no scheduler, and no notification trigger on event start. |
| 14 | **Full-text search** | No search across quizzes, resources, or courses. Essential as content grows. |
| 15 | **Assignment submission by users** | Admin can upload assignments as resources, but users have no upload/submission flow or admin grading feedback loop. |
| 16 | **Teacher / Instructor role** | Only `user` and `admin` roles exist. A `teacher` role (can create quizzes/lessons, cannot manage users) is missing. |
| 17 | **Video content for lessons** | `adminCourses.js` and `courses.js` only handle PDF. No video upload / HLS streaming support. |
| 18 | **PWA / offline support** | No `manifest.json`, no service worker. Tailwind is loaded from CDN (not bundled). |
| 19 | **Discussion / Q&A** | No per-quiz discussion thread or global community forum. |

### P4 — Low / Future

| # | Feature | Notes |
|---|---------|-------|
| 20 | **Automated test suite** | Jest + Supertest; unit tests for gamification/leaderboard/adaptive utilities; integration tests for auth + attempt flow. |
| 21 | **GitHub Actions CI** | Lint (ESLint), test, and `npm audit` on every PR. |
| 22 | **Database migration** | Move from flat JSON files to MongoDB Atlas or Supabase for production concurrency safety. |
| 23 | **Redis-backed rate limiting** | Replace in-memory rate limit Maps with Redis for multi-instance correctness. |
| 24 | **Third-party login (Google OAuth)** | Reduces registration friction. |
| 25 | **Two-factor authentication** | TOTP (e.g. via `speakeasy`). |
| 26 | **PDF export of results** | Users can export CSV attempts; a formatted PDF report would be more useful. |
| 27 | **OpenAPI / Swagger docs** | No auto-generated API documentation. |
| 28 | **AI question recommendations** | Planned in `PROGRAMMING-LEARNING-ROADMAP.md` but not implemented; requires an external ML layer. |

---

## 📋 Prioritised Next-Steps Roadmap

```
Sprint 1 – Security Hardening  (do before any public launch)
├── 🔲 Enforce /uploads access via authenticated route  ← CRITICAL
├── 🔲 Add rate limiting to all unprotected routes
├── 🔲 Add login lockout (5 failed → 15 min block)
├── 🔲 Enable Content Security Policy
├── 🔲 Remove e --continue / et --soft HEAD~1 / cookies.txt from repo
└── 🔲 Implement forgot-password / reset-password flow

Sprint 2 – Deployment Readiness
├── 🔲 Fix vercel.json (API rewrites + dashboard redirect)
├── 🔲 Add structured logging (pino or winston)
├── 🔲 Add GET /api/health endpoint
├── 🔲 Email verification on register
└── 🔲 Dockerfile + deployment guide

Sprint 3 – Feature Completions
├── 🔲 Groups management API (admin CRUD for groups)
├── 🔲 Exam scheduler + notification trigger
├── 🔲 Assignment submission by users + admin grading
├── 🔲 Retire reward-shop UI (align with HTTP 410 backend)
└── 🔲 Full-text search (quizzes, resources, courses)

Sprint 4 – Quality & Testing
├── 🔲 Jest + Supertest unit + integration tests
├── 🔲 GitHub Actions CI (lint, test, npm audit)
└── 🔲 Redis-backed rate limiting (for multi-instance deployments)

Sprint 5 – Growth
├── 🔲 Teacher/instructor role
├── 🔲 Video lesson support
├── 🔲 PWA: manifest.json + service worker
├── 🔲 Google OAuth login
└── 🔲 OpenAPI / Swagger docs
```

---

## 🗂️ File & Route Quick-Reference

```
server.js                               ← Express entry point, all route mounts
src/
  config.js                             ← Env vars, CORS, JWT, rate limit config
  middlewares/
    auth.js                             ← JWT cookie → req.userId + req.user; bans check
    isAdmin.js                          ← Role check (403 if not admin)
    rateLimit.js                        ← In-memory sliding window rate limiter
  routes/
    auth.js           /api/auth         ← register, login, logout, me
    quizzes.js        /api/quizzes      ← public quiz list + detail (no correct answers)
    attempts.js       /api/attempts     ← start, submit, review, list, export
    revision.js       /api/revision     ← wrong-question sets, bookmarks, revision start
    profile.js        /api/profile      ← view/edit, avatar, password, notif prefs
    leaderboard.js    /api/leaderboard  ← overall, streak, weekly, topic, group
    me.js             /api/me           ← missions, progress, recommendation, groups
    rewards.js        /api/rewards      ← XP balance (shop retired – HTTP 410 on redeem)
    resources.js      /api/resources    ← public list + download + inline view
    courses.js        /api/courses      ← published courses + lesson PDF stream
    notifications.js  /api/notifications← list, mark-read, read-all, dismiss
    adminQuizzes.js   /api/admin/quizzes← CRUD, publish/unpublish, duplicate, reorder
    adminAnalytics.js /api/admin/analytics ← overview, quiz-stats, score-dist, user-stats, over-time, activity
    adminImportExport.js /api/admin     ← import CSV+JSON, export quizzes+attempts
    adminNotifications.js /api/admin/notifications ← announce, logs, users list
    adminCourses.js   /api/admin/courses← course + lesson CRUD, file replace, move
    adminUsers.js     /api/admin/users  ← list, get, role, status, delete, clear attempts
    adminAttempts.js  /api/admin/attempts ← delete single attempt
    resources.js      /api/admin/resources ← admin upload/soft-delete
  utils/
    db.js                               ← JSON file DB; write-queue + atomic rename writes
    email.js                            ← Nodemailer SMTP; announcement/result/reset templates
    gamification.js                     ← XP, tiers, badges, missions, streak engine (43 KB)
    leaderboard.js                      ← Leaderboard sort/ranking helpers
    adaptiveLearning.js                 ← Topic priority scoring + quiz recommendation engine
public/
  index.html           ← Home / landing page (stats loaded from /api/attempts)
  dashboard.html       ← User quiz history, stats, export
  profile.html         ← User profile edit, avatar, password, notif prefs
  quizzes.html         ← Browse all quizzes
  daily-quiz.html      ← Daily random quiz UI
  topic-tests.html     ← Topic-wise test UI
  mock-tests.html      ← Full mock exam with timer
  leaderboard.html     ← Overall, streak, weekly, topic, group tabs
  achievements.html    ← Badges + missions
  resources.html       ← Notes/PDF browser + inline viewer
  course.html          ← Course + lesson viewer
  content-manager.html ← Standalone content JSON editor (dev tool)
  js/
    notifications.js   ← Bell widget (badge + dropdown, poll every 60 s)
    modules/           ← navbar, progressTracker, questionBank, quizEngine, quizResults, ui, user
  admin/
    index.html         ← Admin navigation hub
    analytics.html     ← Admin analytics (Chart.js)
    import-export.html ← Bulk import/export (drag-and-drop + preview)
    notifications.html ← Admin broadcast panel + log
    resources.html     ← Admin resource upload + soft-delete
    courses.html       ← Admin course + lesson CRUD
    users.html         ← Admin user management (list, search, role/status, delete)
data/
  users.json             ← User records (id, name, email, passwordHash, role, XP, streak …)
  quizzes.json           ← Quiz + question bank (slug, difficulty, timeLimit, isPublished …)
  attempts.json          ← All quiz attempts (status, score, answers, completedAt …)
  resources.json         ← Resource metadata (title, accessTier, visibility, filePath …)
  courses.json           ← Course metadata (title, category, status, isDeleted …)
  lessons.json           ← Lesson metadata (courseId, type, order, filename …)
  notifications.json     ← Per-user in-app notifications
  notification-logs.json ← Admin broadcast delivery log
  wrong-questions.json   ← Per-user incorrect answer records (for revision system)
  bookmarks.json         ← Per-user bookmarked questions
  gamification-config.json ← XP / tier thresholds / badge config
  groups.json            ← Study group definitions (no admin API yet)
  rewards.json           ← Deprecated (badge-only system now)
  events.json            ← Scheduled events placeholder (no management API yet)
  contact-submissions.jsonl ← Append-only contact form log
uploads/
  avatars/               ← User profile pictures (served via /uploads/avatars/*)
  resources/             ← Admin-uploaded PDFs (served via /uploads/resources/* – ⚠️ public)
  lessons/               ← Course lesson PDFs (served via /uploads/lessons/* – ⚠️ public)
```
