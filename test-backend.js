/* eslint-disable */
/**
 * NotebookMind — Backend feature test suite
 * =========================================
 * Exercises the real Supabase backend the app depends on, using the very same
 * @supabase/supabase-js client the frontend uses. Run this after any change to
 * confirm every backend feature still works.
 *
 *   node test-backend.js
 *
 * It prints PASS / FAIL / SKIP per feature and exits non-zero if anything FAILs,
 * so it can gate a commit or CI.
 *
 * Configuration (all optional — sensible defaults target the shared demo project
 * and the disposable test accounts in TEST_CREDENTIALS.txt):
 *   SUPABASE_URL, SUPABASE_ANON_KEY
 *   NM_TEACHER_EMAIL, NM_TEACHER_PW, NM_STUDENT_EMAIL, NM_STUDENT_PW
 *   GEMINI_API_KEY  or  ANTHROPIC_API_KEY   → enables the live AI-generation test
 *   NM_TEST_SIGNUP=0                        → skip creating a throwaway signup account
 *
 * Notes on cleanup: documents (→ cascades to notes + flashcards), course_weeks and
 * courses created by this suite are deleted at the end. cell_attempts /
 * notebook_submissions have no DELETE policy, so those are written into a throwaway
 * course (never the demo course) to keep the real dashboards clean.
 */

const { createClient } = require('@supabase/supabase-js');

// ── Config ────────────────────────────────────────────────────────────────
const SUPABASE_URL =
  process.env.SUPABASE_URL || 'https://wzooaiwmnsqvxxcoormp.supabase.co';
const ANON_KEY =
  process.env.SUPABASE_ANON_KEY ||
  'sb_publishable_HcZ7s3WcO2HJD84XHVS3Yg_ZP19IhfR';

const TEACHER = {
  email: process.env.NM_TEACHER_EMAIL || 'notebookmind.prof@gmail.com',
  password: process.env.NM_TEACHER_PW || 'Teacher123!'
};
const STUDENT = {
  email: process.env.NM_STUDENT_EMAIL || 'notebookmind.student@gmail.com',
  password: process.env.NM_STUDENT_PW || 'Student123!'
};

const DEMO_COURSE_ID = '00000000-0000-0000-0000-000000000001';
const AI_KEY = process.env.GEMINI_API_KEY || process.env.ANTHROPIC_API_KEY || '';
const RUN_SIGNUP = process.env.NM_TEST_SIGNUP !== '0';

// ── Tiny test harness ─────────────────────────────────────────────────────
const C = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  dim: '\x1b[2m',
  bold: '\x1b[1m',
  cyan: '\x1b[36m'
};
const results = { pass: 0, fail: 0, skip: 0, failed: [] };

function section(title) {
  console.log(`\n${C.bold}${C.cyan}── ${title} ${'─'.repeat(Math.max(0, 52 - title.length))}${C.reset}`);
}
function check(name, ok, detail = '') {
  const tail = detail ? ` ${C.dim}— ${detail}${C.reset}` : '';
  if (ok) {
    results.pass++;
    console.log(`  ${C.green}✓ PASS${C.reset}  ${name}${tail}`);
  } else {
    results.fail++;
    results.failed.push(name);
    console.log(`  ${C.red}✗ FAIL${C.reset}  ${name}${tail}`);
  }
  return ok;
}
function skip(name, why = '') {
  results.skip++;
  console.log(`  ${C.yellow}• SKIP${C.reset}  ${name}${why ? ` ${C.dim}— ${why}${C.reset}` : ''}`);
}

function rand(n = 6) {
  const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: n }, () => a[Math.floor(Math.random() * a.length)]).join('');
}

/** Sign in with retries — the free Supabase project cold-starts on first hit. */
async function loginWithRetry(client, email, password, tries = 4) {
  let lastErr = null;
  for (let i = 0; i < tries; i++) {
    const { data, error } = await client.auth.signInWithPassword({ email, password });
    if (!error) {
      return { data, error: null };
    }
    lastErr = error;
    // Only the transient "Database error querying schema" is worth retrying.
    if (!/database error|fetch failed|timeout/i.test(error.message)) {
      break;
    }
    await new Promise(r => setTimeout(r, 900));
  }
  return { data: null, error: lastErr };
}

// ── Main ──────────────────────────────────────────────────────────────────
const cleanup = []; // array of async fns run in finally

async function main() {
  console.log(`${C.bold}NotebookMind backend test suite${C.reset}`);
  console.log(`${C.dim}target: ${SUPABASE_URL}${C.reset}`);

  const sbTeacher = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const sbStudent = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
  const sbAnon = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });

  let teacherId = null;
  let studentId = null;
  let tempCourseId = null;
  let docId = null;

  // ── 1. Connectivity & schema ───────────────────────────────────────────
  section('1. Connectivity & schema');
  {
    let status = 0;
    try {
      const r = await fetch(`${SUPABASE_URL}/auth/v1/health`, { headers: { apikey: ANON_KEY } });
      status = r.status;
    } catch (e) {
      status = 0;
    }
    check('Auth service reachable (project not paused)', status === 200, `HTTP ${status}`);

    // Reachability/schema check: an anon query must return cleanly. RLS correctly
    // returns 0 rows to an anonymous caller, so we assert "no error", not "found".
    // The demo course's existence + ownership is verified as the teacher in §4.
    const { error } = await sbAnon.from('courses').select('id').limit(1);
    check('REST/schema reachable (courses table)', !error, error ? error.message : 'ok');
  }

  // ── 2. Authentication ──────────────────────────────────────────────────
  section('2. Authentication');
  {
    const t = await loginWithRetry(sbTeacher, TEACHER.email, TEACHER.password);
    teacherId = t.data?.user?.id ?? null;
    check('Professor can sign in', !!teacherId, t.error ? t.error.message : TEACHER.email);

    const s = await loginWithRetry(sbStudent, STUDENT.email, STUDENT.password);
    studentId = s.data?.user?.id ?? null;
    check('Student can sign in', !!studentId, s.error ? s.error.message : STUDENT.email);

    // Negative test — wrong password must be rejected.
    const bad = await sbAnon.auth.signInWithPassword({ email: TEACHER.email, password: 'definitely-wrong-' + rand() });
    check('Invalid credentials are rejected', !!bad.error, bad.error ? bad.error.message : 'no error (BAD)');

    if (RUN_SIGNUP) {
      const email = `nm.autotest.${Date.now()}.${rand(4).toLowerCase()}@gmail.com`;
      const { data, error } = await sbAnon.auth.signUp({
        email,
        password: 'Test123!' + rand(4),
        options: { data: { display_name: 'Auto Test' } }
      });
      // A confirmation-email rate limit is a project throttle, not a feature
      // failure — the signup endpoint still worked, so treat it as a SKIP.
      if (error && /rate limit|too many|send rate|over_email/i.test(error.message)) {
        skip('Sign up creates a new account', `throttled: ${error.message}`);
      } else {
        const created = !error && !!data?.user?.id;
        const needsConfirm = created && !data.session;
        check('Sign up creates a new account', created, error ? error.message : needsConfirm ? 'user created (email confirmation required)' : 'user + session created');
      }
    } else {
      skip('Sign up creates a new account', 'NM_TEST_SIGNUP=0');
    }
  }

  const teacherOk = !!teacherId;
  const studentOk = !!studentId;

  // ── 3. Profiles & roles ────────────────────────────────────────────────
  section('3. Profiles & roles');
  if (teacherOk) {
    const { data, error } = await sbTeacher.from('profiles').select('role,display_name').eq('user_id', teacherId).single();
    check('Professor profile role = teacher', !error && data?.role === 'teacher', error ? error.message : `role=${data?.role}`);
  } else {
    skip('Professor profile role = teacher', 'no teacher session');
  }
  if (studentOk) {
    const { data, error } = await sbStudent.from('profiles').select('role,display_name').eq('user_id', studentId).single();
    check('Student profile role = student', !error && data?.role === 'student', error ? error.message : `role=${data?.role}`);
  } else {
    skip('Student profile role = student', 'no student session');
  }

  // ── 4. Course wiring ───────────────────────────────────────────────────
  section('4. Course wiring (demo course)');
  if (teacherOk) {
    const { data, error } = await sbTeacher.from('courses').select('teacher_id').eq('id', DEMO_COURSE_ID).single();
    check('Professor owns the demo course', !error && data?.teacher_id === teacherId, error ? error.message : '');
  } else {
    skip('Professor owns the demo course', 'no teacher session');
  }
  if (studentOk) {
    const { data, error } = await sbStudent.from('course_enrollments').select('course_id').eq('course_id', DEMO_COURSE_ID);
    check('Student is enrolled in the demo course', !error && Array.isArray(data) && data.length >= 1, error ? error.message : `rows=${data?.length}`);
  } else {
    skip('Student is enrolled in the demo course', 'no student session');
  }

  // ── 5. Create course as professor ──────────────────────────────────────
  section('5. Create course as professor');
  if (teacherOk) {
    const code = rand(6);
    const { data, error } = await sbTeacher
      .from('courses')
      .insert({ name: '__nmtest course', code, invite_code: code, teacher_id: teacherId, is_active: true })
      .select('id')
      .single();
    tempCourseId = data?.id ?? null;
    check('Professor can create a course', !error && !!tempCourseId, error ? error.message : `id=${tempCourseId}`);
    if (tempCourseId) {
      cleanup.push(async () => { await sbTeacher.from('courses').delete().eq('id', tempCourseId); });
      const { data: rd, error: re } = await sbTeacher.from('courses').select('name,code').eq('id', tempCourseId).single();
      check('Created course is readable back', !re && rd?.code === code, re ? re.message : '');
    }
    // NOTE: the DB lets any authenticated user create a course they own (WITH CHECK
    // teacher_id = auth.uid()). The "only teachers create courses" rule is enforced
    // in the UI via profile.role — so there is intentionally no negative RLS test here.
  } else {
    skip('Professor can create a course', 'no teacher session');
  }

  // ── 5b. Join course by invite code (RPC) ───────────────────────────────
  section('5b. Join course by invite');
  if (studentOk) {
    const { data, error } = await sbStudent.rpc('join_course_by_invite', { p_code: 'DEMO2025' });
    const ok = !error && Array.isArray(data) && data.length === 1 && data[0].id === DEMO_COURSE_ID;
    check('Student can join the demo course by invite code', ok, error ? error.message : data?.[0]?.name ?? 'no course returned');

    const bogus = await sbStudent.rpc('join_course_by_invite', { p_code: 'NOSUCH9' });
    check('Bogus invite code returns no course', !bogus.error && Array.isArray(bogus.data) && bogus.data.length === 0, bogus.error ? bogus.error.message : `rows=${bogus.data?.length}`);

    // Embedded-join used by the app's "my courses" list.
    const enr = await sbStudent.from('course_enrollments').select('courses(id,name)').eq('user_id', studentId);
    const listed = !enr.error && Array.isArray(enr.data) && enr.data.some(r => r.courses?.id === DEMO_COURSE_ID);
    check('Enrolled-courses list (embedded join) works', listed, enr.error ? enr.error.message : `rows=${enr.data?.length}`);
  } else {
    skip('Join course by invite', 'no student session');
  }

  // ── 6. XP / points sync ────────────────────────────────────────────────
  section('6. XP / points sync');
  if (studentOk) {
    // point_events is the audit log the app writes on every XP gain.
    const { error: peErr } = await sbStudent.from('point_events').select('id').eq('user_id', studentId).limit(1);
    check('point_events readable by owner', !peErr, peErr ? peErr.message : '');

    // The app increments profiles.points via the increment_points RPC. If this
    // is not callable, XP never reaches profiles.points and the leaderboard
    // (which ranks by profiles.points) stays at 0 for everyone.
    const before = (await sbStudent.from('profiles').select('points').eq('user_id', studentId).single()).data?.points ?? null;
    const { error: incErr } = await sbStudent.rpc('increment_points', { p_user_id: studentId, p_points: 3 });
    if (incErr) {
      check('XP sync RPC (increment_points) is callable', false, incErr.message + ' → XP will NOT reach profiles.points');
    } else {
      const after = (await sbStudent.from('profiles').select('points').eq('user_id', studentId).single()).data?.points ?? null;
      const ok = before !== null && after === before + 3;
      check('increment_points updates profiles.points', ok, `before=${before} after=${after}`);
      // Restore.
      await sbStudent.rpc('increment_points', { p_user_id: studentId, p_points: -3 });
    }
  } else {
    skip('XP / points sync', 'no student session');
  }

  // ── 7. Leaderboard (opt-in, course-scoped) ─────────────────────────────
  section('7. Leaderboard (opt-in, course-scoped)');
  if (studentOk) {
    const setOptIn = async v => sbStudent.from('profiles').update({ leaderboard_opt_in: v }).eq('user_id', studentId);
    await setOptIn(false);
    const r0 = await sbStudent.rpc('get_course_leaderboard', { p_course_id: DEMO_COURSE_ID });
    check('Course leaderboard RPC callable by enrolled student', !r0.error, r0.error ? r0.error.message : `rows=${r0.data?.length ?? 0}`);
    const names0 = Array.isArray(r0.data) ? r0.data.map(x => x.display_name) : [];

    const { data: prof } = await sbStudent.from('profiles').select('display_name').eq('user_id', studentId).single();
    const myName = prof?.display_name ?? 'Test Student';
    check('Opted-out student is hidden from the leaderboard', !names0.includes(myName), `board=[${names0.join(', ')}]`);

    await setOptIn(true);
    const r1 = await sbStudent.rpc('get_course_leaderboard', { p_course_id: DEMO_COURSE_ID });
    const names1 = Array.isArray(r1.data) ? r1.data.map(x => x.display_name) : [];
    check('Opted-in student appears on the leaderboard', names1.includes(myName), `board=[${names1.join(', ')}]`);

    // Restore opted-out (matches the UI's default so the opt-in card shows).
    cleanup.push(async () => { await setOptIn(false); });
  } else {
    skip('Leaderboard (opt-in, course-scoped)', 'no student session');
  }

  // ── 8. Documents (papers / slides persistence) ─────────────────────────
  section('8. Documents');
  if (studentOk) {
    const { data, error } = await sbStudent
      .from('documents')
      .insert({
        user_id: studentId,
        title: '__nmtest_doc',
        source_text: 'hello world',
        original_full_text: 'hello world',
        parts: [{ index: 0, title: 'Section 1', text: 'intro' }],
        total_sections: 1,
        last_opened_at: new Date().toISOString()
      })
      .select('id')
      .single();
    docId = data?.id ?? null;
    check('Student can create a document', !error && !!docId, error ? error.message : `id=${docId}`);
    if (docId) {
      cleanup.push(async () => { await sbStudent.from('documents').delete().eq('id', docId); });
      const { data: list, error: le } = await sbStudent.from('documents').select('id,title').eq('user_id', studentId);
      check('Document appears in the owner listing', !le && list?.some(d => d.id === docId), le ? le.message : `count=${list?.length}`);
    }
  } else {
    skip('Documents', 'no student session');
  }

  // ── 9. Section notes ───────────────────────────────────────────────────
  section('9. Section notes');
  if (studentOk && docId) {
    const noteText = 'my note ' + rand(4);
    const { error: ue } = await sbStudent.from('section_notes').upsert(
      { user_id: studentId, document_id: docId, section_index: 0, section_title: 'Section 1', note_text: noteText },
      { onConflict: 'document_id,section_index' }
    );
    check('Section note upserts', !ue, ue ? ue.message : '');
    const { data, error } = await sbStudent.from('section_notes').select('note_text').eq('document_id', docId).eq('section_index', 0).single();
    check('Section note reads back with the saved text', !error && data?.note_text === noteText, error ? error.message : '');
  } else {
    skip('Section notes', docId ? 'no student session' : 'no document created');
  }

  // ── 10. Flashcards (spaced repetition) ─────────────────────────────────
  section('10. Flashcards');
  if (studentOk && docId) {
    const now = new Date().toISOString();
    const payload = [
      { front: 'Q1', back: 'A1', card_type: 'term_definition' },
      { front: 'Q2', back: 'A2', card_type: 'concept' }
    ].map(c => ({
      user_id: studentId, document_id: docId, section_index: 0, section_title: 'Section 1',
      front: c.front, back: c.back, context_sentence: '', card_type: c.card_type,
      review_state: 'new', due_at: now, interval_days: 0, ease_factor: 2.5, repetitions: 0
    }));
    const { data, error } = await sbStudent.from('flashcards').insert(payload).select('id');
    const cardId = data?.[0]?.id ?? null;
    check('Flashcards insert for a section', !error && data?.length === 2, error ? error.message : `count=${data?.length}`);

    const { data: fetched, error: fe } = await sbStudent.from('flashcards').select('id,front').eq('document_id', docId).order('section_index');
    check('Flashcards fetch back for the document', !fe && fetched?.length >= 2, fe ? fe.message : `count=${fetched?.length}`);

    if (cardId) {
      const { error: upErr } = await sbStudent.from('flashcards').update({
        interval_days: 1, ease_factor: 2.6, repetitions: 1, due_at: new Date(Date.now() + 864e5).toISOString(), review_state: 'learning'
      }).eq('id', cardId);
      const { data: after } = await sbStudent.from('flashcards').select('review_state,repetitions').eq('id', cardId).single();
      check('Flashcard review update (SM-2 fields) persists', !upErr && after?.review_state === 'learning' && after?.repetitions === 1, upErr ? upErr.message : '');
    }
    // Cleanup piggybacks on the document delete (cascades to flashcards).
  } else {
    skip('Flashcards', docId ? 'no student session' : 'no document created');
  }

  // ── 11. Cell attempts + teacher struggle aggregate ─────────────────────
  section('11. Cell attempts + teacher aggregate');
  if (teacherOk && tempCourseId) {
    // Written into the throwaway course so the real demo dashboard stays clean.
    const rows = [
      { notebook_key: 'nb1', cell_index: 0, course_id: tempCourseId, succeeded: true, attempt_number: 1 },
      { notebook_key: 'nb1', cell_index: 1, course_id: tempCourseId, succeeded: false, attempt_number: 1 },
      { notebook_key: 'nb1', cell_index: 1, course_id: tempCourseId, succeeded: true, attempt_number: 2 }
    ];
    const { error: ie } = await sbTeacher.from('cell_attempts').insert(rows);
    check('Cell attempts insert (learn-mode telemetry)', !ie, ie ? ie.message : `${rows.length} rows`);

    const { data, error } = await sbTeacher.from('cell_attempts').select('notebook_key,cell_index,succeeded').eq('course_id', tempCourseId);
    check('Teacher can read cell attempts for their course', !error && data?.length >= 3, error ? error.message : `rows=${data?.length}`);

    if (data && data.length) {
      // Aggregate exactly like getCellFailStats(): success rate per (nb, cell).
      const map = new Map();
      for (const r of data) {
        const k = `${r.notebook_key}::${r.cell_index}`;
        const cur = map.get(k) || { total: 0, ok: 0 };
        cur.total++; if (r.succeeded) cur.ok++;
        map.set(k, cur);
      }
      const cell1 = map.get('nb1::1');
      check('Struggle aggregate computes success_rate correctly', cell1 && Math.abs(cell1.ok / cell1.total - 0.5) < 1e-9, cell1 ? `nb1/cell1 rate=${(cell1.ok / cell1.total).toFixed(2)}` : 'missing');
    }
  } else {
    skip('Cell attempts + teacher aggregate', tempCourseId ? 'no teacher session' : 'no temp course');
  }

  // ── 12. Notebook submissions + teacher read ────────────────────────────
  section('12. Notebook submissions');
  if (teacherOk && tempCourseId) {
    const { error: ie } = await sbTeacher.from('notebook_submissions').insert({
      user_id: teacherId, course_id: tempCourseId, notebook_key: 'nb1',
      notebook_title: 'Intro notebook', xp_earned: 24, cells_attempted: 5, cells_first_try: 4
    });
    check('Notebook submission insert', !ie, ie ? ie.message : '');
    const { data, error } = await sbTeacher.from('notebook_submissions').select('xp_earned,cells_first_try,cells_attempted').eq('course_id', tempCourseId);
    check('Teacher can read submissions for their course', !error && data?.length >= 1, error ? error.message : `rows=${data?.length}`);
  } else {
    skip('Notebook submissions', tempCourseId ? 'no teacher session' : 'no temp course');
  }

  // ── 13. Course weeks / slides authoring ────────────────────────────────
  section('13. Course weeks & slides (teacher authoring)');
  if (teacherOk && tempCourseId) {
    const { data: doc, error: de } = await sbTeacher.from('documents').insert({
      user_id: teacherId, title: '__nmtest_slides', source_text: 'slide text', original_full_text: 'slide text',
      parts: [{ index: 0, title: 'Page 1', text: 'slide 1', imageBase64: null, width: 1024, height: 576 }],
      total_sections: 1, is_course_material: true, course_id: tempCourseId, doc_type: 'slides',
      last_opened_at: new Date().toISOString()
    }).select('id').single();
    check('Slides document upsert (course material)', !de && !!doc?.id, de ? de.message : '');
    if (doc?.id) {
      cleanup.push(async () => { await sbTeacher.from('documents').delete().eq('id', doc.id); });
      const { error: we } = await sbTeacher.from('course_weeks').upsert(
        { course_id: tempCourseId, week_number: 1, theme: 'Week 1', topics: ['intro'], slides_document_id: doc.id, is_unlocked: true },
        { onConflict: 'course_id,week_number' }
      );
      check('Course week upsert linking the slide deck', !we, we ? we.message : '');
      // Read back the way getSupaWeekSlides() does.
      const { data: wk } = await sbTeacher.from('course_weeks').select('slides_document_id').eq('course_id', tempCourseId).eq('week_number', 1).single();
      const { data: back } = wk?.slides_document_id
        ? await sbTeacher.from('documents').select('parts,title').eq('id', wk.slides_document_id).single()
        : { data: null };
      check('Week slides read back with pages', !!back && Array.isArray(back.parts) && back.parts.length === 1, back ? `pages=${back.parts?.length}` : 'not linked');
    }
  } else {
    skip('Course weeks & slides', tempCourseId ? 'no teacher session' : 'no temp course');
  }

  // ── 14. AI generation ──────────────────────────────────────────────────
  section('14. AI generation');
  if (!AI_KEY) {
    skip('AI generation (live)', 'set GEMINI_API_KEY or ANTHROPIC_API_KEY to enable');
  } else {
    try {
      const text = await aiSmokeTest(AI_KEY);
      check('AI provider returns a non-empty completion', !!text && text.trim().length > 0, text ? `“${text.trim().slice(0, 60)}…”` : 'empty response');
    } catch (e) {
      check('AI provider returns a non-empty completion', false, e.message);
    }
  }
}

/** Minimal live call mirroring gemini.ts generateText(), for a smoke test. */
async function aiSmokeTest(key) {
  const prompt = 'Reply with exactly the single word: OK';
  if (key.startsWith('sk-ant-')) {
    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: 'claude-haiku-4-5-20251001', max_tokens: 32, messages: [{ role: 'user', content: prompt }] })
    });
    if (!r.ok) throw new Error(`Anthropic HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
    const d = await r.json();
    return d.content?.[0]?.text ?? '';
  }
  // Gemini
  const r = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${key}`,
    { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }) }
  );
  if (!r.ok) throw new Error(`Gemini HTTP ${r.status}: ${(await r.text()).slice(0, 200)}`);
  const d = await r.json();
  return d.candidates?.[0]?.content?.parts?.[0]?.text ?? '';
}

// ── Run ─────────────────────────────────────────────────────────────────
(async () => {
  try {
    await main();
  } catch (e) {
    console.error(`\n${C.red}Suite crashed:${C.reset}`, e.message);
    results.fail++;
    results.failed.push('suite-crash: ' + e.message);
  } finally {
    // Best-effort cleanup (reverse order).
    for (const fn of cleanup.reverse()) {
      try { await fn(); } catch { /* ignore */ }
    }
  }

  const total = results.pass + results.fail + results.skip;
  console.log(`\n${C.bold}${'═'.repeat(56)}${C.reset}`);
  console.log(`${C.bold}Results:${C.reset} ${C.green}${results.pass} passed${C.reset}, ${results.fail ? C.red : C.dim}${results.fail} failed${C.reset}, ${C.yellow}${results.skip} skipped${C.reset} ${C.dim}(of ${total})${C.reset}`);
  if (results.failed.length) {
    console.log(`\n${C.red}Failing checks:${C.reset}`);
    for (const f of results.failed) console.log(`  ${C.red}✗${C.reset} ${f}`);
  } else {
    console.log(`\n${C.green}🎉 All backend checks passed.${C.reset}`);
  }
  process.exit(results.fail > 0 ? 1 : 0);
})();
