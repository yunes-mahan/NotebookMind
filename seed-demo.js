// Seed the demo course with fake students so the DB-backed features (course
// leaderboard, per-student roster, topic-understanding plot, "where students
// struggle", AI insights) all show rich, believable data. Idempotent: re-running
// wipes the previous fake students + demo-course activity and recreates them.
//
// Fake students are inserted straight into auth.users (bcrypt password via
// pgcrypto) — same technique as setup-accounts.js — then enrolled in the demo
// course, opted into the leaderboard, and given notebook activity:
//   • notebook_submissions across the 5 *available* course notebooks  → roster +
//     topic-understanding plot (grouped by notebook_title) + insights
//   • cell_attempts for every cell of the 2 real notebooks            → the
//     anonymous "where students struggle" per-cell chart
//   • point_events (course-scoped)                                    → leaderboard
//
// Usage (direct host works; the pooler is also fine):
//   PGHOST=db.<ref>.supabase.co PGPORT=5432 \
//   PGUSER=postgres PGPASSWORD='<db password>' PGDATABASE=postgres \
//   node seed-demo.js
// or:  DATABASE_URL="postgresql://postgres:<pw>@db.<ref>.supabase.co:5432/postgres" node seed-demo.js

const { Client } = require('pg');

const DEMO = '00000000-0000-0000-0000-000000000001';
const PASSWORD = 'Student123!'; // fake demo accounts — all share one password

// name, total points, this-week points. Ordered strongest → weakest so the
// roster, leaderboard and per-topic first-try rates all line up believably.
const STUDENTS = [
  ['Alice Martin', 342, 128],
  ['Priya Kapoor', 298, 96],
  ['Carlos Ruiz', 251, 74],
  ['Mia Chen', 224, 110],
  ['Lena Vogt', 205, 88],
  ['Tom Becker', 187, 52],
  ['Omar Haddad', 168, 60],
  ['James Owusu', 143, 38],
  ['Nina Petrova', 121, 44],
  ['Sara Lindholm', 96, 40]
];

// The course's *available* notebooks (weeks 1–3). notebook_title is what the
// teacher's topic-understanding plot groups by, so these read as real topics.
// `rate` = target class first-try rate (0..1); lower = the class struggled more.
// Only learn_demo.ipynb + test_analysis.ipynb are real files (real === true) — the
// per-cell struggle chart is seeded for those; the rest still count toward each
// student's "notebooks completed" and the topic plot.
const TOPICS = [
  { key: 'nb-foundations', title: 'NumPy & pandas intro', cells: 6, rate: 0.86 },
  { key: 'nb-reproducible', title: 'Reproducible datasets', cells: 5, rate: 0.8 },
  { key: 'learn_demo.ipynb', title: 'Student performance analysis', cells: 8, rate: 0.66, real: true,
    cellRates: [0.95, 0.88, 0.72, 0.68, 0.6, 0.5, 0.42, 0.7] },
  { key: 'nb-eda', title: 'Sales data EDA', cells: 6, rate: 0.54 },
  { key: 'test_analysis.ipynb', title: 'Correlation & regression', cells: 8, rate: 0.45, real: true,
    cellRates: [0.9, 0.82, 0.66, 0.58, 0.62, 0.4, 0.36, 0.48] }
];

function email(name) {
  return 'nm.fake.' + name.split(' ')[0].toLowerCase() + '@example.com';
}

function makeClient() {
  const conn = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  if (!conn && !process.env.PGHOST) {
    console.error('Set DATABASE_URL or PGHOST/PGUSER/PGPASSWORD/PGDATABASE/PGPORT.');
    process.exit(1);
  }
  return conn
    ? new Client({ connectionString: conn, ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000 })
    : new Client({ ssl: { rejectUnauthorized: false }, connectionTimeoutMillis: 10000 });
}

/** The pooler occasionally rejects right after a password reset — retry. */
async function connectWithRetry(tries = 6) {
  for (let i = 1; i <= tries; i++) {
    const c = makeClient();
    try {
      await c.connect();
      return c;
    } catch (e) {
      try { await c.end(); } catch {}
      if (i === tries) throw e;
      console.log(`connect attempt ${i} failed (${e.message}), retrying…`);
      await new Promise(r => setTimeout(r, 8000));
    }
  }
}

/** How many of the TOPICS a student (rank r, 0 = strongest) has completed:
 *  everyone did the week-1/2 basics; only stronger students reached week 3. */
function topicsDoneFor(r, total) {
  if (r < 4) return TOPICS.length;        // top 4 finished all 5
  if (r < 7) return TOPICS.length - 1;    // next 3 did 4
  return TOPICS.length - 2;               // last 3 did 3
}

(async () => {
  const c = await connectWithRetry();
  await c.query('begin');

  // ── Wipe previous seed ──────────────────────────────────────────
  const emails = STUDENTS.map(s => email(s[0]));
  await c.query('delete from auth.users where email = any($1)', [emails]); // cascades profiles/enrollments/submissions
  await c.query('delete from public.cell_attempts where course_id = $1', [DEMO]); // anonymous rows — not cascaded
  await c.query('delete from public.point_events where course_id = $1', [DEMO]); // point_events has no user FK — not cascaded

  // ── Create fake students ────────────────────────────────────────
  const ids = {};
  for (const [name] of STUDENTS) {
    const e = email(name);
    const u = await c.query(
      `insert into auth.users
         (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
          raw_app_meta_data,raw_user_meta_data,created_at,updated_at,
          confirmation_token,recovery_token,email_change_token_new,email_change,
          email_change_token_current,reauthentication_token)
       values
         ('00000000-0000-0000-0000-000000000000',gen_random_uuid(),'authenticated','authenticated',
          $1,crypt($2,gen_salt('bf')),now(),
          '{"provider":"email","providers":["email"]}',jsonb_build_object('display_name',$3::text),now(),now(),
          '','','','','','')
       returning id`,
      [e, PASSWORD, name]
    );
    const id = u.rows[0].id;
    ids[name] = id;
    await c.query(
      `insert into auth.identities (provider_id,user_id,identity_data,provider,last_sign_in_at,created_at,updated_at)
       values ($1::text,$1::uuid,jsonb_build_object('sub',$1::text,'email',$2::text),'email',now(),now(),now())`,
      [id, e]
    );
  }

  // ── Profiles: points + opt-in + enroll in the demo course ───────
  for (const [name, points, weekly] of STUDENTS) {
    const id = ids[name];
    await c.query(
      `update public.profiles
         set role='student', display_name=$2, points=$3, weekly_points=$4, leaderboard_opt_in=true
       where user_id=$1`,
      [id, name, points, weekly]
    );
    await c.query(
      'insert into public.course_enrollments(user_id,course_id) values ($1,$2) on conflict do nothing',
      [id, DEMO]
    );
    // Course-scoped XP for the per-course leaderboard (migration 9): the course
    // ranking sums point_events for this course, not the global profiles.points.
    // Split into an older bulk event + a recent one so weekly_points matches too.
    await c.query(
      `insert into public.point_events(user_id,points,reason,course_id,created_at)
       values ($1,$2,'seed',$3, now() - interval '10 days')`,
      [id, Math.max(0, points - weekly), DEMO]
    );
    if (weekly > 0) {
      await c.query(
        `insert into public.point_events(user_id,points,reason,course_id,created_at)
         values ($1,$2,'seed',$3, now() - interval '1 day')`,
        [id, weekly, DEMO]
      );
    }
  }

  // ── Notebook submissions across the available topics ────────────
  // Drives the per-student roster (notebooks completed, first-try %) and the
  // teacher's topic-understanding plot (grouped by notebook_title).
  let subCount = 0;
  for (let s = 0; s < STUDENTS.length; s++) {
    const [name] = STUDENTS[s];
    const skill = 1 - s * 0.02; // stronger students first-try a bit more
    const done = topicsDoneFor(s, STUDENTS.length);
    for (let t = 0; t < done; t++) {
      const nb = TOPICS[t];
      const firstTry = Math.min(nb.cells, Math.max(1, Math.round(nb.cells * nb.rate * skill)));
      const xp = firstTry * 4 + (nb.cells - firstTry) * 2;
      await c.query(
        `insert into public.notebook_submissions
           (user_id,course_id,notebook_key,notebook_title,xp_earned,cells_attempted,cells_first_try,completed_at)
         values ($1,$2,$3,$4,$5,$6,$7, now() - ($8 || ' hours')::interval)`,
        [ids[name], DEMO, nb.key, nb.title, xp, nb.cells, firstTry, s * 5 + t]
      );
      subCount++;
    }
  }

  // ── Anonymous cell attempts for the 2 REAL notebooks (all cells) ─
  // Feeds the anonymous "where students struggle" per-cell chart. One row per
  // student per cell; ~cellRate of the class succeeds first try, the rest retry.
  const attempts = [];
  const n = STUDENTS.length;
  for (const nb of TOPICS.filter(t => t.real)) {
    nb.cellRates.forEach((rate, ci) => {
      const succeed = Math.round(rate * n);
      for (let s = 0; s < n; s++) {
        const ok = s < succeed;
        attempts.push([nb.key, ci, DEMO, ok, ok ? 1 : 2]);
      }
    });
  }
  const values = attempts
    .map((_, i) => `($${i * 5 + 1},$${i * 5 + 2},$${i * 5 + 3},$${i * 5 + 4},$${i * 5 + 5})`)
    .join(',');
  await c.query(
    `insert into public.cell_attempts(notebook_key,cell_index,course_id,succeeded,attempt_number) values ${values}`,
    attempts.flat()
  );

  await c.query('commit');

  // ── Report ──────────────────────────────────────────────────────
  const v = await c.query(
    `select p.display_name, p.points, count(s.*) as notebooks
       from public.profiles p
       join public.course_enrollments e on e.user_id = p.user_id and e.course_id = $1
       left join public.notebook_submissions s on s.user_id = p.user_id and s.course_id = $1
      where p.display_name = any($2)
      group by p.display_name, p.points order by p.points desc`,
    [DEMO, STUDENTS.map(s => s[0])]
  );
  console.log(`Seeded ${v.rows.length} fake students into the demo course:`);
  for (const r of v.rows)
    console.log(`  ${String(r.display_name).padEnd(16)} ${String(r.points).padStart(4)} pts  ${r.notebooks} notebooks`);
  console.log(`Submissions: ${subCount}  ·  cell attempts: ${attempts.length}  ·  topics: ${TOPICS.length}`);
  await c.end();
})().catch(async e => {
  console.error('ERR:', e.message);
  process.exit(1);
});
