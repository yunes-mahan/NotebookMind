# NotebookMind (Runcell)

**A gamified learning layer for Jupyter notebooks.** Students learn a course's
notebooks cell-by-cell through AI-generated challenges (fix-the-bug, write-the-cell,
multiple-choice), earn XP, and compare on a course leaderboard. Teachers create
courses, publish weekly slides & notebooks, and see **live class analytics** — a
per-student roster, per-topic understanding, where students struggle, first-try
rates and AI insights.

It is a JupyterLab 4 extension: a **TypeScript** frontend (`src/`) + a **Python**
server extension (`notebookmind/`), backed by a real **Supabase** (Postgres) project
for auth, courses, enrollment, XP, leaderboards and analytics.

---

## 1. Prerequisites

Install these first (any recent version):

- **Python ≥ 3.10** (with `venv`)
- **Node.js ≥ 18** (needed to build the frontend; `jlpm` uses it)
- **git**

Check: `python3 --version`, `node --version`, `git --version`.

---

## 2. Set up from a fresh clone

These steps work on **macOS / Linux** and **Windows** — only the two marked lines
differ. Run them from a terminal.

```bash
# 1) Clone the repo and use the production branch
git clone https://github.com/yunes-mahan/NotebookMind.git
cd NotebookMind
git checkout production

# 2) Create and activate a Python virtual environment
python3 -m venv venv
source venv/bin/activate            # Windows (PowerShell): venv\Scripts\Activate.ps1
python -m pip install --upgrade pip

# 3) Install JupyterLab
pip install jupyterlab

# 4) Build the extension (frontend) and install it in dev mode
jlpm install                        # JS dependencies (jlpm ships with JupyterLab)
jlpm run build                      # TypeScript -> lib/ , then bundle -> notebookmind/labextension/
pip install -e .                    # install the Python package + server extension
jupyter labextension develop . --overwrite

# 5) Configure the backend (Supabase) — turnkey, values are public-safe
cp .env.example .env                # Windows: copy .env.example .env

# 6) Run
jupyter lab
```

Then open the URL JupyterLab prints (it includes a token), e.g.
`http://localhost:8888/lab?token=...`. The **Runcell login screen appears
automatically** as an overlay. Sign in with an account from section 3.

You should **not** see a "demo mode / no backend" banner on the login screen — the
copied `.env` connects the app to the shared Supabase project. (You can reopen the
panel any time from the Command Palette → "Open Runcell".)

> **No `.env`?** The app still runs, but in **demo mode**: any email/password works
> and nothing is saved. Copy `.env.example` to `.env` (step 5) for the real,
> connected experience.

---

## 3. Test accounts & course

Disposable accounts on the shared Supabase project (the publishable/anon key in
`.env.example` is safe to be public — row-level security protects the data):

| Role | Email | Password |
|------|-------|----------|
| **Teacher** | `notebookmind.prof@gmail.com` | `Teacher123!` |
| **Student** | `notebookmind.student@gmail.com` | `Student123!` |

**Demo course:** *Data Analysis with Python* — **invite code `DEMO2025`**.
The teacher owns it; the student (and 7 seeded classmates) are enrolled.

**Seeded classmates** (so the leaderboard & analytics show live data): Alice, Priya,
Carlos, Mia, Tom, James, Sara — emails `nm.fake.<first>@example.com`, password
`Test123456!`, all enrolled in the demo course.

> Sign in with these accounts — **no signup needed**. (Creating a brand-new account
> triggers a confirmation email, which is rate-limited on the shared project.)

### What to try
- **As the teacher:** sign in → the **Teacher** tab → **Overview**. You get a
  per-student roster ranked by XP, a **Topic understanding** graph (what the class
  grasped vs. where it struggled), "Where students struggle", and AI insights — all
  computed from the real database. Under **Weeks & content** you can edit tasks,
  lock/unlock notebooks (students see the change), and edit notes per cell.
- **As a student:** sign in → **Course** → open a notebook → **Learn** to solve
  challenges (earns XP, records telemetry) or **Explain** to read cell-by-cell.
  Open **Leaderboard** to see the course ranking. Join another course with an
  **invite code** from the sidebar course switcher.
- **Local, no backend:** on the Course screen, **"Bring your own notebook"** lets you
  upload any `.ipynb` and learn it — works with no account/DB.

---

## 4. Run the backend tests

The suite exercises the real Supabase backend (login, create/join course, XP sync,
course leaderboard, documents, notes, flashcards, teacher analytics, slide authoring),
printing PASS/FAIL per feature and exiting non-zero on failure.

```bash
node test-backend.js
```

Expected: **all checks pass** (a couple may **SKIP** — the signup check skips when
Supabase's hourly confirmation-email limit is hit, and the live AI check skips unless
an AI key is set). It reads the shared project + test accounts by default; override
with `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `NM_TEACHER_EMAIL/PW`, `NM_STUDENT_EMAIL/PW`.

---

## 5. Rebuild after code changes

After editing anything in `src/`:

```bash
jlpm run build            # rebuilds lib/ AND the bundle (both are needed)
```

Then restart `jupyter lab` (or refresh the tab if it was started with `--watch`).
Note: `jlpm run build` runs **both** `build:lib` (TypeScript → `lib/`) and the
webpack bundle — running only the bundle step does **not** pick up `.ts` edits.

---

## 6. Architecture

| Layer | Where | What |
|-------|-------|------|
| Frontend | `src/*.ts` | Screens (home, learn, explain, reader, teacher, leaderboard), course store, XP, Gemini/Anthropic calls |
| Server ext | `notebookmind/` | Serves API keys + Supabase config to the frontend (`/notebookmind/config`), reads a local `.env` |
| Backend | Supabase (Postgres) | `profiles`, `courses`, `course_enrollments`, `course_weeks`, `course_notebooks`, `documents`, `section_notes`, `flashcards`, `quiz_sessions`, `point_events`, `notebook_submissions`, `cell_attempts`, `cell_comments`, `notebook_challenges`; RPCs `get_course_leaderboard`, `join_course_by_invite`, `increment_points`, `get_course_student_performance`, `get_course_topic_stats` |
| DB setup | `supabase-migration.sql` + `migration2.sql … migration17.sql` | Schema + RLS + grants + RPCs (already applied to the shared project) |
| Seed | `seed-demo.js`, `seed-comments.js` | Fake classmates + demo-course activity, and seeded Explain-mode comments |

The Supabase schema is **already provisioned** on the shared project, so reviewers do
**not** need to run any migrations — just copy `.env` and sign in. The `migration*.sql`
files document how the DB was built and can re-provision a fresh project (they need a
Postgres connection string).

---

## 7. Troubleshooting

- **Login shows a "no backend / demo mode" banner** → `.env` is missing or wasn't
  loaded. Make sure you copied `.env.example` to `.env` and **restarted** `jupyter lab`.
  Verify the config endpoint (replace the token from the URL):
  `curl "http://localhost:8888/notebookmind/config?token=<token>"` — it should return
  the `supabase_url` and `supabase_anon_key`.
- **`jlpm: command not found`** → activate the venv and `pip install jupyterlab` first
  (`jlpm` is installed with JupyterLab).
- **Extension not showing / not built** → `jupyter labextension list` should list
  `notebookmind … enabled OK`. If not, re-run `jlpm run build` then
  `jupyter labextension develop . --overwrite`.
- **Port already in use** → JupyterLab picks 8889/8890; use the URL it prints.
- **Sign-up fails with "email rate limit exceeded"** → expected on the shared project
  (confirmation emails are rate-limited). Use the existing test accounts instead of
  creating a new one.
- **Backend tests fail on "project reachable"** → the free Supabase project may be
  cold-starting; re-run `node test-backend.js`.
