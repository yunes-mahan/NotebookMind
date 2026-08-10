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

### Option A — one command (recommended)

Clone, then run the setup script for your OS. It creates the venv, installs
JupyterLab, builds the extension, links it, and copies `.env` (connected mode).

```bash
git clone https://github.com/yunes-mahan/NotebookMind.git
cd NotebookMind        # the default branch (master) is the current version

# macOS / Linux:
./setup.sh   &&  ./run.sh

# Windows (PowerShell):
#   .\setup.ps1   ;   .\run.ps1
```

Then open the URL JupyterLab prints and sign in with an account from section 3.

### Option B — manual steps

The same steps by hand (works on **macOS / Linux** and **Windows** — only the two
marked lines differ):

```bash
# 1) Clone the repo (its default branch, master, is the current version)
git clone https://github.com/yunes-mahan/NotebookMind.git
cd NotebookMind

# 2) Create and activate a Python virtual environment
python3 -m venv venv
source venv/bin/activate            # Windows (PowerShell): venv\Scripts\Activate.ps1
python -m pip install --upgrade pip

# 3) Install the Python deps: JupyterLab + kernel + the notebooks' libraries
pip install -r requirements.txt     # jupyterlab, ipykernel, numpy, pandas, matplotlib

# 4) Register THIS venv's Python as the notebook kernel (so cell runs find numpy etc.)
python -m ipykernel install --sys-prefix --name python3 --display-name "Python 3 (NotebookMind)"

# 5) Build the extension (frontend) and install it in dev mode
jlpm install                        # JS dependencies (jlpm ships with JupyterLab)
jlpm run build                      # TypeScript -> lib/ , then bundle -> notebookmind/labextension/
pip install -e .                    # installs the Python package AND registers the extension
# Optional (older JupyterLab, live-reload link — safe to skip / may no-op):
# jupyter labextension develop . --overwrite

# 6) Configure the backend (Supabase) — turnkey, values are public-safe
cp .env.example .env                # Windows: copy .env.example .env

# 7) Run
jupyter lab
```

> **Why step 4 matters:** the course notebooks import `numpy`, `pandas` and
> `matplotlib`. The kernel must be **this venv's** Python (where step 3 installed
> them). If a stray `python` on your PATH is used instead, every cell run fails
> with `ModuleNotFoundError` and the `import numpy as np` cascade leaves `np`
> undefined. `--sys-prefix` binds the kernel to the venv by absolute path.
> (`setup.sh` / `setup.ps1` do steps 3–4 for you.)

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

**Demo course:** *Data Science Fundamentals* (code `DS101`) — **invite code `DEMO2025`**.
The teacher owns it; the student (and 7 seeded classmates) are enrolled.

**Seeded classmates** (so the leaderboard & analytics show live data): Alice, Priya,
Carlos, Mia, Tom, James, Sara — emails `nm.fake.<first>@example.com`, password
`Student123!`, all enrolled in the demo course.

> Sign in with these accounts — **no signup needed**. (Creating a brand-new account
> triggers a confirmation email, which is rate-limited on the shared project.)

### What to try
- **As the teacher:** sign in → the **Teacher** tab → **Overview**. You get a
  per-student roster ranked by XP, a **Topic understanding** graph (what the class
  grasped vs. where it struggled), "Where students struggle", and an algorithmic
  summary — all computed live from the real database (the roster & plots update
  **without a reload** as students join and work). A **Generate AI insights** button
  produces an AI write-up on demand (it never runs on its own, to save credits).
  Under **Weeks & content** you can edit tasks, lock/unlock notebooks, and edit notes.
- **As a student:** sign in → **Course** → open a notebook → **Learn** to solve
  challenges (earns XP, records telemetry) or **Explain** to read cell-by-cell.
  Open **Leaderboard** to see the course ranking. Join another course with an
  **invite code** from the sidebar course switcher.
- **Friends & sharing:** **Leaderboard → Friends & profile** → add a friend by their
  email. Comparing stats is **opt-in and mutual** — you only see each other's XP once
  **both** of you share; either side can withdraw at any time.
- **Account:** **Edit profile** updates your name/photo (persists across reloads). The
  same dialog has a **Delete account** danger zone that permanently removes your account
  and all your data.
- **Live updates:** open the app in two windows (teacher + student). When the student
  joins, submits, or posts a comment, the teacher's dashboard and the Explain tabs
  update **live**, with no reload (Supabase Realtime).
- **Private notes:** in **Explain**, click a cell's margin to add a yellow **Note**.
  It saves to your account, survives reload, and is **private to you** — classmates
  and the teacher never see it (unlike the shared teacher-notes/comments tabs).
- **Local, no backend:** on the Course screen, **"Bring your own notebook"** lets you
  upload any `.ipynb` and learn it — works with no account/DB.

### AI (optional)
Everything above — **accounts, courses, data storage, leaderboard, teacher analytics,
Learn/Explain** — works with **no AI key**: challenges, explanations, quizzes and
insights fall back to deterministic built-in output. To test **real LLM generation**,
**open the `.env` file you created in step 5** (in the project root, next to
`README.md`), set the key on the `GEMINI_API_KEY` line, save, and restart JupyterLab:

```bash
# .env  — the server (notebookmind/config.py) reads this and passes it to the app
GEMINI_API_KEY=your_google_ai_studio_key     # free tier: https://aistudio.google.com/apikey
# …or paste an Anthropic key on the same line instead (auto-detected):
# GEMINI_API_KEY=sk-ant-...
```

(The same `.env` holds `SUPABASE_URL` / `SUPABASE_ANON_KEY`, already filled in from
`.env.example`. An optional `ELEVENLABS_API_KEY` line enables text-to-speech.)

We intentionally do **not** ship an AI key — provider keys are billable and must not be
committed. A free Gemini key takes ~2 minutes to create.

---

## 4. Run the backend tests

`test-backend.js` exercises the **real Supabase backend** with the same
`@supabase/supabase-js` client the app uses, printing PASS/FAIL/SKIP per feature and
exiting non-zero on failure (so it can gate a commit or CI). It self-cleans after
itself (throwaway course, docs, friend links, avatar restore).

```bash
node test-backend.js
```

**What it covers** (23 sections, 76 checks — a default run reports **71 pass, 5 skip**;
the 5 skips all unlock with the extra credentials described below):

- **Auth** — sign in, invalid-credentials rejected, sign up
- **Profiles & roles**, and **profile edit persistence** (display name + avatar survive reload)
- **Courses** — create, read back, **join by invite code**
- **Teacher dashboard** — a student who joins **appears on the professor's dashboard**
  with real **performance** (attempts, first-try %), plus **per-topic understanding**;
  a non-teacher is correctly denied that data
- **XP / points** sync, and the **opt-in, course-scoped leaderboard**
- **Documents**, **section notes**, **flashcards** (SM-2 review persists)
- **Cell attempts** + teacher struggle aggregate, **notebook submissions**, **week slides**
- **Course notebook sync** (teacher publishes content → enrolled student loads it)
- **Explain-mode notes & comments** persist (teacher notes + peer comments)
- **Private per-cell notes** — a student's margin notes save to their own account,
  survive reload, and stay private (another user cannot read them)
- **AI challenge cache** (a generated challenge reloads without re-running the AI)
- **Personal file upload** to the account (appears in *My materials*, survives reload)
- **Friend requests & sharing** — send by email, one-directional (stats hidden) →
  accept → mutual (stats visible) → withdraw; unknown-email and self-request rejected
- **Delete account** — full round-trip: create a throwaway user, delete via the RPC,
  verify it's gone and can no longer sign in (see the DB note below)
- **Realtime (live updates)** — the collaboration tables are in the realtime
  publication, and a live INSERT event is delivered over the socket
- **AI generation** — a live LLM completion (needs an AI key)

**Run everything, including the live AI + destructive delete tests:**

```bash
# macOS / Linux
GEMINI_API_KEY=your_key \
NM_DB_URL="postgresql://postgres:<PASSWORD>@db.<ref>.supabase.co:5432/postgres" \
node test-backend.js
```

Expected: **all checks pass**. The five **SKIP**s on a default run are normal:

- *Sign up* skips when Supabase's hourly confirmation-email limit is hit (a project
  throttle, not a failure) — or set `NM_TEST_SIGNUP=0` to skip it deliberately.
- *AI generation* skips unless `GEMINI_API_KEY` (or an `sk-ant-…` Anthropic key) is set.
- *Delete account (destructive round-trip)* skips unless a direct Postgres URL is given
  via **`NM_DB_URL`** (or `DATABASE_URL`) — the public anon key can't create the
  confirmed throwaway user the test needs. Without it, the suite still verifies the
  `delete_my_account` RPC is deployed (a safe, non-destructive probe).
- *Realtime publication membership* skips unless `NM_DB_URL` is given — reading
  `pg_publication_tables` needs a direct Postgres connection. The companion check
  (a live INSERT actually delivered over the socket) always runs.
- *Local (on-device) upload* is IndexedDB — browser-only, so it's verified in the UI.

It targets the shared project + test accounts by default; override with
`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `NM_TEACHER_EMAIL/PW`, `NM_STUDENT_EMAIL/PW`.

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
| Backend | Supabase (Postgres) | `profiles`, `courses`, `course_enrollments`, `course_weeks`, `course_notebooks`, `documents`, `section_notes`, `flashcards`, `quiz_sessions`, `point_events`, `notebook_submissions`, `cell_attempts`, `cell_comments`, `notebook_challenges`, `friend_shares`, `cell_notes`; RPCs `get_course_leaderboard`, `join_course_by_invite`, `increment_points`, `get_course_student_performance`, `get_course_topic_stats`, `request_friend`, `get_my_friends`, `delete_my_account`. Live updates via **Supabase Realtime** (migration 20) on the collaboration tables. |
| DB setup | `supabase-migration.sql` + `migration2.sql … migration21.sql` | Schema + RLS + grants + RPCs + realtime (already applied to the shared project) |
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
- **Notebook cells fail with `ModuleNotFoundError: No module named 'numpy'`/`'matplotlib'`, or `name 'np' is not defined`** → the kernel is running against the wrong Python. Fix it by installing the libs into the venv and re-binding the kernel to the venv interpreter:
  `pip install -r requirements.txt` then
  `python -m ipykernel install --sys-prefix --name python3 --display-name "Python 3 (NotebookMind)"`,
  then restart JupyterLab. Verify a notebook runs end-to-end with
  `jupyter nbconvert --to notebook --execute --stdout learn_demo.ipynb`.
- **Port already in use** → JupyterLab picks 8889/8890; use the URL it prints.
- **Sign-up fails with "email rate limit exceeded"** → expected on the shared project
  (confirmation emails are rate-limited). Use the existing test accounts instead of
  creating a new one.
- **Backend tests fail on "project reachable"** → the free Supabase project may be
  cold-starting; re-run `node test-backend.js`.
- **Backend tests fail only on "Realtime delivers a live INSERT event"** → the
  Realtime socket subscribes but the event can exceed the timeout on a cold or
  busy free project. It is the one timing-dependent check in the suite; re-run
  `node test-backend.js`.
