# Changelog

All notable work on NotebookMind (Runcell). This is a university project, so
changes are grouped by area rather than versioned releases. Newest first.

## Current (submission — 2026-07-28)

### Backend & data (Supabase)
- Real auth, profiles/roles, courses, invite-code enrollment, XP, and an
  **opt-in, course-scoped leaderboard** — all row-level-security protected.
- **Teacher dashboard**, live from the DB: per-student roster, per-topic
  understanding, "where students struggle", and an algorithmic summary
  (`get_course_student_performance`, `get_course_topic_stats`).
- **Friends / stat-sharing** (migration 18): consent-based, mutual — send a
  request by email, accept, or withdraw (`friend_shares`, `request_friend`,
  `get_my_friends`).
- **Self-service account deletion** (migration 19): `delete_my_account` RPC
  removes the user and cascades all their data.
- **Private per-cell notebook notes** (migration 21): a student's Explain-mode
  margin notes persist to their own account, survive reload, and are private
  (`cell_notes`, owner-only RLS).
- Persistence for section notes, flashcards (SM-2), quiz progress, cached AI
  challenges, teacher notes & peer comments, and profile name/avatar.

### Live updates (Supabase Realtime, migration 20)
- The teacher dashboard, Explain-mode comments (both directions), and the friends
  screen update **live, without a reload**.
- **AI insights moved behind a "Generate" button** — live data changes refresh
  the plots/summary but never trigger the AI, so credits aren't spent on every
  change. Generated reports are cached per session with a "data changed" note.

### Learning experience
- Learn mode (fix-the-bug / write-the-cell / multiple-choice) with real kernel
  execution and output comparison; Explain mode with per-cell explanations,
  embedded slides, and comments.
- Teacher authoring: tasks, lock/unlock notebooks, week slides, notebook content
  published to enrolled students.

### Tooling, tests & setup
- `test-backend.js`: 23-section, ~80-check suite against the real backend
  (78 pass, 2 skip) covering every feature above, incl. a destructive
  delete-account round-trip and a live Realtime event.
- **Fixed: notebooks never ran** — installed `numpy`/`pandas`/`matplotlib` and
  bound the kernel to the venv's Python (was resolving to a package-less global
  Python, causing `ModuleNotFoundError` and the `np`-undefined cascade).
  `requirements.txt` + `setup.sh`/`setup.ps1` now do this automatically.
- One-command cross-platform setup (`setup.sh` / `setup.ps1`) and a turnkey
  `.env.example` (connected mode out of the box).
- Seed scripts (`seed-demo.js`, `seed-comments.js`) populate a demo course with
  10 fake students, submissions across topics, per-cell attempts, and per-cell
  comments so the dashboards and plots show rich data.

## Earlier
- Redesign into the gamified Learn/Explain app with course and teacher dashboards.
- Initial JupyterLab extension prototype.
