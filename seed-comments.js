// Seed real Explain-mode comments (cell_comments, migration 10) for the demo
// course, so the Explain tabs show live teacher notes + classmate comments
// instead of the hardcoded demoData fallback. Idempotent: clears the seed
// accounts' demo-course comments first, then re-inserts.
//
// Usage: DATABASE_URL="postgresql://…" node seed-comments.js

const { Client } = require('pg');
const DEMO = '00000000-0000-0000-0000-000000000001';

// notebook_key = basename of the opened .ipynb (matches what the app records).
const COMMENTS = [
  // [notebook_key, cell_index, authorEmail, role, body]
  ['learn_demo.ipynb', 0, 'notebookmind.prof@gmail.com', 'teacher',
    'Focus on the **vectorised** operations here — avoid Python loops over the DataFrame; pandas does the heavy lifting.'],
  ['learn_demo.ipynb', 0, 'nm.fake.alice@example.com', 'student',
    'The groupby part finally clicked once I printed the intermediate result before aggregating.'],
  ['learn_demo.ipynb', 0, 'nm.fake.carlos@example.com', 'student',
    'I kept forgetting reset_index() after groupby — that was breaking my later merge.'],
  ['learn_demo.ipynb', 2, 'nm.fake.priya@example.com', 'student',
    'Watch the dtype of the score column — mine was a string and the mean silently failed.'],
  ['test_analysis.ipynb', 1, 'notebookmind.prof@gmail.com', 'teacher',
    'Remember: correlation is **not** causation. State that explicitly in your write-up.'],
  ['test_analysis.ipynb', 1, 'nm.fake.mia@example.com', 'student',
    'Plotting the scatter first helped me spot the outlier before I computed r.']
];

function nameFromEmail(e) {
  return e.split('@')[0].replace('nm.fake.', '').replace(/[._]/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

(async () => {
  const c = new Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();

  // Resolve author user_ids by email.
  const emails = [...new Set(COMMENTS.map(x => x[2]))];
  const users = await c.query('select id,email from auth.users where email = any($1)', [emails]);
  const idByEmail = {};
  for (const r of users.rows) idByEmail[r.email] = r.id;

  const missing = emails.filter(e => !idByEmail[e]);
  if (missing.length) {
    console.error('Missing accounts (run setup-accounts.js / seed-demo.js first):', missing.join(', '));
    process.exit(1);
  }

  await c.query('begin');
  // Idempotent: clear these authors' demo-course comments, then re-insert.
  await c.query(
    'delete from public.cell_comments where course_id=$1 and user_id = any($2)',
    [DEMO, Object.values(idByEmail)]
  );
  for (const [key, idx, email, role, body] of COMMENTS) {
    await c.query(
      `insert into public.cell_comments
         (user_id,course_id,notebook_key,cell_index,role,author_name,body)
       values ($1,$2,$3,$4,$5,$6,$7)`,
      [idByEmail[email], DEMO, key, idx, role,
       role === 'teacher' ? 'Dr. A. Lindqvist' : nameFromEmail(email), body]
    );
  }
  await c.query('commit');

  const v = await c.query(
    `select notebook_key, cell_index, role, author_name, left(body,48) as preview
       from public.cell_comments where course_id=$1
      order by notebook_key, cell_index, created_at`, [DEMO]);
  console.log(`Seeded ${v.rows.length} cell comments into the demo course:`);
  for (const r of v.rows)
    console.log(`  ${r.notebook_key} c${r.cell_index} [${r.role}] ${r.author_name}: ${r.preview}…`);
  await c.end();
})().catch(e => { console.error('ERR:', e.message); process.exit(1); });
