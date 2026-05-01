# Repository Analysis: RPSC/REET Exam Preparation Platform

> **Generated:** April 11, 2026 | **Branch:** `main` | **App Version:** 2.0.0  
> **Stack:** Node.js + Express 5, JSON file DB, Tailwind CSS, Vercel deployment target  
> Full read-only audit — implemented features, gaps, technical debt, security & deployment issues, and prioritised next-steps roadmap.

---

## ✅ Module 1 — Authentication & User Management

**Evidence:** `src/routes/auth.js`, `src/middlewares/auth.js`, `src/middlewares/isAdmin.js`

| Endpoint | Route | Notes |
|----------|-------|-------|
| Register | `POST /api/auth/register` | Email normalisation, bcrypt (cost 10), duplicate-email check, rate-limited |
| Login | `POST /api/auth/login` | JWT in HttpOnly cookie (7 d), ban status checked, rate-limited |
| Session check | `GET /api/auth/me` | Re-reads live role + ban status from DB; no-cache headers set |
| Logout | `POST /api/auth/logout` | Clears cookie |
| Auth middleware | `src/middlewares/auth.js` | JWT verify → DB lookup → ban check → `req.userId` + `req.user` |
| Admin guard | `src/middlewares/isAdmin.js` | 403 if `req.user.role !== 'admin'` |
| Rate limiting | `src/middlewares/rateLimit.js` | Auth mutations: 25 req / 15 min per IP; session checks: 120 req / min |

---

## ✅ Module 2 — User Profile

**Evidence:** `src/routes/profile.js`, `public/profile.html`

| Endpoint | Notes |
|----------|-------|
| `GET /api/profile` | Returns user fields + gamification summary; strips password |
| `PUT /api/profile` | Update name and/or email; uniqueness check; max-length guard |
| `PUT /api/profile/password` | Requires current password; min 6 chars; reuse check |
| `PATCH /api/profile/notifications` | Email opt-in toggle (boolean) |
| `POST /api/profile/avatar` | multer; JPEG/PNG/WebP/GIF; 2 MB limit; stored in `uploads/avatars/` |

---

## ✅ Module 3 — Quiz Engine (User-facing)

**Evidence:** `src/routes/quizzes.js`, `public/quizzes.html`, `public/daily-quiz.html`, `public/topic-tests.html`, `public/mock-tests.html`

| Endpoint | Notes |
|----------|-------|
| `GET /api/quizzes` | Published-only list; **correct answers stripped** |
| `GET /api/quizzes/:id` | Full quiz (questions + options); **correct answers stripped** |

Quiz modes supported: `daily`, `topic`, `mock`. Per-question `marks` and `negativeMarks` fields present in data model.

---

## ✅ Module 4 — Quiz Engine (Admin)

**Evidence:** `src/routes/adminQuizzes.js`, `public/admin/index.html`

| Endpoint | Notes |
|----------|-------|
| `GET /api/admin/quizzes` | Full list including drafts/deleted; `?search`, `?mode`, `?topic`, `?status` filters |
| `GET /api/admin/quizzes/:id` | Full quiz with correct answers |
| `POST /api/admin/quizzes` | Create quiz; server-side validation + HTML sanitisation |
| `PUT /api/admin/quizzes/:id` | Full update |
| `PATCH /api/admin/quizzes/:id/publish` | Toggle `isPublished` |
| `POST /api/admin/quizzes/:id/duplicate` | Clone as draft |
| `PATCH /api/admin/quizzes/:id/reorder` | Reorder questions by ID array or full object array |
| `DELETE /api/admin/quizzes/:id` | Soft-delete; `?hard=1` for permanent deletion |

---

## ✅ Module 5 — Quiz Attempt System

**Evidence:** `src/routes/attempts.js`, `public/dashboard.html`

| Endpoint | Notes |
|----------|-------|
| `POST /api/attempts` | Start a new attempt; sets `expiresAt` from quiz `timeLimit` |
| `PATCH /api/attempts/:id` | Submit answers; grades quiz; records wrong questions; triggers gamification sync |
| `GET /api/attempts` | Paginated attempt history; `?type`, `?status`, `?page` filters |
| `GET /api/attempts/:id/review` | Per-question breakdown with correct answers, topic buckets, explanation |

All attempt routes require authentication. Gamification (XP, badges, streaks, missions, leaderboard) is re-synced on every submission.

---

## ✅ Module 6 — Admin User Management

**Evidence:** `src/routes/adminUsers.js`, `public/admin/users.html`  
Mounted at `/api/admin/users` (auth + isAdmin + adminRateLimiter in `server.js:118-120`).

| Endpoint | Notes |
|----------|-------|
| `GET /api/admin/users` | Paginated, searchable, filterable by role/status; attempt stats pre-computed in O(attempts) |
| `GET /api/admin/users/:id` | Full user detail + recent 20 attempts |
| `PATCH /api/admin/users/:id/role` | Promote/demote (`user` ↔ `admin`); self-demotion blocked |
| `PATCH /api/admin/users/:id/status` | Ban / activate; self-ban blocked |
| `DELETE /api/admin/users/:id` | Permanent delete; also removes attempts; self-delete blocked |
| `DELETE /api/admin/users/:userId/attempts` | Wipe all attempts for a user; syncs gamification |
| `DELETE /api/admin/users/:userId/attempts/:quizId` | Wipe quiz-specific attempts; syncs gamification |

---

## ✅ Module 7 — Admin Attempt Management

**Evidence:** `src/routes/adminAttempts.js`  
Mounted at `/api/admin/attempts` (auth + isAdmin + adminRateLimiter).

| Endpoint | Notes |
|----------|-------|
| `DELETE /api/admin/attempts/:attemptId` | Delete single attempt; clears stale revision data; syncs gamification |

---

## ✅ Module 8 — Resources (Notes / PDFs / Assignments)

**Evidence:** `src/routes/resources.js`, `public/resources.html`, `public/admin/resources.html`

| Endpoint | Notes |
|----------|-------|
| `POST /api/admin/resources` | Admin-only; PDF only; 10 MB limit; UUID filename |
| `DELETE /api/admin/resources/:id` | Soft-delete (sets `isDeleted: true`) |
| `GET /api/resources` | Public list; metadata only (no file stream) |
| `GET /api/resources/:id/download` | Force-download; public, no auth required |
| `GET /api/resources/:id/view` | Inline PDF in browser; public, no auth required |

Resource metadata includes `accessTier` (free/premium) and `visibility` (public/private) fields — but **these are not enforced on the download endpoints** (see Security Gaps).

---

## ✅ Module 9 — Courses & Lessons

**Evidence:** `src/routes/adminCourses.js`, `src/routes/courses.js`, `public/course.html`, `public/admin/courses.html`

| Endpoint | Notes |
|----------|-------|
| `GET /api/admin/courses` | All courses incl. drafts; `?search`, `?status` filters |
| `POST /api/admin/courses` | Create course (title required) |
| `PUT /api/admin/courses/:id` | Update course metadata |
| `PATCH /api/admin/courses/:id/publish` | Toggle published/draft |
| `DELETE /api/admin/courses/:id` | Soft-delete course + cascade soft-delete lessons |
| `POST /api/admin/courses/lessons` | Upload PDF lesson; 10 MB; UUID filename |
| `PUT /api/admin/courses/lessons/:id` | Update lesson metadata |
| `PATCH /api/admin/courses/lessons/:id/move` | Reorder lesson up/down |
| `PATCH /api/admin/courses/lessons/:id/replace-file` | Replace PDF file; deletes old file |
| `DELETE /api/admin/courses/lessons/:id` | Soft-delete lesson |
| `GET /api/courses` | Published courses only |
| `GET /api/courses/:id` | Course detail + ordered lesson list |
| `GET /api/courses/lessons/:id/view` | Inline PDF; validates parent course is published |
| `GET /api/courses/lessons/:id/download` | Download PDF |

---

## ✅ Module 10 — Notification System

**Evidence:** `src/routes/notifications.js`, `src/routes/adminNotifications.js`, `src/utils/email.js`, `public/js/notifications.js`, `public/admin/notifications.html`

| Endpoint | Notes |
|----------|-------|
| `GET /api/notifications` | Current user's notifications, latest-first |
| `PATCH /api/notifications/:id/read` | Mark one as read |
| `PATCH /api/notifications/read-all` | Mark all as read |
| `DELETE /api/notifications/:id` | Dismiss one notification |
| `POST /api/admin/notifications/announce` | Broadcast to all users or a target subset; in-app + optional email; rate-limited (10/min/admin) |
| `GET /api/admin/notifications/logs` | Audit log of all admin broadcasts |
| `GET /api/admin/notifications/users` | Minimal user list for recipient targeting UI |

Email delivery via Nodemailer (SMTP). Silently skipped if `SMTP_HOST` env var not set. Templates: `buildAnnouncementEmail`, `buildNewContentEmail`, `buildResultEmail`, `buildPasswordResetEmail`.  
Data: `data/notifications.json`, `data/notification-logs.json`.  
Bell widget: `public/js/notifications.js`.

---

## ✅ Module 11 — Admin Analytics

**Evidence:** `src/routes/adminAnalytics.js`, `public/admin/analytics.html`

| Endpoint | Notes |
|----------|-------|
| `GET /api/admin/analytics/overview` | Total users, quizzes, attempts, avg score |
| `GET /api/admin/analytics/quiz-stats` | Per-quiz attempt count + avg score; sorted by popularity |
| `GET /api/admin/analytics/score-distribution` | Counts in 0-20%, 21-40%, 41-60%, 61-80%, 81-100% buckets |
| `GET /api/admin/analytics/user-stats` | Top 10 + bottom 10 scorers; username only (no PII leak) |
| `GET /api/admin/analytics/attempts-over-time` | `?period=daily\|weekly\|monthly`; chronological count series |
| `GET /api/admin/analytics/recent-activity` | Last N attempts with username/score/date; `?limit=20` |

---

## ✅ Module 12 — Bulk Import / Export

**Evidence:** `src/routes/adminImportExport.js`, `public/admin/import-export.html`

| Endpoint | Notes |
|----------|-------|
| `POST /api/admin/import/quizzes` | CSV or JSON; `?preview=1` for dry-run; 5 MB file limit; rate-limited (20/15 min) |
| `GET /api/admin/export/quizzes` | All quizzes as CSV download |
| `GET /api/admin/export/attempts` | All attempts as CSV download |

---

## ✅ Module 13 — Leaderboard System

**Evidence:** `src/routes/leaderboard.js`, `src/utils/leaderboard.js`, `public/leaderboard.html`

| Endpoint | Notes |
|----------|-------|
| `GET /api/leaderboard/overall` | Ranked by accuracy + mastery + streak |
| `GET /api/leaderboard/streak` | Ranked by current streak |
| `GET /api/leaderboard/weekly` | Ranked by XP earned in current ISO week |
| `GET /api/leaderboard/topic?topic=` | Per-topic accuracy ranking; also returns topic list |
| `GET /api/leaderboard/group/:groupId` | Study-group member ranking |

Optional viewer context: if a valid JWT cookie is present, the response includes the requesting user's own rank entry.

---

## ✅ Module 14 — Revision System

**Evidence:** `src/routes/revision.js`, `data/wrong-questions.json`, `data/bookmarks.json`

| Endpoint | Notes |
|----------|-------|
| `GET /api/revision/sets` | Metadata for 4 revision set types (count, description) |
| `GET /api/revision/sets/:setType` | Full question list for `lastWrong`, `weakTopic`, `retryWrong`, `retryUnattempted` |
| `POST /api/revision/sets/:setType/start` | Creates a quiz attempt from revision questions (timed) |
| `POST /api/revision/bookmarks` | Bookmark a question |
| `DELETE /api/revision/bookmarks/:questionId` | Remove bookmark |
| `GET /api/revision/bookmarks` | All bookmarks with full question detail |
| `GET /api/revision/bookmarks/check/:questionId` | Check if a question is bookmarked |

Wrong questions auto-recorded on attempt submission. Auth required for all revision routes.

---

## ✅ Module 15 — Gamification Engine

**Evidence:** `src/utils/gamification.js` (43 KB), `data/gamification-config.json`, `data/events.json`, `data/groups.json`, `public/achievements.html`

| Subsystem | Details |
|-----------|---------|
| XP earning | Base XP per attempt + weekend bonus multiplier + event bonus XP + daily mission bonus XP |
| Levels | XP-based (Level 1 = 50 XP; increment 25 XP per level) |
| Mastery levels | Beginner → Improving → Strong → Mastered (accuracy + quiz count thresholds) |
| Tiers | Beginner / Bronze / Silver / Gold / Diamond (XP thresholds: 0/100/300/700) |
| Badges | 8+ built-in: `first-quiz`, `perfect-score`, `three-day-streak`, `seven-day-streak`, `30-day-streak`, etc. Auto-awarded on attempt submit |
| Daily missions | 3 missions reset at UTC midnight: complete-two-quizzes (8 XP), score-80-plus (6 XP), new-topic (7 XP) |
| Streak | `currentStreak` + `bestStreak`; streak-freeze feature (1 available per user) |
| Weekly tracking | Weekly XP, weekly accuracy, weekly quiz count; `weekKey` resets each Monday |
| Events | Time-bound bonus XP events; stored in `data/events.json`; processed in gamification sync |
| Groups | Study group memberships and group leaderboards; stored in `data/groups.json` |
| Bootstrap | `bootstrapGamification()` in `server.js` re-syncs all users on server start |

---

## ✅ Module 16 — Adaptive Learning Engine

**Evidence:** `src/utils/adaptiveLearning.js`, `src/routes/me.js`

| Endpoint | Notes |
|----------|-------|
| `GET /api/me/recommendation` | Personalised quiz or revision recommendation based on topic accuracy, recency, wrong answers |
| `GET /api/me/progress` | Full gamification state + adaptive recommendation + top 5 priority topics |
| `GET /api/me/missions` | Today's mission state and XP rewards |
| `GET /api/me/groups` | User's study group memberships + rank + top 3 members |

Priority score for each topic = accuracy penalty + recency penalty + recent-wrong penalty + low-attempt penalty + skip penalty − bookmark boost.

---

## ✅ Module 17 — Contact Form

**Evidence:** `server.js:190-222`

- `POST /api/contact` — rate-limited (5 req / 15 min per IP)
- Saves records to `data/contact-submissions.jsonl` (newline-delimited JSON)
- Forwards to `CONTACT_TARGET_EMAIL` via Formsubmit.co AJAX (graceful fallback if forwarding fails)

---

## ✅ Module 18 — Database Layer

**Evidence:** `src/utils/db.js`

- JSON file storage under `/data`
- **Atomic writes**: temp-file write → `fs.rename` (avoids partial writes)
- **Per-file write queue**: prevents concurrent write corruption on overlapping saves
- User normalisation on every read/write (gamification fields, streak shape, latestBadge)
- Soft-delete pattern used for quizzes, courses, lessons, resources

---

## ✅ Module 19 — Security Layer

**Evidence:** `server.js`, `src/config.js`, `src/middlewares/`

| Control | Implementation |
|---------|---------------|
| CORS | Allowlist via `CORS_ALLOWED_ORIGINS` env; dev-mode auto-permits `localhost` + GitHub Codespaces |
| HTTP headers | `helmet` (CSP disabled; COEP disabled) |
| JWT | HttpOnly cookie; `secure: true` in production; `sameSite: lax` |
| Password | bcrypt cost factor 10 |
| Ban check | Enforced at login AND on every authenticated request |
| Input validation | Per-route (quiz, profile, auth, resources) with structured error responses |
| Sanitisation | `&lt;`/`&gt;` escaping in quiz title/description/options/answers/adminNotes |
| Atomic DB writes | Temp-file + rename pattern with per-file queue |
| Rate limiting | Custom in-memory IP-based limiter on auth, contact, import, admin, notifications |

---

## ❌ Unimplemented / Incomplete Features

These are features typical for a modern quiz/preparation/assignment platform that are **absent or partially implemented**.

| # | Feature | Evidence of Gap |
|---|---------|----------------|
| 1 | **Forgot Password / Reset Password** | `buildPasswordResetEmail` template exists in `src/utils/email.js` but no `/api/auth/forgot-password` or `/api/auth/reset-password` routes exist; no reset token storage |
| 2 | **Email Verification on Registration** | No `verified` flag on users; no verification link flow; no resend endpoint |
| 3 | **Resource Access Control Enforcement** | `accessTier` (free/premium) and `visibility` (public/private) are stored as metadata on resources but the download/view endpoints (`GET /api/resources/:id/download`, `/view`) apply **no auth or tier checks** — any anonymous user can download any file |
| 4 | **Admin Events Management API** | `data/events.json` is processed by the gamification engine, but no admin route exists to create/edit/delete events; events must be manually edited in JSON |
| 5 | **Admin Groups Management API** | `data/groups.json` exists (currently `[]`) and the leaderboard/gamification uses it, but no admin API to create groups or manage members |
| 6 | **Student Assignment Submission** | Admin can upload assignments as resources; students have no upload/submission flow and cannot receive graded feedback |
| 7 | **Email Notification for Quiz Results** | `buildResultEmail` template defined in `src/utils/email.js`; attempt submission route does **not** call it |
| 8 | **Exam Scheduler & Reminders** | No scheduled quiz/test with auto-notification |
| 9 | **Full-Text Search** | No search across quizzes, resources, or course content |
| 10 | **Teacher / Instructor Role** | Only `user` and `admin` roles; no intermediate role that can author content without full admin access |
| 11 | **Video Content in Courses** | Only PDF lessons supported; no video upload, embed, or streaming |
| 12 | **Discussion / Q&A Forum** | No per-quiz or global community discussion threads |
| 13 | **PWA / Offline Support** | No `manifest.json`, no service worker; Tailwind loaded from CDN (not locally bundled) |
| 14 | **Student Self-Deletion of Account** | No user-facing endpoint; only admins can delete accounts |
| 15 | **Two-Factor Authentication (2FA)** | No TOTP, SMS, or passkey support |
| 16 | **API-wide Rate Limiting** | Rate limiting currently only on auth, contact, import, admin, and notification broadcast routes; quiz attempts, profile updates, leaderboard, course/resource downloads have no rate limits |
| 17 | **Reward Shop** (retired) | `GET /api/rewards` returns an empty shop; `POST /api/rewards/redeem` returns 410 Gone; dead code remains in the route and `data/rewards.json` |

---

## 🔐 Security Gaps

| Gap | Severity | Detail |
|-----|----------|--------|
| **Resource downloads unauthenticated** | High | Any anonymous user can call `GET /api/resources/:id/download` or `/view` regardless of `accessTier` or `visibility` setting. There is no auth guard on these endpoints. |
| **PII committed to public repo** | High | `data/users.json` contains real email addresses (`manokant2002@gmail.com`, `sujal@gmail.com`) in the git history of a public repository. This is a privacy risk and likely violates GDPR / data protection principles. **Immediate action required:** (1) Remove the file from git history using `git filter-repo --path data/users.json --invert-paths` or BFG Repo-Cleaner (`bfg --delete-files users.json`); (2) add `data/` to `.gitignore`; (3) rotate any credentials that may have been exposed alongside the data. |
| **Content-Security-Policy disabled** | High | `helmet({ contentSecurityPolicy: false })` in `server.js:92-96` removes all browser-side XSS protection headers. |
| **HTML injection in broadcast email** | Medium | `buildAnnouncementEmail` does `message.replace(/\n/g, '<br>')` without HTML-encoding `message` first. An admin submitting HTML in the message body injects arbitrary markup into recipient email bodies. |
| **Rate limiter bucket map unbounded** | Medium | The `Map` in `rateLimit.js` stores one entry per unique IP and never evicts old entries. Under high traffic from many unique IPs, this grows without bound and can cause out-of-memory crashes. **Fix:** implement a time-based sweep that removes entries whose `resetAt` has passed (run as a `setInterval` every 5 minutes), or replace the `Map` with an LRU cache (e.g. `lru-cache` npm package) with a capacity cap. |
| **X-Forwarded-For spoofable** | Medium | `getClientIp()` uses the first IP in the `X-Forwarded-For` header without validation. A client behind a proxy (or no proxy) can set this header to bypass rate limiting with a different IP on each request. |
| **No CSRF protection** | Low-Medium | No CSRF token. `sameSite: lax` mitigates GET-navigation CSRF, but form-POST CSRF via cross-origin submissions is possible in some edge-case configurations. |
| **JWT not revocable per-token** | Low | 7-day HttpOnly cookie JWT with no refresh token and no server-side revocation list. Ban check at middleware mitigates most risk but there is a window if a ban is applied between requests. |
| **crossOriginEmbedderPolicy disabled** | Low | `helmet({ crossOriginEmbedderPolicy: false })` reduces origin isolation. |
| **No health check endpoint** | Informational | Cannot be monitored by uptime services or load balancers. |

---

## 🔧 Technical Debt

| Item | Location | Impact |
|------|----------|--------|
| **Accidental files in repo root** | `"e --continue"`, `"et --soft HEAD~1"` (git rebase artefacts — note: these are literal filenames with spaces), `cookies.txt` (libcurl cookie file) | Noise; should be deleted and added to `.gitignore` |
| **Binary uploads committed** | `uploads/resources/*.pdf`, `uploads/lessons/*.pdf` | Binary data in git history; `.gitignore` only covers `uploads/avatars/*` not resources or lessons |
| **`data/` folder not gitignored** | `data/users.json` with real PII | User data in public git repo is a privacy risk (see Security Gaps above) |
| **Duplicate rate limiter logic** | `src/middlewares/rateLimit.js` vs inline limiters in `notifications.js` and `adminNotifications.js` | Three separate in-memory rate limiter implementations; the two inline ones don't set `Retry-After` headers |
| **In-memory rate limiter** | `src/middlewares/rateLimit.js` | State lost on server restart; not shared across multiple processes/instances; bucket map grows unbounded |
| **JSON file database** | `src/utils/db.js` | Full-file read on every request; no indexing; will not scale past ~1000 concurrent users; unsuitable for production |
| **`data/questions.json`** | `data/questions.json` | File exists but no route reads it; questions are embedded in `quizzes.json` — orphaned file |
| **Dead rewards code** | `src/routes/rewards.js`, `data/rewards.json` | Reward shop retired (410) but route and data file remain |
| **`REPO-ANALYSIS.md` (previous version)** | Root | Contained a "Gap #1: Admin User Management is missing" item that has since been implemented |
| **Inconsistent field names** | `data/attempts.json` | `total` vs `maxScore`; `question` vs `text` in quiz questions — handled by code but creates fragility |
| **No structured logging** | All route files | Only `console.error()`; no request IDs, no log levels, no JSON-structured output (winston/pino) |
| **Gamification bootstrap on every start** | `server.js:224-242` | Runs `syncUsersToGamification` at startup; loads all users + attempts + quizzes into memory; could cause slow cold starts on serverless |

---

## 🚀 Deployment Readiness Gaps

| Gap | Detail |
|-----|--------|
| **`vercel.json` is incomplete** | Current config only has static HTML redirects. To serve the Express API on Vercel, every `/api/*` request must be rewritten to a serverless function entrypoint. The current config would result in 404 for all API calls on a Vercel deployment. |
| **Filesystem is ephemeral on serverless** | The JSON file database (`/data/*.json`) and uploaded files (`/uploads/`) are written to the local filesystem. Vercel (and most serverless platforms) provide a read-only or ephemeral filesystem — data written at runtime is lost after each invocation. A persistent database (e.g. Vercel Postgres, MongoDB Atlas) and external file storage (e.g. Vercel Blob, AWS S3, Cloudflare R2) are required before production deployment. |
| **In-memory rate limiter state** | Serverless functions are stateless between invocations. The rate limiter state (IP → count) is reset on every cold start. Redis or Upstash would be required for effective distributed rate limiting. |
| **`NODE_ENV` not enforced** | If deployed without `NODE_ENV=production`, the JWT cookie's `secure` flag is `false` (sent over HTTP). The `CORS_ALLOWED_ORIGINS` env var must also be set in production or the empty-list default blocks all API consumers. |
| **No startup environment validation** | Only `JWT_SECRET` causes a startup failure if missing. Unconfigured `SMTP_HOST`, `CONTACT_TARGET_EMAIL`, etc. silently degrade functionality without warning at launch. |
| **No health check endpoint** | No `GET /health` or `GET /api/health` endpoint for uptime monitoring or load-balancer probes. |
| **Binary files + PII in git** | `uploads/resources/*.pdf`, `uploads/lessons/*.pdf`, and `data/users.json` (with real emails) are committed. A fresh deployment would clone PII into every developer environment. |

---

## 🧪 Testing / CI Gaps

| Gap | Detail |
|-----|--------|
| **Zero automated tests** | No unit tests, no integration tests, no end-to-end tests anywhere in the repository. |
| **No test framework configured** | `package.json` has no test script, no jest/mocha/vitest/supertest dependency. |
| **No CI pipeline** | No `.github/` directory, no GitHub Actions workflows. Nothing runs on push or pull request. |
| **No linting configuration** | No ESLint config, no Prettier config, no `package.json` scripts for linting. |
| **`tools/validate-content.mjs`** | Exists and is referenced in `npm run validate:content`, but it is not integrated into any CI step. |
| **No code coverage** | No c8/Istanbul/nyc setup. |

---

## 📋 Prioritised Next-Steps Roadmap

```
Sprint 1 — Security & Data Hygiene (Immediate)
├── 🔲 Add data/ and uploads/resources/, uploads/lessons/ to .gitignore
│       — prevents committing PII and binary blobs
├── 🔲 Remove accidental files: "e --continue", "et --soft HEAD~1", cookies.txt
├── 🔲 Enforce resource access control on download/view endpoints
│       — check visibility + accessTier + optional auth before streaming files
├── 🔲 Enable Content-Security-Policy in helmet (remove contentSecurityPolicy: false)
│       — add a restrictive but workable CSP directive set
└── 🔲 HTML-encode admin broadcast message before inserting into email template

Sprint 2 — Core Missing Features
├── 🔲 Forgot Password / Reset Password flow
│       — POST /api/auth/forgot-password  (generate time-limited token, email link)
│       — POST /api/auth/reset-password   (validate token, set new password)
├── 🔲 Email Verification on registration
│       — add "verified" flag; send link on register; re-send endpoint
├── 🔲 Admin Events Management API
│       — POST/PUT/DELETE /api/admin/events  to create and manage bonus events
├── 🔲 Admin Groups Management API
│       — CRUD /api/admin/groups  to create groups and manage members
└── 🔲 Wire up result-email after quiz submission
        — call buildResultEmail + sendEmail in the attempt submit handler

Sprint 3 — Platform Reliability
├── 🔲 Add CI pipeline (.github/workflows/ci.yml)
│       — run npm install + smoke tests on every push/PR
├── 🔲 Add basic test suite (Jest + Supertest)
│       — auth register/login, quiz list, attempt submit as starting points
├── 🔲 Fix unbounded rate-limiter Map (periodic bucket eviction)
├── 🔲 Add GET /api/health endpoint
└── 🔲 Add structured logging (pino or winston; include request IDs)

Sprint 4 — Deployment Preparation
├── 🔲 Migrate data layer from JSON files to a persistent database
│       (Vercel Postgres, MongoDB Atlas, PlanetScale, etc.)
├── 🔲 Migrate file uploads to external object storage
│       (Vercel Blob, AWS S3, Cloudflare R2)
├── 🔲 Rewrite vercel.json with correct API rewrites
│       — all /api/* requests must route to the Express serverless handler
└── 🔲 Validate all required env vars at startup (JWT_SECRET, SMTP_*, CORS_*)

Sprint 5 — Engagement & Content
├── 🔲 Full-text search across quizzes, resources, courses
├── 🔲 Exam scheduler + auto-reminder notifications
├── 🔲 Teacher/instructor role (create content without full admin access)
├── 🔲 Video lesson support (upload to object storage + embed)
├── 🔲 Assignment submission by students + admin grading flow
└── 🔲 Discussion / Q&A forum (per-quiz threads)

Sprint 6 — Growth & Extras
├── 🔲 PWA: manifest.json + service worker + offline cache
├── 🔲 Google OAuth login
├── 🔲 Two-Factor Authentication (TOTP)
├── 🔲 OpenAPI / Swagger documentation
├── 🔲 PDF export of quiz results
└── 🔲 AI-powered question recommendations
```

---

## 🗂️ File & Route Quick-Reference

```
server.js                               ← Express 5 entry point; all route mounts; CORS/helmet/rate-limit setup
src/
  config.js                             ← All env vars, CORS, JWT, rate limit windows
  middlewares/
    auth.js                             ← JWT cookie → DB lookup → ban check → req.userId + req.user
    isAdmin.js                          ← Requires req.user.role === 'admin'; 403 otherwise
    rateLimit.js                        ← Custom in-memory sliding-window rate limiter (IP-based)
  routes/
    auth.js              /api/auth                  ← register, login, logout, me
    quizzes.js           /api/quizzes               ← public list + detail (no answers)
    attempts.js          /api/attempts              ← start, submit, review, list (auth required)
    revision.js          /api/revision              ← sets, bookmarks, start revision session (auth)
    profile.js           /api/profile               ← view/edit, password, avatar, notif prefs (auth)
    leaderboard.js       /api/leaderboard           ← overall, streak, weekly, topic, group
    me.js                /api/me                    ← missions, progress, recommendation, groups (auth)
    rewards.js           /api/rewards               ← XP balance; shop retired (auth)
    resources.js         /api/resources             ← public list + download/view
    courses.js           /api/courses               ← published courses + lesson PDF stream
    notifications.js     /api/notifications         ← list, mark-read, dismiss (auth)
    adminQuizzes.js      /api/admin/quizzes         ← full CRUD, publish, duplicate, reorder (admin)
    adminAnalytics.js    /api/admin/analytics       ← 6 analytics endpoints (admin)
    adminImportExport.js /api/admin/import|export   ← CSV quiz import/export, attempts export (admin)
    adminNotifications.js /api/admin/notifications  ← broadcast, logs, user list (admin)
    adminCourses.js      /api/admin/courses         ← course + lesson CRUD, reorder, publish (admin)
    adminUsers.js        /api/admin/users           ← list, detail, role, status, delete, attempt delete (admin)
    adminAttempts.js     /api/admin/attempts        ← delete single attempt (admin)
    resources.js         /api/admin/resources       ← upload, delete (admin)
  utils/
    db.js                               ← JSON file DB; atomic writes; write queue; user normalisation
    email.js                            ← Nodemailer SMTP wrapper; 4 email templates
    gamification.js                     ← XP, tiers, mastery, badges, missions, streaks, events, groups (43 KB)
    leaderboard.js                      ← Leaderboard computation helpers
    adaptiveLearning.js                 ← Topic-priority scoring; revision vs. practice decision engine

public/
  index.html              ← Home / marketing / entry page
  dashboard.html          ← User quiz history + gamification stats
  profile.html            ← User profile edit + avatar
  quizzes.html            ← Browse all quizzes
  daily-quiz.html         ← Daily random quiz UI
  topic-tests.html        ← Topic-wise test UI
  mock-tests.html         ← Full mock exam with countdown timer
  leaderboard.html        ← All leaderboard tabs (overall/streak/weekly/topic/group)
  achievements.html       ← Badges + daily missions
  resources.html          ← Notes/PDF browser + download
  course.html             ← Course + lesson viewer
  details.html            ← (Unclear purpose; no mapped route)
  content-manager.html    ← Standalone content JSON editor
  admin/
    index.html            ← Admin nav hub
    analytics.html        ← Admin analytics dashboard (Chart.js)
    import-export.html    ← Bulk quiz CSV import/export
    notifications.html    ← Admin broadcast panel
    resources.html        ← Admin resource upload/delete
    courses.html          ← Admin course + lesson CRUD
    users.html            ← Admin user management (list, role, ban, delete)
  js/
    notifications.js      ← Bell widget + dropdown (frontend)
    modules/              ← Frontend JS modules (navbar, quizEngine, progressTracker, etc.)

data/
  users.json              ← User records (id, name, email, passwordHash, role, XP, badges …) ⚠️ PII in git
  quizzes.json            ← Quiz + embedded questions bank
  attempts.json           ← All quiz attempts
  resources.json          ← Resource metadata
  courses.json            ← Course metadata
  lessons.json            ← Lesson metadata
  notifications.json      ← Per-user in-app notifications
  notification-logs.json  ← Admin broadcast audit log
  gamification-config.json← XP / tier / badge configuration
  groups.json             ← Study group definitions (currently empty)
  events.json             ← Time-bound bonus XP events
  rewards.json            ← (Deprecated; badge-only system now)
  questions.json          ← (Orphaned; questions are embedded in quizzes.json)
  bookmarks.json          ← Per-user question bookmarks
  wrong-questions.json    ← Per-user wrong-answer tracking
  contact-submissions.jsonl ← Contact form submissions (JSONL)

uploads/
  avatars/                ← User avatar images (.gitignore covers avatars/*)
  resources/              ← Admin-uploaded PDF resources ⚠️ binary blobs in git
  lessons/                ← Admin-uploaded lesson PDFs    ⚠️ binary blobs in git

tools/
  validate-content.mjs    ← Content validation script (not wired to CI)
  og-image-export.html    ← OG image generator (dev tool)
```
