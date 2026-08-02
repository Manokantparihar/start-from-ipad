# Repository Analysis: RPSC/REET Exam Preparation Platform

> **Updated:** April 2026 | **Branch:** main | **Version:** 2.0  
> Verified audit of all implemented features and prioritised next-steps.  
> Every claim below is backed by an actual file, route, or data store in the repository.

---

## ✅ Already Implemented

### 1. Authentication & User Management

| What | File / Route | Notes |
|------|-------------|-------|
| Register | `POST /api/auth/register` → `src/routes/auth.js` | Email + password, bcrypt hashing; min 6-char password |
| Login | `POST /api/auth/login` → `src/routes/auth.js` | JWT in HTTP-only cookie (7-day); banned-account check |
| Logout | `POST /api/auth/logout` → `src/routes/auth.js` | Clears cookie |
| Current user | `GET /api/auth/me` → `src/routes/auth.js` | Re-reads live role from DB; no-cache headers |
| Auth middleware | `src/middlewares/auth.js` | JWT → `req.userId` + `req.user`; DB lookup on every request |
| Admin guard | `src/middlewares/isAdmin.js` | Role check, 403 on non-admin |
| Rate limiting | `src/middlewares/rateLimit.js` + `src/config.js` | Auth: 25 req/15 min; Contact: 5 req/15 min; Import: 20 req/15 min; Admin: 120 req/min |

---

### 2. User Profile

| What | File / Route | Notes |
|------|-------------|-------|
| View profile | `GET /api/profile` → `src/routes/profile.js` | Returns user + gamification fields |
| Edit profile | `PUT /api/profile` | Name, email (validated), bio |
| Change password | `PUT /api/profile/password` | bcrypt verify old + re-hash new |
| Email notification prefs | `PATCH /api/profile/notifications` | Per-user email opt-in flag |
| Avatar upload | `POST /api/profile/avatar` | multer (2 MB, JPEG/PNG/WebP/GIF), saved to `uploads/avatars/` |
| UI page | `public/profile.html` | Single-page edit form |

---

### 3. Quiz System

| What | File / Route | Notes |
|------|-------------|-------|
| List quizzes | `GET /api/quizzes` → `src/routes/quizzes.js` | Published only; strips correct answers |
| Get quiz | `GET /api/quizzes/:id` | Published only; strips correct answers |
| Start attempt | `POST /api/attempts` → `src/routes/attempts.js` | Auth-required; timed via quiz `timeLimit` |
| Auto-save attempt | `PUT /api/attempts/:id/save` | Periodic answer save (no submit yet) |
| Submit attempt | `POST /api/attempts/:id/submit` | Scores, triggers gamification update |
| Review attempt | `GET /api/attempts/:id/review` | Per-question breakdown with correct answers |
| Attempt insights | `GET /api/attempts/:id/insights` | Topic-level performance breakdown |
| List user attempts | `GET /api/attempts` | Auth; `?type` / `?status` / `?page` filters |
| Revision bookmarks (in attempts) | `GET/POST/DELETE /api/attempts/revision/bookmarks` | Bookmark questions during attempt |
| Admin quiz CRUD | `/api/admin/quizzes` → `src/routes/adminQuizzes.js` | Create, edit, delete, publish, duplicate, reorder |
| Quiz UIs | `public/daily-quiz.html`, `public/topic-tests.html`, `public/mock-tests.html`, `public/quizzes.html` | Daily, topic-wise, full mock, browse modes |

---

### 4. Revision System

| What | File / Route | Notes |
|------|-------------|-------|
| Wrong-question tracking | Recorded on submit; `data/wrong-questions.json` | Per-user, per-quiz, per-topic |
| Revision sets | `GET /api/revision/sets` → `src/routes/revision.js` | Metadata for all revision sets |
| Get revision set | `GET /api/revision/sets/:setType` | Full question list for a set type |
| Bookmarks | `GET/POST /api/revision/bookmarks`, `DELETE /api/revision/bookmarks/:id` | Save/remove bookmarked questions |
| Start revision quiz | `POST /api/revision/sets/:setType/start` | Starts a timed revision attempt |

---

### 5. Adaptive Learning

| What | File / Route | Notes |
|------|-------------|-------|
| Topic performance analysis | `src/utils/adaptiveLearning.js` | Computes per-topic accuracy, recency of errors |
| Smart recommendations | `GET /api/me/recommendation` → `src/routes/me.js` | Returns next recommended quiz/topic |
| Priority topics | Included in recommendation response | Topics needing the most revision |
| Progress summary | `GET /api/me/progress` | Includes adaptive recommendation + priority topics |

---

### 6. User Dashboard & Stats

| What | File / Route | Notes |
|------|-------------|-------|
| Attempt history | `GET /api/attempts` | Paginated, filterable |
| Gamification progress | `GET /api/me/progress` → `src/routes/me.js` | XP, tier, streak, badges, week range |
| Daily missions | `GET /api/me/missions` | 3 built-in missions with XP rewards; UTC-midnight reset |
| Group membership | `GET /api/me/groups` | User's study groups + member rank |
| XP balance | `GET /api/rewards` → `src/routes/rewards.js` | Balance + redemption history (reward shop retired) |
| Dashboard UI | `public/dashboard.html` | Stats, history, export |
| Achievements UI | `public/achievements.html` | Badge showcase, next milestone, recently unlocked |

---

### 7. Admin Analytics & Reporting

| What | File / Route | Notes |
|------|-------------|-------|
| Overview totals | `GET /api/admin/analytics/overview` → `src/routes/adminAnalytics.js` | Users, quizzes, attempts, avg score |
| Per-quiz stats | `GET /api/admin/analytics/quiz-stats` | Attempt counts + avg scores per quiz |
| Score distribution | `GET /api/admin/analytics/score-distribution` | Bucketed 0-100% bands |
| Top/bottom scorers | `GET /api/admin/analytics/user-stats` | Username only (no PII leak) |
| Attempts over time | `GET /api/admin/analytics/attempts-over-time` | `?period=daily\|weekly\|monthly` |
| Recent activity feed | `GET /api/admin/analytics/recent-activity` | Last N attempts |
| Analytics UI | `public/admin/analytics.html` | Chart.js powered |

---

### 8. Resources (Notes / PDFs / Assignments)

| What | File / Route | Notes |
|------|-------------|-------|
| Admin upload | `POST /api/admin/resources` → `src/routes/resources.js` | multer, saved to `uploads/resources/` |
| Admin delete | `DELETE /api/admin/resources/:id` | File + metadata removal |
| Public list | `GET /api/resources` | Metadata only |
| Download | `GET /api/resources/:id/download` | Streams file to client |
| Metadata store | `data/resources.json` | title, type, tags, uploadedAt |
| User UI | `public/resources.html` | Browse + download |
| Admin UI | `public/admin/resources.html` | Upload + delete |

---

### 9. Admin Tools Panel

| Page | Route / API | Notes |
|------|-------------|-------|
| Admin home | `public/admin/index.html` | Navigation hub; links to all sub-panels including Users |
| Quiz management | `public/admin/index.html` → `/api/admin/quizzes` | Full CRUD + publish/duplicate/reorder |
| Analytics dashboard | `public/admin/analytics.html` → `/api/admin/analytics` | Charts + stats |
| Bulk import/export | `public/admin/import-export.html` → `/api/admin/import\|export` | CSV |
| Notifications | `public/admin/notifications.html` → `/api/admin/notifications` | Broadcast + logs |
| Resources | `public/admin/resources.html` → `/api/admin/resources` | Upload/delete |
| Courses | `public/admin/courses.html` → `/api/admin/courses` | Course + lesson CRUD |
| **User management** | **`public/admin/users.html`** → **`/api/admin/users`** | **List, search, filter, promote/demote, ban/activate, delete** |

---

### 10. Admin User Management

| What | File / Route | Notes |
|------|-------------|-------|
| List users (paginated) | `GET /api/admin/users` → `src/routes/adminUsers.js` | Search, role filter, status filter; attempt stats per user |
| Get user detail | `GET /api/admin/users/:id` | Full stats + last 20 attempts |
| Change role | `PATCH /api/admin/users/:id/role` | user ↔ admin; cannot demote self |
| Ban / activate | `PATCH /api/admin/users/:id/status` | Cannot ban self |
| Delete user | `DELETE /api/admin/users/:id` | Also removes all attempts; cannot delete self |
| Delete all user attempts | `DELETE /api/admin/users/:userId/attempts` | Resyncs gamification after |
| Delete quiz attempts for user | `DELETE /api/admin/users/:userId/attempts/:quizId` | Resyncs gamification after |
| Rate limiting | `adminRateLimiter` in `server.js` | 120 req/min |
| UI | `public/admin/users.html` | Full management panel (search, filter, promote, ban, delete) |

---

### 11. Admin Attempt Management

| What | File / Route | Notes |
|------|-------------|-------|
| Delete single attempt | `DELETE /api/admin/attempts/:attemptId` → `src/routes/adminAttempts.js` | Resyncs gamification |
| Delete all attempts for user+quiz | Covered under admin users route | Resyncs gamification |

---

### 12. Bulk Import / Export

| What | File / Route | Notes |
|------|-------------|-------|
| Import quizzes | `POST /api/admin/import/quizzes` → `src/routes/adminImportExport.js` | CSV; `?preview=1` for dry-run |
| Import questions (JSON) | `POST /api/admin/import/questions` | JSON bulk question import |
| Export quizzes | `GET /api/admin/export/quizzes` | CSV download |
| Export attempts | `GET /api/admin/export/attempts` | CSV download |
| Rate limiting | 20 imports per 15 min (via `importRateLimiter`) | Prevents abuse |
| UI | `public/admin/import-export.html` | Drag-and-drop + preview table |

---

### 13. Notification System

| What | File / Route | Notes |
|------|-------------|-------|
| User notifications list | `GET /api/notifications` → `src/routes/notifications.js` | Latest first; unread count |
| Mark one read | `PATCH /api/notifications/:id/read` | — |
| Mark all read | `PATCH /api/notifications/read-all` | — |
| Dismiss notification | `DELETE /api/notifications/:id` | — |
| Admin broadcast | `POST /api/admin/notifications/announce` → `src/routes/adminNotifications.js` | All users or targeted IDs; optional email |
| Admin logs | `GET /api/admin/notifications/logs` | Broadcast audit trail |
| Email delivery | `src/utils/email.js` | Nodemailer + SMTP; silently skipped if `SMTP_HOST` not set |
| Bell widget | `public/js/notifications.js` | In-page badge + dropdown |
| Admin UI | `public/admin/notifications.html` | Compose + send |
| Data stores | `data/notifications.json`, `data/notification-logs.json` | — |
| Rate limiting | 60 req/min per user (user); 10 broadcasts/min (admin) | In-file limiters |

---

### 14. Gamification & Leaderboards

| What | File / Route | Notes |
|------|-------------|-------|
| XP engine | `src/utils/gamification.js` | XP per attempt, weekend bonus (configurable) |
| Tiers | Bronze → Silver → Gold → Diamond | Thresholds: 0 / 100 / 300 / 700 XP |
| Mastery levels | Beginner → Improving → Strong → Mastered | Based on accuracy + quiz count |
| Badges | 6 badges (first-quiz, five-quizzes, perfect-score, 3/7/30-day streak) | Auto-awarded on attempt submit |
| Daily missions | 3 missions/day (complete 2 quizzes, score 80%+, new topic) | XP reward; UTC reset |
| Overall leaderboard | `GET /api/leaderboard/overall` → `src/routes/leaderboard.js` | Rank by mastery + accuracy + streak |
| Streak leaderboard | `GET /api/leaderboard/streak` | — |
| Weekly leaderboard | `GET /api/leaderboard/weekly` | Week-scoped XP ranking |
| Topic leaderboard | `GET /api/leaderboard/topic` | Per-topic accuracy ranking |
| Group leaderboard | `GET /api/leaderboard/group/:groupId` | Study-group member ranking |
| Study groups | `data/groups.json`; `/api/me/groups`; `/api/leaderboard/group/:groupId` | Groups with member lists |
| Gamification bootstrap | `bootstrapGamification()` in `server.js` | Syncs XP/tier for all users on start |
| Achievements UI | `public/achievements.html` | Badge showcase + next milestone + recently unlocked |
| Leaderboard UI | `public/leaderboard.html` | All tabs: overall, weekly, streak, topic, group |
| Config | `data/gamification-config.json` | `weekendBonusMultiplier` tunable |

---

### 15. Courses & Learning Content

| What | File / Route | Notes |
|------|-------------|-------|
| List published courses | `GET /api/courses` → `src/routes/courses.js` | Sorted by last updated |
| Course detail + lessons | `GET /api/courses/:id` | Includes ordered lesson list |
| View lesson (PDF inline) | `GET /api/courses/lessons/:id/view` | Streams PDF with `Content-Disposition: inline` |
| Download lesson | `GET /api/courses/lessons/:id/download` | Triggers browser download |
| Admin course CRUD | `/api/admin/courses` → `src/routes/adminCourses.js` | Create/edit/delete/publish; draft vs published |
| Admin lesson upload | PDF upload via multer (10 MB limit) | Stored in `uploads/lessons/` |
| Lesson ordering | `order` field per lesson; PATCH to reorder | — |
| UI | `public/course.html` | Course viewer |
| Admin UI | `public/admin/courses.html` | Course + lesson management panel |
| Data stores | `data/courses.json`, `data/lessons.json` | — |

---

### 16. Security

| What | Implementation |
|------|---------------|
| CORS allowlist | `src/config.js` → `corsAllowedOrigins`; dynamic validator in `server.js` |
| Helmet | HTTP security headers (`contentSecurityPolicy: false` for CDN compatibility) |
| JWT in HTTP-only cookie | `sameSite: lax`, `secure: true` in production |
| Banned-account check | Auth middleware rejects banned users with 403 |
| Rate limiting | Custom in-memory sliding-window limiter (`src/middlewares/rateLimit.js`) applied to auth, contact, import, and admin endpoints |
| Input validation | Per-route (quiz, profile, auth, resources, courses, notifications) |
| Atomic file writes | Write-queue + temp-file rename in `src/utils/db.js`; prevents partial writes |
| `isAdmin` middleware | Applied to all `/api/admin/*` routes in `server.js` |
| Password hashing | bcrypt, cost factor 10 |
| ReDoS-safe helpers | `stripHtml` in `email.js`, `isValidEmail` in `profile.js` use character-level iteration |
| File upload guards | Mimetype + extension checks on multer for avatar, resource, and lesson uploads |

---

### 17. Miscellaneous

| What | Notes |
|------|-------|
| Contact form | `POST /api/contact`; stores JSONL + forwards via FormSubmit AJAX |
| Content manager | `public/content-manager.html` – standalone form-based JSON editor |
| Vercel config | `vercel.json` – static file redirects |
| `.env.example` | Documents all required and optional env vars |
| Gamification bootstrap | Syncs XP/tier on server start |

---

## 🔜 To Implement (Verified Gaps)

Priority is ranked **High / Medium / Low** based on user impact and platform completeness.

### Priority 1 — High (Core Gaps)

| # | Feature | Gap Evidence |
|---|---------|--------------|
| 1 | **Forgot Password / Reset Password** | No `/api/auth/forgot-password` or `/api/auth/reset-password` route. Users who forget credentials have no self-service recovery path. |
| 2 | **Email Verification on Register** | `POST /api/auth/register` silently accepts any email address. No verification-link flow exists. |
| 3 | **Assignment Submission by Students** | Admin can upload assignments as resources (`/api/admin/resources`), but there is no student-facing submission route. No grading or feedback loop exists. |
| 4 | **Rate Limiting on all API routes** | `src/middlewares/rateLimit.js` is only applied to auth, contact, import, and admin endpoints. Quiz submission (`/api/attempts`), profile updates, and leaderboard reads are unprotected. |

---

### Priority 2 — Medium (Engagement & Polish)

| # | Feature | Gap Evidence |
|---|---------|--------------|
| 5 | **Exam Scheduler & Reminders** | `data/events.json` exists (empty) but no scheduler route or auto-reminder trigger is implemented. |
| 6 | **Full-Text Search** | No search endpoint across quizzes, resources, or courses. |
| 7 | **Teacher / Instructor Role** | Only `user` and `admin` exist in the role system (`src/middlewares/isAdmin.js`). No `teacher` role (create content but not manage users). |
| 8 | **Video Lesson Support** | `adminCourses.js` only accepts `application/pdf` in the multer file filter. No video upload or embed pathway exists. |
| 9 | **Discussion / Q&A Forum** | No discussion thread or per-quiz Q&A feature anywhere in routes or UI. |
| 10 | **PWA / Offline Support** | No `manifest.json`, no service worker, no offline cache. Tailwind is loaded from CDN (not bundled). |

---

### Priority 3 — Low / Future

| # | Feature | Gap Evidence |
|---|---------|--------------|
| 11 | **Third-Party Login (Google OAuth)** | Only email+password auth in `src/routes/auth.js`. |
| 12 | **Two-Factor Authentication (2FA)** | No TOTP or SMS-based 2FA. |
| 13 | **API Documentation (Swagger / OpenAPI)** | No `swagger.json` or auto-generated docs. |
| 14 | **Automated Test Suite** | No `test/` directory, no test framework, no test scripts in `package.json`. |
| 15 | **PDF Export of Results** | Users can download CSV attempts (`/api/admin/export/attempts`) but no formatted PDF report exists. |
| 16 | **Persistent / Distributed Rate Limiting** | The current in-memory limiter (`src/middlewares/rateLimit.js`) resets on server restart and does not share state across multiple processes/instances. A Redis-backed solution would be needed for production scale. |
| 17 | **Vercel API Routes Config** | `vercel.json` only has static redirect rules. A Node.js serverless adapter (e.g., `vercel.json` rewrites to the Express app) is needed for full API functionality on Vercel. |

---

## 🔒 Security Gaps

| Gap | Details |
|-----|---------|
| No password-reset flow | Forgotten passwords are unrecoverable without manual DB edit |
| No email verification | Anyone can register with a fake email; notifications sent to unverified addresses |
| `/uploads` directory is public | `express.static('uploads')` at line 134 of `server.js` exposes all uploaded files (avatars, resources, lessons) without auth. Resources and lessons should be gated behind auth-checked download routes |
| CSP disabled | `contentSecurityPolicy: false` in Helmet (`server.js` line 92) removes XSS mitigation headers for CDN compatibility |
| In-memory rate limiter | State is lost on restart; bypassed with multi-process deployment |
| No audit log for sensitive admin actions | Role changes, bans, and deletes are not logged anywhere beyond the standard console |

---

## 🚀 Deployment Gaps

| Gap | Details |
|-----|---------|
| `vercel.json` incomplete for API | Only static redirects are configured. The Express app needs `"rewrites": [{ "source": "/api/(.*)", "destination": "/server.js" }]` (or equivalent) plus a Vercel serverless adapter to handle API routes. |
| No Dockerfile | No containerisation config; deployment to Docker-based platforms (Render, Railway, DigitalOcean) requires one. |
| JSON file DB not scalable | `data/*.json` files work for a single-process server but break under concurrent writes at scale or multi-process deployment. A real DB (MongoDB Atlas, Supabase, PlanetScale) is needed for production. |
| No CI/CD workflow | No `.github/workflows/` directory. No automated lint, build, or deploy pipeline on push. |
| `CORS_ALLOWED_ORIGINS` not set in production | Defaults to an empty list in non-development mode; the production origin must be explicitly set or all cross-origin API calls will be blocked. |

---

## 🧪 Testing Gaps

| Gap | Details |
|-----|---------|
| No test directory | `package.json` has no `test` script; no Jest/Mocha/Supertest setup. |
| No unit tests | `src/utils/gamification.js` (400+ lines), `src/utils/adaptiveLearning.js` (450+ lines), and `src/utils/leaderboard.js` (344 lines) have zero test coverage. |
| No integration tests | No tests for auth flows, attempt submission, or admin CRUD. |
| No e2e tests | No Playwright/Cypress setup for UI flows. |

---

## 📋 Prioritised Next-Steps Roadmap

```
Sprint 1 (Immediate – Core Stability)   ← CURRENT STATE
├── ✅ JWT auth, user profiles, quiz system
├── ✅ Admin analytics, bulk import/export, notifications
├── ✅ Gamification (XP, tiers, badges, missions, leaderboards)
├── ✅ Admin User Management (API + UI)
├── ✅ Revision System (wrong questions, bookmarks, revision sets)
├── ✅ Adaptive Learning (topic recommendations, priority topics)
├── ✅ Courses & Lessons (PDF upload, view, download)
├── 🔲 Forgot Password / Reset Password flow
└── 🔲 Rate limiting on ALL API routes (quiz submit, profile, leaderboard)

Sprint 2 (User Trust & Safety)
├── 🔲 Email verification on register
├── 🔲 Gate uploads/ behind auth-checked routes (not express.static)
└── 🔲 Assignment submission + admin grading/feedback loop

Sprint 3 (Content & Discovery)
├── 🔲 Full-text search (quizzes, resources, courses)
├── 🔲 Exam scheduler + auto-reminder notifications (use data/events.json)
├── 🔲 Teacher/instructor role (restricted admin)
└── 🔲 Video lesson support (upload + embed)

Sprint 4 (Platform Maturity)
├── 🔲 Automated test suite (Jest + Supertest for routes, utils)
├── 🔲 CI/CD: GitHub Actions (lint + test on PR, deploy on merge)
├── 🔲 PWA: manifest.json + service worker + offline cache
└── 🔲 Discussion / Q&A forum (per quiz or global)

Sprint 5 (Deployment & Scale)
├── 🔲 Migrate to real DB (MongoDB Atlas / Supabase)
├── 🔲 Fix vercel.json for full Express API support
├── 🔲 Dockerfile for container-based deployment
└── 🔲 Persistent rate limiting (Redis-backed)

Sprint 6 (Growth & Extras)
├── 🔲 Google OAuth login
├── 🔲 OpenAPI / Swagger docs
├── 🔲 PDF export of results
└── 🔲 2FA (TOTP)
```

---

## 🗂️ File & Route Quick-Reference

```
server.js                               ← Express entry point, all route mounts
src/
  config.js                             ← Env vars, CORS, JWT, rate limit config
  middlewares/
    auth.js                             ← JWT cookie → req.userId + req.user (DB lookup)
    isAdmin.js                          ← Role check (403 if not admin)
    rateLimit.js                        ← In-memory sliding-window rate limiter
  routes/
    auth.js              /api/auth               ← register, login, logout, me
    quizzes.js           /api/quizzes            ← public quiz list + detail
    attempts.js          /api/attempts           ← start, save, submit, review, insights, list
    revision.js          /api/revision           ← sets, bookmarks, start revision quiz
    me.js                /api/me                 ← missions, progress, groups, recommendation
    rewards.js           /api/rewards            ← XP balance, redemption history
    leaderboard.js       /api/leaderboard        ← overall, streak, weekly, topic, group
    profile.js           /api/profile            ← view/edit, avatar, password, notif prefs
    resources.js         /api/resources          ← public list + download
    courses.js           /api/courses            ← published courses + lesson view/download
    notifications.js     /api/notifications      ← list, mark-read, dismiss
    adminQuizzes.js      /api/admin/quizzes      ← CRUD, publish, duplicate, reorder
    adminAnalytics.js    /api/admin/analytics    ← 6 analytics endpoints
    adminImportExport.js /api/admin              ← import CSV/JSON + export quizzes/attempts
    adminNotifications.js /api/admin/notifications ← broadcast, logs
    adminCourses.js      /api/admin/courses      ← course + lesson CRUD + PDF upload
    adminUsers.js        /api/admin/users        ← list, get, role, status, delete, attempts
    adminAttempts.js     /api/admin/attempts     ← delete individual attempt
    resources.js         /api/admin/resources    ← admin upload/delete
  utils/
    db.js                ← JSON file DB; per-file write queue; atomic temp-file rename
    email.js             ← Nodemailer SMTP wrapper; silent skip if unconfigured
    gamification.js      ← XP, tiers, mastery, badges, missions, streaks engine
    leaderboard.js       ← Leaderboard computation helpers
    adaptiveLearning.js  ← Topic-level performance analysis + quiz recommendations
public/
  index.html             ← Platform home / landing
  dashboard.html         ← User quiz history + stats
  profile.html           ← User profile edit
  quizzes.html           ← Browse all quizzes
  daily-quiz.html        ← Daily random quiz UI
  topic-tests.html       ← Topic-wise test UI
  mock-tests.html        ← Full mock exam with timer
  leaderboard.html       ← All leaderboard tabs (overall, weekly, streak, topic, group)
  achievements.html      ← Badges + daily missions + next milestone
  resources.html         ← Notes/PDF browser + download
  course.html            ← Course & lesson viewer
  content-manager.html   ← Standalone content JSON editor
  admin/
    index.html           ← Admin nav hub
    analytics.html       ← Admin analytics dashboard (Chart.js)
    import-export.html   ← Bulk import/export (CSV/JSON + preview)
    notifications.html   ← Admin broadcast panel
    resources.html       ← Admin resource upload/delete
    courses.html         ← Admin course + lesson CRUD
    users.html           ← Admin user management (search, filter, promote, ban, delete)
  js/
    notifications.js     ← Bell widget (badge + dropdown)
    modules/             ← navbar, progressTracker, questionBank, quizEngine,
                            quizResults, ui, user (shared JS modules)
data/
  users.json             ← User records (id, name, email, passwordHash, role, XP, badges …)
  quizzes.json           ← Quiz + embedded question bank
  attempts.json          ← All quiz attempts
  wrong-questions.json   ← Per-user wrong-question tracking
  bookmarks.json         ← Per-user bookmarked questions
  resources.json         ← Resource metadata
  courses.json           ← Course metadata
  lessons.json           ← Lesson metadata
  notifications.json     ← Per-user in-app notifications
  notification-logs.json ← Admin broadcast audit log
  gamification-config.json ← weekendBonusMultiplier (configurable)
  groups.json            ← Study group definitions + member lists
  events.json            ← Scheduled events (defined, not yet wired to scheduler)
  rewards.json           ← (deprecated – badge-only system now)
  content.json           ← Platform content config
  questions.json         ← Standalone question bank (supplementary)
uploads/
  avatars/               ← User profile images (served via express.static)
  resources/             ← Admin-uploaded notes/PDFs
  lessons/               ← Course lesson PDFs
```
