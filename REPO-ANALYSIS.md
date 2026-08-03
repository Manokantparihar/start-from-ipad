# Repository Analysis: RPSC/REET Exam Preparation Platform

> **Generated:** April 2026 | **Branch:** main | **Version:** 2.0  
> Full read-only audit of implemented features vs. pending items — with evidence (key files, routes, pages).  
> Security, deployment, and testing gaps are called out explicitly.

---

## ✅ Implemented Features / Modules

### 1. Authentication & Session Management

| What | Evidence (File / Route) | Notes |
|------|------------------------|-------|
| Register | `POST /api/auth/register` → `src/routes/auth.js:40` | Email + bcrypt hash (cost 10); min 6-char password |
| Login | `POST /api/auth/login` → `src/routes/auth.js:84` | JWT stored in `httpOnly` cookie (7 days) |
| Logout | `POST /api/auth/logout` → `src/routes/auth.js:175` | Clears cookie |
| Current user | `GET /api/auth/me` → `src/routes/auth.js:137` | Re-reads fresh role from DB; includes gamification fields |
| Auth middleware | `src/middlewares/auth.js` | Verifies JWT, sets `req.userId` + `req.user`; rejects banned users |
| Admin guard | `src/middlewares/isAdmin.js` | 403 for non-admin; checked against DB role (not token) |
| Rate limiting | `src/middlewares/rateLimit.js` | In-memory sliding window; auth: 25/15 min; contact: 5/15 min; import: 20/15 min; admin: 120/min |
| Config | `src/config.js` | All env vars centralised; throws at start if `JWT_SECRET` missing in production |

**Implemented security:** banned-account check on every authenticated request; `secure` cookie in production; `sameSite: lax`.

**Known gaps:** No forgot-password / reset-password flow (email template exists in `src/utils/email.js:153` but no route). No email verification on register. No 2FA.

---

### 2. User Profile

| What | Evidence (File / Route) | Notes |
|------|------------------------|-------|
| View profile | `GET /api/profile` → `src/routes/profile.js:67` | Returns user + gamification snapshot |
| Edit profile | `PUT /api/profile` → `src/routes/profile.js:93` | Name, email; ReDoS-safe email validator |
| Change password | `PUT /api/profile/password` → `src/routes/profile.js:153` | bcrypt verify current → re-hash new |
| Avatar upload | `POST /api/profile/avatar` → `src/routes/profile.js:218` | multer; JPEG/PNG/WebP/GIF ≤ 2 MB; replaces old file |
| Email notif prefs | `PATCH /api/profile/notifications` → `src/routes/profile.js:192` | `emailNotifications` boolean flag |
| UI page | `public/profile.html` | Edit form + avatar + password change |

---

### 3. Quiz System

| What | Evidence (File / Route) | Notes |
|------|------------------------|-------|
| Public quiz list | `GET /api/quizzes` → `src/routes/quizzes.js:7` | Published only; strips correct answers |
| Public quiz detail | `GET /api/quizzes/:id` → `src/routes/quizzes.js:22` | Strips correct answers |
| Start attempt | `POST /api/attempts` → `src/routes/attempts.js` | Creates in-progress attempt with timer |
| Submit attempt | `PATCH /api/attempts/:id` → `src/routes/attempts.js:679` | Grades, records XP/badges via gamification engine |
| Review attempt | `GET /api/attempts/:id/review` → `src/routes/attempts.js` | Per-question breakdown with correct answers; auth-protected |
| List attempts | `GET /api/attempts` → `src/routes/attempts.js` | Paginated; `?type` / `?status` filters |
| Adaptive recommendation | `GET /api/me/recommendation` → `src/routes/me.js:98` | Picks next quiz based on topic priority score |
| Admin quiz CRUD | `src/routes/adminQuizzes.js` mounted at `/api/admin/quizzes` | Create/edit/publish/duplicate/soft-delete/hard-delete/reorder |
| Admin input sanitisation | `src/routes/adminQuizzes.js:98` | `<` / `>` stripped from all string fields |
| Quiz modes | `public/daily-quiz.html`, `public/topic-tests.html`, `public/mock-tests.html`, `public/quizzes.html` | Daily / topic / mock / all-quizzes UIs |

---

### 4. User Dashboard & Progress

| What | Evidence (File / Route) | Notes |
|------|------------------------|-------|
| Attempt history | `GET /api/attempts` (paginated) | Enriches with percent/maxScore/type/date |
| Gamification snapshot | `GET /api/me/progress` → `src/routes/me.js:54` | XP, tier, streak, badges, weekly XP |
| Daily missions | `GET /api/me/missions` → `src/routes/me.js:27` | 3 missions; reset at UTC midnight |
| Group membership + rank | `GET /api/me/groups` → `src/routes/me.js:128` | User's study groups + top 3 members + own rank |
| Adaptive priority topics | `GET /api/me/progress` → `src/utils/adaptiveLearning.js` | Top-5 weak topics with priority score |
| XP balance | `GET /api/rewards` → `src/routes/rewards.js:7` | Balance + redemption history; reward shop is **retired** |
| Dashboard UI | `public/dashboard.html` | Quiz history, stats, export |

---

### 5. Revision System

| What | Evidence (File / Route) | Notes |
|------|------------------------|-------|
| Revision set metadata | `GET /api/revision/sets` → `src/routes/revision.js:182` | lastWrong / weakTopic / retryWrong / retryUnattempted |
| Revision set questions | `GET /api/revision/sets/:setType` → `src/routes/revision.js:240` | Returns questions with full detail + correct answers |
| Start revision attempt | `POST /api/revision/sets/:setType/start` → `src/routes/revision.js:372` | Creates timed attempt from revision set |
| Add bookmark | `POST /api/revision/bookmarks` → `src/routes/revision.js:279` | Saves question bookmark for user |
| Remove bookmark | `DELETE /api/revision/bookmarks/:questionId` → `src/routes/revision.js:307` | — |
| List bookmarks | `GET /api/revision/bookmarks` → `src/routes/revision.js:328` | Full question detail |
| Check bookmark | `GET /api/revision/bookmarks/check/:questionId` → `src/routes/revision.js:446` | Boolean |
| Wrong-question tracking | `src/utils/db.js` → `data/wrong-questions.json` | Stored per user/quiz on attempt submit |
| Bookmark store | `src/utils/db.js` → `data/bookmarks.json` | — |

---

### 6. Adaptive Learning Engine

| What | Evidence (File) | Notes |
|------|----------------|-------|
| Topic stats builder | `src/utils/adaptiveLearning.js:72` | Accuracy, recency, wrong-rate, bookmark boost; multi-signal priority score |
| Revision recommendation | `src/utils/adaptiveLearning.js:260` | Triggers if accuracy < 65% or recent wrongs ≥ 2 or 7+ days since practice |
| Practice recommendation | `src/utils/adaptiveLearning.js:312` | Selects best-matching published quiz for weakest topic |
| API exposure | `GET /api/me/recommendation`, `GET /api/me/progress` | `recommendation`, `priorityTopics`, `adaptiveSummary` in response |

---

### 7. Gamification & Leaderboards

| What | Evidence (File / Route) | Notes |
|------|------------------------|-------|
| XP engine | `src/utils/gamification.js` | XP per correct answer; weekend bonus (configurable via `data/gamification-config.json`) |
| Tiers | Bronze / Silver / Gold / Diamond | Thresholds at 0 / 100 / 300 / 700 XP |
| Mastery levels | Beginner / Improving / Strong / Mastered | Based on accuracy + completed quiz count |
| Streak tracking | current / best / freeze slot | Computed from UTC calendar days |
| Badges (8+) | `src/utils/gamification.js:40` | first-quiz, 5-quizzes, perfect-score, 3/7/30-day streak; auto-awarded on submit |
| Daily missions | 3 per day; reset UTC midnight | complete-two-quizzes, score-80-plus, new-topic |
| Events | `data/events.json` | Time-boxed bonus XP + badge rewards (Geography Week, Mock Marathon, Weekend Challenge) |
| Groups | `data/groups.json` | Study groups with member arrays; group leaderboard |
| Overall leaderboard | `GET /api/leaderboard/overall` → `src/routes/leaderboard.js:36` | — |
| Streak leaderboard | `GET /api/leaderboard/streak` | — |
| Weekly leaderboard | `GET /api/leaderboard/weekly` | — |
| Topic leaderboard | `GET /api/leaderboard/topic` | Per-topic accuracy ranking; topic list if no topic given |
| Group leaderboard | `GET /api/leaderboard/group/:groupId` | Study group ranking |
| Gamification sync | `bootstrapGamification()` in `server.js:224` | Re-syncs all users on server start |
| Achievements UI | `public/achievements.html` | Badges + missions |
| Leaderboard UI | `public/leaderboard.html` | All tabs (overall / streak / weekly / topic) |

**Reward shop:** data file `data/rewards.json` exists with 5 reward items, but the API (`GET /api/rewards`) returns `rewardShopEnabled: false` and `POST /api/rewards/redeem` returns 410 Gone. The shop has been **retired**; the data file is effectively unused.

---

### 8. Admin User Management

| What | Evidence (File / Route) | Notes |
|------|------------------------|-------|
| List users (paginated) | `GET /api/admin/users` → `src/routes/adminUsers.js:125` | search, role, status filters; attempt stats per user |
| Get user detail | `GET /api/admin/users/:id` → `src/routes/adminUsers.js:203` | Last 20 attempts; no password hash exposed |
| Promote / demote role | `PATCH /api/admin/users/:id/role` → `src/routes/adminUsers.js:292` | user ↔ admin; cannot demote self |
| Ban / unban | `PATCH /api/admin/users/:id/status` → `src/routes/adminUsers.js:324` | cannot ban self |
| Delete user | `DELETE /api/admin/users/:id` → `src/routes/adminUsers.js:356` | Permanently deletes user + their attempts |
| Delete user's attempts | `DELETE /api/admin/users/:userId/attempts` | All or per-quiz |
| Rate limit | admin rate limiter (120/min) applied at `server.js:118` | — |
| UI page | `public/admin/users.html` | Search, role/status filter, promote/ban/delete actions |

---

### 9. Admin Analytics & Reporting

| What | Evidence (File / Route) | Notes |
|------|------------------------|-------|
| Overview totals | `GET /api/admin/analytics/overview` → `src/routes/adminAnalytics.js:80` | Users, quizzes, attempts, avg score |
| Per-quiz stats | `GET /api/admin/analytics/quiz-stats` | Attempt counts + avg score; sorted by most attempted |
| Score distribution | `GET /api/admin/analytics/score-distribution` | 5 buckets (0–20, 21–40, …, 81–100%) |
| Top/bottom scorers | `GET /api/admin/analytics/user-stats` | Username only (no email/password leak) |
| Attempts over time | `GET /api/admin/analytics/attempts-over-time?period=daily\|weekly\|monthly` | — |
| Recent activity feed | `GET /api/admin/analytics/recent-activity?limit=N` | Last N completed attempts (max 100) |
| UI page | `public/admin/analytics.html` | Chart.js powered |

---

### 10. Resources (Notes / PDFs / Assignments)

| What | Evidence (File / Route) | Notes |
|------|------------------------|-------|
| Admin upload | `POST /api/admin/resources` → `src/routes/resources.js:60` | PDF only; ≤ 10 MB; saved to `uploads/resources/` |
| Admin soft-delete | `DELETE /api/admin/resources/:id` → `src/routes/resources.js:201` | Sets `isDeleted: true` |
| Public list | `GET /api/resources` → `src/routes/resources.js:118` | Metadata; no file path exposed |
| Inline view | `GET /api/resources/:id/view` | Streams PDF inline in browser |
| Download | `GET /api/resources/:id/download` | Force-download or `?inline=1` |
| Metadata store | `data/resources.json` | accessTier, visibility, uploadedBy, size |
| User UI | `public/resources.html` | Browse + view + download |
| Admin UI | `public/admin/resources.html` | Upload + delete |

---

### 11. Courses & Learning Content

| What | Evidence (File / Route) | Notes |
|------|------------------------|-------|
| List published courses | `GET /api/courses` → `src/routes/courses.js:62` | Sorted by updatedAt |
| Course detail | `GET /api/courses/:id` → `src/routes/courses.js:88` | Includes ordered lesson list |
| View lesson (PDF) | `GET /api/courses/lessons/:id/view` | Streams PDF inline; verifies parent course is published |
| Download lesson | `GET /api/courses/lessons/:id/download` | Force-download |
| Admin course CRUD | `src/routes/adminCourses.js` at `/api/admin/courses` | Create/edit/publish/delete (soft); cascade-deletes lessons |
| Admin lesson upload | `POST /api/admin/courses/lessons` | PDF ≤ 10 MB; types: pdf/note/current-affairs/schedule |
| Lesson reorder | `PATCH /api/admin/courses/lessons/:id/move` | up / down |
| File replace | `PATCH /api/admin/courses/lessons/:id/replace-file` | Deletes old file on disk |
| Metadata stores | `data/courses.json`, `data/lessons.json` | — |
| Upload storage | `uploads/lessons/` (6 PDFs in repo) | — |
| UI | `public/course.html` | Course + lesson viewer |
| Admin UI | `public/admin/courses.html` | Full course + lesson management |

---

### 12. Bulk Import / Export

| What | Evidence (File / Route) | Notes |
|------|------------------------|-------|
| Import quizzes (CSV) | `POST /api/admin/import/quizzes` → `src/routes/adminImportExport.js` | `?preview=1` for dry-run |
| Import quizzes (JSON) | `POST /api/admin/import/quizzes/json` | JSON batch import |
| Export quizzes | `GET /api/admin/export/quizzes` | CSV download |
| Export attempts | `GET /api/admin/export/attempts` | CSV download |
| Rate limiting | 20 imports per 15 min | Prevents CSV-bomb abuse |
| UI | `public/admin/import-export.html` | Drag-and-drop + preview table |

---

### 13. Notification System

| What | Evidence (File / Route) | Notes |
|------|------------------------|-------|
| User notifications list | `GET /api/notifications` → `src/routes/notifications.js:51` | Latest first; unreadCount |
| Mark one read | `PATCH /api/notifications/:id/read` | — |
| Mark all read | `PATCH /api/notifications/read-all` | — |
| Dismiss | `DELETE /api/notifications/:id` | — |
| Admin broadcast | `POST /api/admin/notifications/announce` → `src/routes/adminNotifications.js:44` | In-app + optional email; per-user or all |
| Recipient list | `GET /api/admin/notifications/users` | Name/email for "select recipients" UI |
| Admin broadcast logs | `GET /api/admin/notifications/logs` | Audit trail (delivery counts, email errors) |
| Email delivery | `src/utils/email.js` | Nodemailer + SMTP; silently skips if `SMTP_HOST` not set |
| Email templates | `src/utils/email.js:115` | new-content, result, announcement, password-reset |
| Bell widget | `public/js/notifications.js` | In-page badge + dropdown |
| Admin UI | `public/admin/notifications.html` | Compose + send + view logs |
| Data stores | `data/notifications.json`, `data/notification-logs.json` | — |

---

### 14. Admin Attempt Management

| What | Evidence (File / Route) | Notes |
|------|------------------------|-------|
| Delete single attempt | `DELETE /api/admin/attempts/:attemptId` → `src/routes/adminAttempts.js:60` | Clears stale revision data; re-syncs gamification |
| Admin rate limit | 120 req/min (shared with `/api/admin/users`) | — |

---

### 15. Contact Form

| What | Evidence | Notes |
|------|----------|-------|
| Contact endpoint | `POST /api/contact` → `server.js:190` | Stores JSONL + forwards via FormSubmit AJAX |
| Rate limit | 5 req/15 min (`contactRateLimiter`) | — |
| Storage | `data/contact-submissions.jsonl` | — |

---

### 16. Misc / Infrastructure

| What | Notes |
|------|-------|
| JSON file DB | `src/utils/db.js` — per-file write queue + temp-file atomic rename |
| Content manager | `public/content-manager.html` — standalone form-based JSON editor |
| Content validation tool | `tools/validate-content.mjs` — CLI validator |
| Vercel config | `vercel.json` — serverless deployment ready |
| `.env.example` | All required env vars documented |
| Static PDFs | `public/pdfs/` (bed-notes.pdf, ssc-notes.pdf) |
| OG image | `og-image.svg`, `tools/og-image-export.html` |

---

## 🔜 Pending / Missing Items

Priority ranked **High / Medium / Low** by user impact and platform completeness.

### Priority 1 — High (Core Gaps)

| # | Feature | Evidence of Absence | Impact |
|---|---------|---------------------|--------|
| 1 | **Forgot Password / Reset Password** | No route in `src/routes/auth.js`; email template (`buildPasswordResetEmail`) exists unused in `src/utils/email.js:153` | Users locked out permanently if they forget password |
| 2 | **Email Verification on Register** | `POST /api/auth/register` creates account instantly; no verification token or email step | Anyone can register with any email; no ownership proof |
| 3 | **Assignment Submission by Students** | Resources module only allows admin upload. No user-facing upload route, no status/feedback loop | Assignments are one-way; no student submissions possible |
| 4 | **API-Wide Rate Limiting** | Only `/api/auth`, `/api/contact`, `/api/admin/import`, `/api/admin/users` (admin) are rate-limited; quiz submit, profile update, and most other routes have no limit | Abuse / brute-force risk on unprotected routes |

---

### Priority 2 — Medium (Engagement & Polish)

| # | Feature | Evidence of Absence | Impact |
|---|---------|---------------------|--------|
| 5 | **Exam Scheduler & Reminders** | No cron, `setInterval`, or scheduler anywhere in codebase | Cannot auto-notify users about upcoming quizzes/deadlines |
| 6 | **Full-Text Search** | No search endpoint for quizzes, resources, or courses in user-facing routes | Discovery degrades as content grows |
| 7 | **Teacher / Instructor Role** | Only `user` and `admin` in `src/middlewares/isAdmin.js`; no `teacher` guard | Teachers must be full admins (all or nothing) |
| 8 | **Video Content Support** | `VALID_LESSON_TYPES` in `src/routes/adminCourses.js:13` = `['pdf', 'note', 'current-affairs', 'schedule']`; no video type; `multer` rejects non-PDF files | Courses limited to PDF lessons |
| 9 | **Discussion / Q&A Forum** | No discussion-related routes or data files | No community interaction layer |
| 10 | **PWA / Offline Support** | No `manifest.json`, no `sw.js`, no offline cache; Tailwind loaded from CDN | Cannot install as app; no offline capability |
| 11 | **Notification Delivery Queue** | Admin broadcast loops users synchronously in `src/routes/adminNotifications.js:82`; no queue (BullMQ/Redis) | Large user bases will cause slow responses or timeouts |

---

### Priority 3 — Low / Future

| # | Feature | Evidence of Absence | Impact |
|---|---------|---------------------|--------|
| 12 | **Third-Party Login (Google OAuth)** | `src/routes/auth.js` — email+password only | Higher onboarding friction |
| 13 | **Two-Factor Authentication (2FA)** | Not present anywhere | Weaker account security |
| 14 | **API Documentation (Swagger / OpenAPI)** | No `swagger.json` or `openapi.yaml` | Harder for future integrators |
| 15 | **Automated Test Suite** | No `test/` directory; no test runner in `package.json#scripts` | No regression safety net |
| 16 | **Previous Year Papers / PDF solutions** | Mentioned in `PLATFORM-GUIDE.md` but no route or data model | Planned content not delivered |
| 17 | **AI Question Recommendations** | Adaptive learning picks a quiz by topic; no ML or embedding-based ranking | Basic; no NLP-level personalisation |
| 18 | **Export Results as PDF** | `GET /api/admin/export/attempts` exports CSV only | No formatted PDF certificates or report cards |
| 19 | **Reward Shop** | `data/rewards.json` has 5 reward definitions; API returns `rewardShopEnabled: false`; redeem returns 410 | Dead data file; should be cleaned up or re-enabled |
| 20 | **Audit / Admin Action Logs** | No trail for quiz edits, resource deletions, or user role changes (only notification broadcasts are logged) | No accountability for admin actions |

---

## 🔒 Security Gaps

| Gap | Details |
|-----|---------|
| **No rate limit on most routes** | Quiz submit, profile update, revision, leaderboard, courses, resources endpoints are unprotected against flooding. Extend `createRateLimiter` to these routes. |
| **ContentSecurityPolicy disabled** | `server.js:92` sets `contentSecurityPolicy: false` in Helmet for CDN compatibility. A proper CSP would mitigate XSS. |
| **No CSRF protection** | JWT in an `httpOnly` cookie mitigates JS-based theft but `sameSite: lax` does not prevent subresource-based CSRF for GET requests. State-changing POST/PATCH/DELETE routes lack CSRF tokens. |
| **Uploads served from public `/uploads`** | `server.js:134` serves the entire `uploads/` directory as static files. Any file whose name is guessed is directly downloadable, bypassing access-tier / visibility logic in resources.json. |
| **In-memory rate limiter** | `src/middlewares/rateLimit.js` stores counters in a `Map`; resets on server restart; does not work across multiple processes / Vercel serverless instances. |
| **No input length cap on contact endpoint** | `POST /api/contact` does not validate `name`, `email`, or `message` length, allowing large payloads (up to `payloadLimit: 100kb`). |
| **No account lockout** | Failed login attempts are rate-limited at 25/15 min, but there is no per-account lockout or CAPTCHA. |
| **JWT secret falls back in dev** | `src/config.js:39` generates a process-scoped SHA-256 secret when `JWT_SECRET` is unset in development. Safe for local use; ensure production always sets `JWT_SECRET`. |

---

## 🚀 Deployment Gaps

| Gap | Details |
|-----|---------|
| **No structured logging** | Only `console.log/warn/error`; no `winston`, `pino`, or request-level logging (e.g. `morgan`). Difficult to monitor in production. |
| **No health-check endpoint** | No `GET /health` or `GET /ready` route for load balancers or uptime monitors. |
| **JSON file database** | `src/utils/db.js` reads/writes plain JSON files. Fine for a single-process server but will not scale horizontally, has no backup, and loses data if the file is corrupted mid-write (mitigated by temp-file rename, but not zero-risk). |
| **Vercel serverless incompatibility** | `vercel.json` redirects to `index.html` but the Express server expects persistent state (rate-limit Map, write queues). Serverless deployments reset these on every invocation. |
| **No Dockerfile or CI/CD** | No `Dockerfile`; no `.github/workflows/` CI; no lint/test automation on PRs. |
| **`uploads/` not persisted on Vercel** | Uploaded files (`uploads/resources/`, `uploads/lessons/`, `uploads/avatars/`) live on the local filesystem. Vercel's ephemeral filesystem will lose them on re-deploy. Needs object storage (S3 / R2 / Supabase Storage). |
| **No SMTP configuration check at startup** | Email silently skips if unconfigured, but no startup warning beyond a per-send `console.warn`. |

---

## 🧪 Testing Gaps

| Gap | Details |
|-----|---------|
| **No test framework** | `package.json` has no `jest`, `mocha`, `supertest`, or any other test dependency. No `test/` directory exists. |
| **No unit tests** | Complex utilities (`gamification.js`, `adaptiveLearning.js`, `leaderboard.js`, `db.js`) have zero test coverage. |
| **No integration tests** | No HTTP-level tests for any route (auth, quiz submit, admin actions). |
| **No e2e tests** | No Playwright / Cypress / Puppeteer tests for UI flows. |
| **Manual-only test docs** | `docs/leaderboard-streak-manual-tests.md` describes manual steps; automated equivalent does not exist. |
| **No linter** | No ESLint / Prettier config; code style is inconsistent in places. |

---

## 📋 Prioritised Next-Steps Roadmap

```
Sprint 1 (Immediate – Security & Stability)
├── ✅ [done] JWT auth, user profiles, quiz system
├── ✅ [done] Admin analytics, bulk import/export, notifications
├── ✅ [done] Gamification (XP, badges, leaderboards, events, groups)
├── ✅ [done] Admin User Management (users.html + /api/admin/users)
├── ✅ [done] Revision system (wrong questions, bookmarks, revision sets)
├── ✅ [done] Adaptive learning (topic priority, recommendations)
├── 🔲 Extend rate limiting to quiz, profile, revision, resources routes
└── 🔲 Fix uploads served from public static (proxy downloads via route, check visibility)

Sprint 2 (User Trust & Safety)
├── 🔲 Forgot Password / Reset Password (route + token + email)
├── 🔲 Email verification on register (token + confirm endpoint)
└── 🔲 CSRF protection (double-submit cookie or synchroniser token)

Sprint 3 (Content & Discovery)
├── 🔲 Assignment submission by students + admin grading/feedback
├── 🔲 Full-text search (quizzes, resources, courses)
├── 🔲 Exam scheduler + auto-reminder notifications (cron/BullMQ)
└── 🔲 Teacher/instructor role (restricted admin scope)

Sprint 4 (Infrastructure & Quality)
├── 🔲 Migrate file storage to object store (S3 / R2) for Vercel compatibility
├── 🔲 Structured logging (pino or winston) + /health endpoint
├── 🔲 Automated test suite (Jest + Supertest)
├── 🔲 CI/CD: GitHub Actions (lint + test on every PR)
└── 🔲 Notification broadcast queue (BullMQ/Redis) for large user bases

Sprint 5 (Platform Maturity)
├── 🔲 PWA: manifest.json + service worker + offline cache
├── 🔲 Video lesson support (upload + stream / embed)
├── 🔲 Discussion / Q&A forum (per-quiz threads)
└── 🔲 Clean up or re-enable reward shop (data/rewards.json currently orphaned)

Sprint 6 (Growth & Extras)
├── 🔲 Google OAuth / third-party login
├── 🔲 OpenAPI / Swagger documentation
├── 🔲 PDF export of quiz results / certificates
└── 🔲 AI-powered question recommendations (ML / embeddings)
```

---

## 🗂️ File & Route Quick-Reference

```
server.js                                   ← Express entry; all route mounts; gamification bootstrap
src/
  config.js                                 ← Env vars, CORS allowlist, JWT, rate limit config
  middlewares/
    auth.js                                 ← JWT cookie → req.userId + req.user; ban check
    isAdmin.js                              ← Role check (403 if not admin)
    rateLimit.js                            ← In-memory sliding window rate limiter
  routes/
    auth.js              /api/auth          ← register, login, logout, me
    quizzes.js           /api/quizzes       ← public quiz list + detail (no answers)
    attempts.js          /api/attempts      ← start, submit, review, list; gamification trigger
    revision.js          /api/revision      ← wrong-question sets, bookmarks, start revision attempt
    profile.js           /api/profile       ← view/edit, avatar, password, email notif pref
    leaderboard.js       /api/leaderboard   ← overall, streak, weekly, topic, group
    me.js                /api/me            ← missions, progress, recommendation, groups
    rewards.js           /api/rewards       ← XP balance (shop retired)
    resources.js         /api/resources     ← public list, view, download
    courses.js           /api/courses       ← published courses + lesson stream/download
    notifications.js     /api/notifications ← list, mark-read, dismiss
    adminQuizzes.js      /api/admin/quizzes ← CRUD, publish/unpublish, duplicate, reorder
    adminAnalytics.js    /api/admin/analytics ← 6 analytics endpoints
    adminImportExport.js /api/admin         ← CSV/JSON import; CSV export quizzes/attempts
    adminNotifications.js /api/admin/notifications ← broadcast + logs + recipient list
    adminCourses.js      /api/admin/courses ← course + lesson CRUD, file replace, reorder
    adminUsers.js        /api/admin/users   ← list, detail, role, status, delete, clear attempts
    adminAttempts.js     /api/admin/attempts ← delete single attempt + gamification re-sync
    resources.js (admin) /api/admin/resources ← admin upload / soft-delete
  utils/
    db.js                                   ← JSON file DB; write queue + atomic temp-file rename
    email.js                                ← Nodemailer SMTP; 4 email templates
    gamification.js                         ← XP, tiers, mastery, badges, missions, events, groups
    leaderboard.js                          ← Leaderboard scoring + viewer highlight helpers
    adaptiveLearning.js                     ← Topic priority score; revision/practice recommendation
public/
  index.html              ← Home / landing page
  dashboard.html          ← User quiz history + stats
  profile.html            ← Profile edit + avatar + password
  quizzes.html            ← Browse + take all quizzes
  daily-quiz.html         ← Daily quiz UI
  topic-tests.html        ← Topic-wise test UI
  mock-tests.html         ← Full mock exam + timer
  leaderboard.html        ← All leaderboard tabs
  achievements.html       ← Badges + missions
  resources.html          ← Notes/PDF browse + download
  course.html             ← Course + lesson viewer
  details.html            ← Content detail page
  content-manager.html    ← Standalone JSON content editor
  js/
    notifications.js      ← Bell widget (badge + dropdown)
    modules/              ← navbar, progressTracker, questionBank, quizEngine, quizResults, ui, user
  admin/
    index.html            ← Admin nav hub
    analytics.html        ← Analytics dashboard (Chart.js)
    import-export.html    ← Bulk import/export UI
    notifications.html    ← Broadcast panel + logs
    resources.html        ← Resource upload/delete
    courses.html          ← Course + lesson CRUD
    users.html            ← User list, search, promote/ban/delete
data/
  users.json              ← User records (id, name, email, passwordHash, role, XP, tier, badges …)
  quizzes.json            ← Quiz + question bank
  attempts.json           ← All quiz attempts (in-progress + completed + expired)
  resources.json          ← Resource metadata
  courses.json            ← Course metadata
  lessons.json            ← Lesson metadata
  notifications.json      ← Per-user in-app notifications
  notification-logs.json  ← Admin broadcast audit log
  gamification-config.json ← weekendBonusMultiplier (and future config)
  groups.json             ← Study group definitions + member lists
  events.json             ← Time-boxed bonus XP events
  rewards.json            ← ⚠ Orphaned — reward shop retired; rewardShopEnabled: false
  wrong-questions.json    ← Per-user wrong-question tracking for revision
  bookmarks.json          ← Per-user question bookmarks
  contact-submissions.jsonl ← Contact form submissions (JSONL)
  content.json            ← Static content for resources/details pages
uploads/
  avatars/                ← User avatar images (gitignored except .gitkeep)
  resources/              ← Admin-uploaded PDFs (3 files in repo)
  lessons/                ← Course lesson PDFs (6 files in repo)
```
