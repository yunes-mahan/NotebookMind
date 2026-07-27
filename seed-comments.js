// Seed real Explain-mode comments (cell_comments, migration 10) for the demo
// course, so the Explain tabs show live teacher notes + classmate comments on
// EVERY cell instead of the hardcoded demoData fallback. Idempotent: clears the
// seed accounts' demo-course comments first, then re-inserts.
//
// cell_index is the index into the notebook's CODE cells (markdown is filtered
// out by nbSource.extractCodeCells), 0-based. Both demo notebooks have 8 code
// cells → indices 0..7.
//
// Run seed-demo.js FIRST (it creates the fake student authors). Usage:
//   DATABASE_URL="postgresql://…" node seed-comments.js
//   (or PGHOST/PGUSER/PGPASSWORD/PGDATABASE/PGPORT env vars)

const { Client } = require('pg');
const DEMO = '00000000-0000-0000-0000-000000000001';
const PROF = 'notebookmind.prof@gmail.com';
const TEACHER_NAME = 'Dr. A. Lindqvist';

function fake(first) {
  return `nm.fake.${first}@example.com`;
}

// [notebook_key, cell_index, authorEmail, role, body]
const COMMENTS = [
  // ── learn_demo.ipynb — "Student performance analysis" (8 code cells) ──
  ['learn_demo.ipynb', 0, PROF, 'teacher',
    'Run this first. If the version line fails to print, your kernel isn’t the course environment — use **Restart & Run All** before you start.'],
  ['learn_demo.ipynb', 0, fake('alice'), 'student',
    'Heads up: on pandas < 2.0 the `groupby` in a later cell behaves differently. I upgraded and it matched the slides.'],

  ['learn_demo.ipynb', 1, PROF, 'teacher',
    'The `np.random.seed(...)` here is the whole point of week 1 — without it everyone gets different “random” students and your numbers won’t match mine.'],
  ['learn_demo.ipynb', 1, fake('carlos'), 'student',
    'I deleted the seed by accident and my pass rate changed on every run. Put it back!'],

  ['learn_demo.ipynb', 2, PROF, 'teacher',
    'Notice the score is study + sleep + **noise**. Keep the noise — a perfect formula would make the later correlation trivially 1.0.'],
  ['learn_demo.ipynb', 2, fake('priya'), 'student',
    'Watch the dtype of the score column — mine came out as `object` and `.mean()` silently returned NaN.'],

  ['learn_demo.ipynb', 3, PROF, 'teacher',
    '`students["passed"].mean()` gives the pass *rate* directly because `True == 1`. No manual counting needed.'],
  ['learn_demo.ipynb', 3, fake('mia'), 'student',
    'Boolean mean for a percentage is so clean — that clicked for me here.'],

  ['learn_demo.ipynb', 4, PROF, 'teacher',
    'After `groupby("group")`, remember `reset_index()` if you plan to merge or plot the result later.'],
  ['learn_demo.ipynb', 4, fake('lena'), 'student',
    'The groupby finally made sense once I printed the intermediate object before aggregating.'],
  ['learn_demo.ipynb', 4, fake('carlos'), 'student',
    '`reset_index()` was exactly what broke my week-2 merge — thanks!'],

  ['learn_demo.ipynb', 5, PROF, 'teacher',
    '`.corr()` returns a *matrix* — read the row for `exam_score`; don’t eyeball the whole grid.'],
  ['learn_demo.ipynb', 5, fake('tom'), 'student',
    'Sleep correlating less than study hours surprised me — good discussion point.'],

  ['learn_demo.ipynb', 6, PROF, 'teacher',
    'This cell trips people up the most. Set `figsize`, label **both** axes, and call `plt.show()` last or the figure won’t render inline.'],
  ['learn_demo.ipynb', 6, fake('omar'), 'student',
    'Mine showed a blank chart until I moved `plt.show()` to the very end of the cell.'],
  ['learn_demo.ipynb', 6, fake('nina'), 'student',
    'On the course kernel it rendered without `%matplotlib inline`, in case anyone was adding it.'],

  ['learn_demo.ipynb', 7, PROF, 'teacher',
    '`idxmax()` is cleaner than `sort_values(...).iloc[0]` when you only need the single top student.'],
  ['learn_demo.ipynb', 7, fake('sara'), 'student',
    'I used `nlargest(1)` instead — also works nicely.'],

  // ── test_analysis.ipynb — "Correlation & regression" (8 code cells) ──
  ['test_analysis.ipynb', 0, PROF, 'teacher',
    'Same environment check as the first notebook — get the version line to print before continuing.'],
  ['test_analysis.ipynb', 0, fake('alice'), 'student',
    'All good on 2.1.x here.'],

  ['test_analysis.ipynb', 1, PROF, 'teacher',
    '`seed(42)` again — deterministic data so we all compare the *same* “best month”.'],
  ['test_analysis.ipynb', 1, fake('james'), 'student',
    'If your best month differs from the slides, check you didn’t run the seed cell twice.'],

  ['test_analysis.ipynb', 2, PROF, 'teacher',
    '`profit = sales - expenses` is a **vectorised** column op — no loop. That’s the pandas mindset for the whole course.'],
  ['test_analysis.ipynb', 2, fake('priya'), 'student',
    'Adding the profit column before the groupby made the regional totals a one-liner.'],

  ['test_analysis.ipynb', 3, PROF, 'teacher',
    'Aggregate several columns at once with a dict: `.agg({"sales":"sum","profit":"sum"})`.'],
  ['test_analysis.ipynb', 3, fake('mia'), 'student',
    'Sorting the regional summary by profit makes the story jump out.'],

  ['test_analysis.ipynb', 4, PROF, 'teacher',
    '`idxmax()` returns the *index label*; then `.loc[...]` the row. Don’t confuse it with `max()` (the value).'],
  ['test_analysis.ipynb', 4, fake('omar'), 'student',
    'I used `max()` and got a number instead of the month — `idxmax()` fixed it.'],

  ['test_analysis.ipynb', 5, PROF, 'teacher',
    'Two series on one axis: call `ax.plot(...)` twice and add `ax.legend()`. Label the x-axis with the month.'],
  ['test_analysis.ipynb', 5, fake('lena'), 'student',
    'Adding `ax.legend()` was the missing piece for me.'],

  ['test_analysis.ipynb', 6, PROF, 'teacher',
    '`.rolling(3).mean()` leaves the first two rows as NaN **by design** — that’s correct, don’t fill them with 0.'],
  ['test_analysis.ipynb', 6, fake('nina'), 'student',
    'The leading NaNs confused me at first; good to know they’re expected.'],
  ['test_analysis.ipynb', 6, fake('tom'), 'student',
    'Use `min_periods=1` if you really want a value from row 1, but the default matches the slides.'],

  ['test_analysis.ipynb', 7, PROF, 'teacher',
    'Correlation is **not** causation — say so explicitly in your write-up. A high `r` just means they move together.'],
  ['test_analysis.ipynb', 7, fake('carlos'), 'student',
    'Plotting the scatter first helped me spot the outlier before computing `r`.'],
  ['test_analysis.ipynb', 7, fake('sara'), 'student',
    '`r` is close to 1 here because expenses scale with sales — makes sense.']
];

(async () => {
  const conn = process.env.DATABASE_URL || process.env.SUPABASE_DB_URL;
  const c = conn
    ? new Client({ connectionString: conn, ssl: { rejectUnauthorized: false } })
    : new Client({ ssl: { rejectUnauthorized: false } }); // reads PG* env vars
  await c.connect();

  // Resolve author user_ids + display names by email.
  const emails = [...new Set(COMMENTS.map(x => x[2]))];
  const users = await c.query(
    `select u.id, u.email, coalesce(p.display_name, '') as name
       from auth.users u left join public.profiles p on p.user_id = u.id
      where u.email = any($1)`,
    [emails]
  );
  const byEmail = {};
  for (const r of users.rows) byEmail[r.email] = { id: r.id, name: r.name };

  const missing = emails.filter(e => !byEmail[e]);
  if (missing.length) {
    console.error('Missing accounts (run setup-accounts.js + seed-demo.js first):', missing.join(', '));
    process.exit(1);
  }

  await c.query('begin');
  // Idempotent: clear these authors' demo-course comments, then re-insert.
  await c.query(
    'delete from public.cell_comments where course_id=$1 and user_id = any($2)',
    [DEMO, Object.values(byEmail).map(v => v.id)]
  );
  for (const [key, idx, authorEmail, role, body] of COMMENTS) {
    const author = byEmail[authorEmail];
    const authorName = role === 'teacher' ? TEACHER_NAME : author.name || authorEmail.split('@')[0];
    await c.query(
      `insert into public.cell_comments
         (user_id,course_id,notebook_key,cell_index,role,author_name,body)
       values ($1,$2,$3,$4,$5,$6,$7)`,
      [author.id, DEMO, key, idx, role, authorName, body]
    );
  }
  await c.query('commit');

  const v = await c.query(
    `select notebook_key, count(*) n, count(*) filter (where role='teacher') teacher, count(*) filter (where role='student') student
       from public.cell_comments where course_id=$1 group by notebook_key order by 1`, [DEMO]);
  console.log(`Seeded ${COMMENTS.length} cell comments into the demo course:`);
  for (const r of v.rows)
    console.log(`  ${r.notebook_key}: ${r.n} (${r.teacher} teacher, ${r.student} student)`);
  await c.end();
})().catch(e => { console.error('ERR:', e.message); process.exit(1); });
