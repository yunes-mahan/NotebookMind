# NotebookMind

**A gamified learning layer for Jupyter notebooks.** Students learn a course's
notebooks cell-by-cell through AI-generated challenges (fix-the-bug, write-the-cell,
multiple-choice), earn XP, and compare on a course leaderboard. Teachers create
courses, publish weekly slides & notebooks, and see **live, anonymous class
analytics** (where students struggle, first-try rates, AI insights).

It is a JupyterLab 4 extension: a **TypeScript** frontend (`src/`) + a **Python**
server extension (`notebookmind/`), backed by a real **Supabase** (Postgres) project
for auth, courses, enrollment, XP, leaderboards and analytics.

---

## 1. Quick start (run the app)

> Windows + PowerShell. The virtual environment (`venv/`) and a built extension are
> already included, and `start.ps1` sets the API keys.

```powershell
cd C:\Users\yunes\Desktop\PI
.\start.ps1
```

Then open the URL it prints (it includes a token), e.g.:

```
http://localhost:8888/lab?token=...
```

The **NotebookMind login screen appears automatically** as an overlay. Sign in with
one of the accounts below. (You can reopen the panel any time from the Command
Palette → “Open NotebookMind”.)

The app runs in **connected mode** (real Supabase backend) — you should *not* see a
“demo mode / no backend” banner on the login screen.

---

## 2. Test accounts & course

These are disposable accounts on the shared Supabase project (the publishable/anon key
is safe to be public — row-level security protects the data).

| Role | Email | Password |
|------|-------|----------|
| **Professor** (teacher) | `notebookmind.prof@gmail.com` | `Teacher123!` |
| **Student** | `notebookmind.student@gmail.com` | `Student123!` |

**Demo course:** *Data Analysis with Python* — **invite code `DEMO2025`**.
The professor owns it; the student (and 7 seeded classmates) are enrolled.

**Seeded classmates** (so the leaderboard & analytics show live data): Alice, Priya,
Carlos, Mia, Tom, James, Sara — emails `nm.fake.<first>@example.com`, all password
`Student123!`, all enrolled in the demo course and opted into the leaderboard.

### What to try
- **As the professor:** sign in → the **Teacher** tab. The Overview shows real,
  anonymous aggregates — active students, average first-try rate, submissions, a
  “Where students struggle” chart and “Topic mastery”, all computed from the DB.
- **As a student:** sign in → **Course** → open a notebook → **Learn** to solve
  challenges (earns XP, records anonymous telemetry). Open **Leaderboard**, click
  **Show me on the leaderboard** (opt-in) to see the course ranking. Join a course
  with an **invite code** (`DEMO2025`) from the sidebar course switcher.
- **Local, no backend:** on the Course screen, **“Bring your own notebook”** lets you
  upload any `.ipynb` and learn it — this works with no account/DB.

---

## 3. Run the tests

The backend feature suite exercises the real Supabase backend (login, signup, roles,
create/join course, XP sync, course leaderboard, documents, notes, flashcards, the
teacher analytics aggregates, and slide authoring). It prints PASS/FAIL per feature
and exits non-zero if anything fails.

```powershell
node test-backend.js
```

Expected: **all checks pass** (a couple may show **SKIP** — the signup check skips if
Supabase’s hourly confirmation-email limit is hit, and the live AI-generation check
skips unless an AI key is set). To also run the live AI test:

```powershell
$env:GEMINI_API_KEY="<your key>"; node test-backend.js
```

The suite targets the shared demo project + test accounts by default; override with
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `NM_TEACHER_EMAIL/PW`, `NM_STUDENT_EMAIL/PW`.

---

## 4. Rebuild after code changes

```powershell
npx tsc --sourceMap                                                   # TS -> lib/
.\venv\Scripts\python.exe -m jupyter labextension build --development True .   # bundle
.\start.ps1                                                           # sync + restart
```

Then hard-refresh the JupyterLab browser tab.

---

## 5. Architecture

| Layer | Where | What |
|-------|-------|------|
| Frontend | `src/*.ts` | Screens (home, learn, explain, reader, teacher, leaderboard), course store, XP, Gemini/Anthropic calls |
| Server ext | `notebookmind/` | Serves API keys + Supabase config to the frontend (`/notebookmind/config`) |
| Backend | Supabase (Postgres) | `profiles`, `courses`, `course_enrollments`, `course_weeks`, `documents`, `section_notes`, `flashcards`, `quiz_sessions`, `point_events`, `notebook_submissions`, `cell_attempts`, `cell_comments`, `notebook_challenges`; RPCs `get_course_leaderboard`, `join_course_by_invite`, `increment_points` |
| DB setup | `migration*.sql` (1–11) | Schema + RLS + RPCs (already applied to the shared project) |
| Seed | `seed-demo.js`, `seed-comments.js` | Fake classmates + demo-course activity, and seeded Explain-mode comments |

The Supabase schema is already provisioned on the shared project, so **graders do not
need to run any migrations** — just `start.ps1` and sign in. The `migration*.sql`
files and `seed-demo.js` document how the DB was built and can re-provision a fresh
project (they need a Postgres `DATABASE_URL`).

---

## 6. Troubleshooting

- **Login shows a “no backend / demo mode” banner** → the Supabase config didn’t load.
  Confirm the config endpoint works:
  `curl "http://localhost:8888/notebookmind/config?token=<token>"` should return the
  `supabase_url`/`supabase_anon_key`. Re-run `.\start.ps1`.
- **Port already in use** → JupyterLab will pick 8889/8890; use the URL it prints.
- **Extension not showing** → `.\venv\Scripts\python.exe -m jupyter labextension list`
  should list `notebookmind ... enabled ok`.
- **Backend tests fail on “project reachable”** → the free Supabase project may be
  cold-starting; re-run `node test-backend.js` (the suite retries logins).
