# Repository Analysis: RPSC/REET Exam Preparation Platform

> **Generated:** April 2026 | **Branch:** main | **Version:** 2.0  
> Comprehensive audit of implemented features and prioritised next-steps.

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

**Gaps in this area:** No forgot-password / reset-password flow; no email verification on register; no 2FA; no admin UI to promote/ban users (requires manual JSON edit).

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

**Gap:** No admin page to list/manage registered users (promote, ban, view stats).

---

### 8. Bulk Import / Export

| What | File / Route | Notes |
|------|-------------|-------|
| Import quizzes | `POST /api/admin/import/quizzes` → `src/routes/adminImportExport.js` | CSV; preview mode with `?preview=1` |
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

## 🔜 To Implement

Priority is ranked **High / Medium / Low** based on user impact and platform completeness.

### Priority 1 — High (Core Gaps)

| # | Feature | Why Missing / Gap |
|---|---------|-------------------|
| 1 | **Admin User Management panel** | Admins must manually edit `data/users.json` to promote/ban users. No `/api/admin/users` endpoint or UI page exists. |
| 2 | **Forgot Password / Reset Password** | `POST /api/auth/forgot-password` and `POST /api/auth/reset-password` are absent. Users who forget credentials have no self-service recovery. |
| 3 | **Email Verification on Register** | Registration silently accepts any email. No verification link flow implemented. |
| 4 | **Assignment Submission by Users** | Admin can upload assignments as resources. But users have no way to submit their own work for grading/feedback. |

---

### Priority 2 — Medium (Engagement & Polish)

| # | Feature | Why Missing / Gap |
|---|---------|-------------------|
| 5 | **Exam Scheduler & Reminders** | No ability to schedule a quiz for a future date/time with auto-reminder notifications. |
| 6 | **Full-Text Search** | No search across quizzes, resources, or courses. Essential as content grows. |
| 7 | **Teacher / Instructor Role** | Only `user` and `admin` roles exist. A `teacher` role (can create quizzes/lessons but not manage users) is missing. |
| 8 | **Video Content Support** | Courses support PDF lessons only. No video upload/embed or HLS streaming integration. |
| 9 | **Discussion / Q&A Forum** | No community discussion thread or per-quiz Q&A feature. |
| 10 | **PWA / Offline Support** | No `manifest.json`, no service worker, no offline cache. Pages load from CDN Tailwind (not production-bundled). |

---

### Priority 3 — Low / Future

| # | Feature | Why Missing / Gap |
|---|---------|-------------------|
| 11 | **Third-Party Login (Google OAuth)** | Only email+password auth. Google sign-in would lower onboarding friction. |
| 12 | **Two-Factor Authentication (2FA)** | No TOTP or SMS-based 2FA. |
| 13 | **API Documentation (Swagger / OpenAPI)** | No auto-generated API docs. Makes integration harder for future clients. |
| 14 | **Automated Test Suite** | No `test/` directory or test framework configured. No unit, integration, or e2e tests. |
| 15 | **Previous Year Papers / PDF solutions** | Planned in PLATFORM-GUIDE but not implemented. Could be served as specialised resources. |
| 16 | **AI Question Recommendations** | Planned in PLATFORM-GUIDE but not implemented. Requires ML layer. |
| 17 | **Export Results as PDF** | Users can download CSV attempts but not a formatted PDF report. |
| 18 | **Rate Limiting (API-wide)** | Rate limiting currently only on `/api/auth`, `/api/contact`, and `/api/admin/import`. Other routes (quiz submit, profile update, etc.) are unprotected. |

---

## 📋 Prioritised Next-Steps Roadmap

```
Sprint 1 (Immediate – Core Stability)
├── ✅ [done] JWT auth, user profiles, quiz system
├── ✅ [done] Admin analytics, bulk import/export, notifications
├── ✅ [done] Gamification (XP, badges, leaderboards)
├── 🔲 Admin User Management page + API   ← NOW (see /public/admin/users.html)
└── 🔲 Forgot Password / Reset Password flow

Sprint 2 (User Trust & Safety)
├── 🔲 Email verification on register
├── 🔲 API-wide rate limiting (generalise rateLimit middleware)
└── 🔲 Assignment submission + admin grading/feedback loop

Sprint 3 (Content & Discovery)
├── 🔲 Full-text search (quizzes, resources, courses)
├── 🔲 Exam scheduler + auto-reminder notifications
├── 🔲 Teacher/instructor role (restricted admin)
└── 🔲 Video lesson support (upload + embed)

Sprint 4 (Platform Maturity)
├── 🔲 PWA: manifest.json + service worker + offline cache
├── 🔲 Discussion / Q&A forum (per quiz or global)
└── 🔲 Automated test suite (Jest + Supertest)

Sprint 5 (Growth & Extras)
├── 🔲 Google OAuth login
├── 🔲 OpenAPI / Swagger docs
├── 🔲 PDF export of results
└── 🔲 AI-powered question recommendations
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
    auth.js          /api/auth          ← register, login, logout, me
    quizzes.js       /api/quizzes       ← public quiz list + detail
    attempts.js      /api/attempts      ← start, submit, review, list
    profile.js       /api/profile       ← view/edit, avatar, password, notif prefs
    leaderboard.js   /api/leaderboard   ← overall, streak, weekly, topic, group
    me.js            /api/me            ← missions, progress, groups
    rewards.js       /api/rewards       ← XP balance, redemption history
    resources.js     /api/resources     ← public list + download
    courses.js       /api/courses       ← published courses + lesson stream
    notifications.js /api/notifications ← list, mark-read, dismiss
    adminQuizzes.js  /api/admin/quizzes ← CRUD, publish/unpublish
    adminAnalytics.js /api/admin/analytics ← 6 analytics endpoints
    adminImportExport.js /api/admin     ← import (CSV) + export quizzes/attempts
    adminNotifications.js /api/admin/notifications ← broadcast, logs
    adminCourses.js  /api/admin/courses ← course + lesson CRUD
    resources.js     /api/admin/resources ← admin upload/delete
  utils/
    db.js                               ← JSON file DB with write-queue + atomic writes
    email.js                            ← Nodemailer SMTP wrapper
    gamification.js                     ← XP, tiers, badges, missions engine
    leaderboard.js                      ← Leaderboard computation helpers
public/
  index.html          ← Main dashboard (home)
  dashboard.html      ← User quiz history + stats
  profile.html        ← User profile edit
  quizzes.html        ← Browse all quizzes
  daily-quiz.html     ← Daily random quiz UI
  topic-tests.html    ← Topic-wise test UI
  mock-tests.html     ← Full mock exam with timer
  leaderboard.html    ← All leaderboard tabs
  achievements.html   ← Badges + missions
  resources.html      ← Notes/PDF browser
  course.html         ← Course viewer
  content-manager.html ← Standalone content JSON editor
  admin/
    index.html        ← Admin nav hub
    analytics.html    ← Admin analytics dashboard
    import-export.html ← Bulk import/export
    notifications.html ← Admin broadcast panel
    resources.html    ← Admin resource upload
    courses.html      ← Admin course + lesson CRUD
    users.html        ← ⭐ NEW — Admin user management
data/
  users.json          ← User records (id, name, email, passwordHash, role, XP …)
  quizzes.json        ← Quiz + question bank
  attempts.json       ← All quiz attempts
  resources.json      ← Resource metadata
  courses.json        ← Course metadata
  lessons.json        ← Lesson metadata
  notifications.json  ← Per-user notifications
  notification-logs.json ← Admin broadcast log
  gamification-config.json ← XP / tier / badge config
  groups.json         ← Study group definitions
  rewards.json        ← (deprecated – badge-only system now)
  events.json         ← Scheduled events (future use)
```
