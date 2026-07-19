// Seed the demo course with fake students so the DB-backed features (course
// leaderboard, teacher analytics) show live data. Idempotent: re-running wipes
// the previous fake students + demo-course activity and recreates them.
//
// Fake students are inserted straight into auth.users (bcrypt password via
// pgcrypto) — same technique as setup-accounts.js — then enrolled in the demo
// course, opted into the leaderboard, and given notebook activity.
//
// Usage (pooler connection recommended — direct db.<ref> is IPv6-only):
//   PGHOST=aws-0-<region>.pooler.supabase.com PGPORT=5432 \
//   PGUSER=postgres.<ref> PGPASSWORD='<db password>' PGDATABASE=postgres \
//   node seed-demo.js
// or:  DATABASE_URL="postgresql://postgres.<ref>:<pw>@aws-0-<region>.pooler.supabase.com:5432/postgres" node seed-demo.js

const { Client } = require('pg');

const DEMO = '00000000-0000-0000-0000-000000000001';
const PASSWORD = 'Student123!'; // fake demo accounts — all share one password

// name, total points, this-week points
const STUDENTS = [
  ['Alice Martin', 342, 128],
  ['Priya Kapoor', 298, 96],
  ['Carlos Ruiz', 251, 74],
  ['Mia Chen', 224, 110],
  ['Tom Becker', 187, 52],
  ['James Owusu', 143, 38],
  ['Sara Lindholm', 96, 40]
];

// notebook_key must match what the app records (basename of the opened .ipynb),
// so seeded + real telemetry line up in the teacher dashboard.
// cells: per-cell target first-try success rate (0..1); lower = more struggle.
const NOTEBOOKS = [
  { key: 'learn_demo.ipynb', title: 'Student performance analysis', cells: [0.92, 0.78, 0.55, 0.7, 0.38] },
  { key: 'test_analysis.ipynb', title: 'Correlation & regression', cells: [0.83, 0.47, 0.66, 0.6] }
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

  // ── Anonymous cell attempts (per student, per cell) → struggle data ─
  const attempts = [];
  const n = STUDENTS.length;
  for (const nb of NOTEBOOKS) {
    nb.cells.forEach((rate, ci) => {
      const succeed = Math.round(rate * n);
      for (let s = 0; s < n; s++) {
        const ok = s < succeed;
        attempts.push([nb.key, ci, DEMO, ok, ok ? 1 : 2]);
      }
    });
  }
  // Bulk insert cell_attempts.
  const values = attempts
    .map((_, i) => `($${i * 5 + 1},$${i * 5 + 2},$${i * 5 + 3},$${i * 5 + 4},$${i * 5 + 5})`)
    .join(',');
  await c.query(
    `insert into public.cell_attempts(notebook_key,cell_index,course_id,succeeded,attempt_number) values ${values}`,
    attempts.flat()
  );

  // ── Notebook submissions (one per student per notebook they "did") ─
  for (let s = 0; s < STUDENTS.length; s++) {
    const [name] = STUDENTS[s];
    for (const nb of NOTEBOOKS) {
      // Higher-ranked students did more first-try; scale by their standing.
      const firstTry = Math.max(1, Math.round(nb.cells.length * (1 - s / (STUDENTS.length + 1))));
      const xp = firstTry * 4 + (nb.cells.length - firstTry) * 2;
      await c.query(
        `insert into public.notebook_submissions
           (user_id,course_id,notebook_key,notebook_title,xp_earned,cells_attempted,cells_first_try,completed_at)
         values ($1,$2,$3,$4,$5,$6,$7, now() - ($8 || ' hours')::interval)`,
        [ids[name], DEMO, nb.key, nb.title, xp, nb.cells.length, firstTry, s * 6]
      );
    }
  }

  await c.query('commit');

  const v = await c.query(
    `select p.display_name, p.points, p.leaderboard_opt_in
       from public.profiles p join public.course_enrollments e on e.user_id=p.user_id
      where e.course_id=$1 and p.display_name = any($2) order by p.points desc`,
    [DEMO, STUDENTS.map(s => s[0])]
  );
  console.log(`Seeded ${v.rows.length} fake students into the demo course:`);
  for (const r of v.rows) console.log(`  ${String(r.display_name).padEnd(18)} ${String(r.points).padStart(4)} pts  opt-in=${r.leaderboard_opt_in}`);
  console.log(`Cell attempts: ${attempts.length}, submissions: ${STUDENTS.length * NOTEBOOKS.length}`);
  await c.end();
})().catch(async e => {
  console.error('ERR:', e.message);
  process.exit(1);
});
