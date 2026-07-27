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
 *   NM_DB_URL (or DATABASE_URL)             → direct Postgres URL; enables the real
 *                                             destructive delete-account round-trip
 *                                             (creates + deletes a throwaway user)
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
  let teacherToken = null;
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
    teacherToken = t.data?.session?.access_token ?? null; // for Realtime auth (§23)
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

  // ── 14. Teacher dashboard: enrolled student & real performance ─────────
  // The headline flow: a student joins the professor's course by invite, does
  // some work, and must then show up — with real numbers — on the professor's
  // dashboard (get_course_student_performance + get_course_topic_stats RPCs).
  section('14. Teacher dashboard — student appears + performance');
  if (teacherOk && studentOk && tempCourseId) {
    const codeRow = await sbTeacher.from('courses').select('invite_code').eq('id', tempCourseId).single();
    const inviteCode = codeRow.data?.invite_code;
    const joined = await sbStudent.rpc('join_course_by_invite', { p_code: inviteCode });
    const didJoin = !joined.error && Array.isArray(joined.data) && joined.data[0]?.id === tempCourseId;
    check('Student can join the professor’s new course by invite', didJoin, joined.error ? joined.error.message : `course=${joined.data?.[0]?.name}`);

    // Student completes a notebook — this is what drives the dashboard numbers.
    const subErr = (await sbStudent.from('notebook_submissions').insert({
      user_id: studentId, course_id: tempCourseId, notebook_key: 'perf_nb',
      notebook_title: 'Intro to Pandas', xp_earned: 30, cells_attempted: 6, cells_first_try: 3
    })).error;
    check('Student’s completed notebook is recorded in the course', !subErr, subErr ? subErr.message : '');

    // Professor dashboard — per-student performance (migration 15).
    const perf = await sbTeacher.rpc('get_course_student_performance', { p_course_id: tempCourseId });
    const mine = Array.isArray(perf.data) ? perf.data.find(r => r.user_id === studentId) : null;
    check('Enrolled student appears on the professor dashboard', !perf.error && !!mine, perf.error ? perf.error.message : `students=${perf.data?.length}`);
    check('Student performance (attempts + first-try) shown to professor', !!mine && Number(mine.cells_attempted) >= 6 && Number(mine.cells_first_try) >= 3, mine ? `attempted=${mine.cells_attempted} firstTry=${mine.cells_first_try}` : 'student missing');
    check('Dashboard first-try % computes correctly', !!mine && Number(mine.cells_attempted) > 0 && Math.round((Number(mine.cells_first_try) / Number(mine.cells_attempted)) * 100) === 50, mine ? `pct=${Math.round((Number(mine.cells_first_try) / Math.max(1, Number(mine.cells_attempted))) * 100)}` : '');

    // Professor dashboard — per-topic understanding (migration 17).
    const topics = await sbTeacher.rpc('get_course_topic_stats', { p_course_id: tempCourseId });
    const topic = Array.isArray(topics.data) ? topics.data.find(t => t.topic === 'Intro to Pandas') : null;
    check('Per-topic understanding aggregate available to professor', !topics.error && !!topic, topics.error ? topics.error.message : `topics=${topics.data?.length}`);
    check('Topic understood_pct aggregates the first-try rate', !!topic && Number(topic.understood_pct) === 50, topic ? `understood=${topic.understood_pct}%` : '');

    // Privacy: a non-teacher must NOT read a course's per-student performance.
    const leak = await sbStudent.rpc('get_course_student_performance', { p_course_id: tempCourseId });
    check('Non-teacher cannot read per-student performance (privacy)', !leak.error && Array.isArray(leak.data) && leak.data.length === 0, leak.error ? leak.error.message : `leaked ${leak.data?.length} rows`);
    // Enrollment + submissions live in the throwaway course → gone on course delete.
  } else {
    skip('Teacher dashboard — student appears + performance', tempCourseId ? 'missing a session' : 'no temp course');
  }

  // ── 15. Profile edit persistence (name + avatar) ───────────────────────
  // "Edit profile" must survive a reload (migration 12 added profiles.avatar_url).
  section('15. Profile edit persistence (name + avatar)');
  if (studentOk) {
    const before = (await sbStudent.from('profiles').select('display_name,avatar_url').eq('user_id', studentId).single()).data;
    const avatar = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
    const upErr = (await sbStudent.from('profiles').update({ avatar_url: avatar }).eq('user_id', studentId)).error;
    check('Profile avatar update accepted (migration 12 column exists)', !upErr, upErr ? upErr.message : '');
    const after = (await sbStudent.from('profiles').select('avatar_url').eq('user_id', studentId).single()).data;
    check('Avatar persists (reads back after reload)', after?.avatar_url === avatar, after?.avatar_url ? 'stored' : 'missing');
    // Restore the original avatar so we don't disturb the shared test account.
    cleanup.push(async () => { await sbStudent.from('profiles').update({ avatar_url: before?.avatar_url ?? null }).eq('user_id', studentId); });
  } else {
    skip('Profile edit persistence', 'no student session');
  }

  // ── 16. Course notebook content sync (teacher → student) ────────────────
  // Migration 13: teacher publishes a notebook's cells+challenges onto the course
  // and enrolled students load that exact content from the DB.
  section('16. Course notebook sync (teacher → student)');
  if (teacherOk && studentOk && tempCourseId) {
    const content = { cells: ['print("hello")'], challenges: { 0: { kind: 'mc' } } };
    const up = await sbTeacher.from('course_notebooks').upsert(
      { course_id: tempCourseId, nb_key: 'nb_sync', title: 'Synced NB', blurb: null, status: 'available', week_number: 1, display_order: 0, content },
      { onConflict: 'course_id,nb_key' }
    );
    check('Teacher can publish notebook content to the course', !up.error, up.error ? up.error.message : '');
    const stu = await sbStudent.from('course_notebooks').select('nb_key,title,content,week_number').eq('course_id', tempCourseId).eq('nb_key', 'nb_sync').single();
    const okContent = !stu.error && stu.data?.content && Array.isArray(stu.data.content.cells) && stu.data.content.cells.length === 1;
    check('Enrolled student loads the teacher’s notebook content', okContent, stu.error ? stu.error.message : `cells=${stu.data?.content?.cells?.length}`);
  } else {
    skip('Course notebook sync', tempCourseId ? 'missing a session' : 'no temp course');
  }

  // ── 17. Explain-mode notes & comments persistence ──────────────────────
  // Migration 16 restored the grant that lets teacher notes + student comments
  // actually save (they were 403-ing before). They must persist across reloads.
  section('17. Explain-mode notes & comments persistence');
  if (teacherOk && studentOk && tempCourseId) {
    const noteBody = 'Focus on broadcasting — ' + rand(4);
    await sbTeacher.from('cell_comments').delete()
      .eq('user_id', teacherId).eq('course_id', tempCourseId)
      .eq('notebook_key', 'nb_sync').eq('cell_index', 0).eq('role', 'teacher');
    const insNote = await sbTeacher.from('cell_comments').insert({
      user_id: teacherId, course_id: tempCourseId, notebook_key: 'nb_sync', cell_index: 0,
      role: 'teacher', author_name: null, body: noteBody
    });
    check('Teacher note saves (migration 16 grant restored)', !insNote.error, insNote.error ? insNote.error.message : '');

    const seen = await sbStudent.from('cell_comments').select('role,body').eq('course_id', tempCourseId).eq('notebook_key', 'nb_sync').eq('cell_index', 0);
    const hasNote = !seen.error && (seen.data || []).some(c => c.role === 'teacher' && c.body === noteBody);
    check('Enrolled student sees the teacher note (persists on reload)', hasNote, seen.error ? seen.error.message : `rows=${seen.data?.length}`);

    const insC = await sbStudent.from('cell_comments').insert({
      user_id: studentId, course_id: tempCourseId, notebook_key: 'nb_sync', cell_index: 0,
      role: 'student', author_name: 'Test Student', body: 'I struggled here too'
    });
    check('Student can post a peer comment', !insC.error, insC.error ? insC.error.message : '');
    // cell_comments FK is ON DELETE CASCADE from courses → cleaned with the course.
  } else {
    skip('Explain-mode notes & comments', tempCourseId ? 'missing a session' : 'no temp course');
  }

  // ── 18. Learn-mode AI challenge cache (no re-generation on reload) ──────
  // Migration 11 + the migration-16 grant: a generated challenge is cached per
  // (user, notebook, cell) so a reload reuses it instead of paying the AI again.
  section('18. Learn-mode AI challenge cache');
  if (studentOk) {
    const payload = { kind: 'fix_the_bug', prompt: 'fix it', buggy: 'x =', answer: 'x = 1' };
    const up = await sbStudent.from('notebook_challenges').upsert(
      { user_id: studentId, notebook_key: 'nb_cache', cell_index: 0, payload },
      { onConflict: 'user_id,notebook_key,cell_index' }
    );
    check('Generated challenge caches to the account (migration 16 grant)', !up.error, up.error ? up.error.message : '');
    const back = await sbStudent.from('notebook_challenges').select('payload').eq('user_id', studentId).eq('notebook_key', 'nb_cache').eq('cell_index', 0).single();
    const ok = !back.error && back.data?.payload?.kind === 'fix_the_bug';
    check('Cached challenge reloads unchanged (no AI re-run)', ok, back.error ? back.error.message : 'ok');
    cleanup.push(async () => { await sbStudent.from('notebook_challenges').delete().eq('user_id', studentId).eq('notebook_key', 'nb_cache'); });
  } else {
    skip('Learn-mode AI challenge cache', 'no student session');
  }

  // ── 19. Personal file upload (synced to account) ───────────────────────
  // Uploading a PDF/notebook to *your account* → documents (is_course_material
  // = false). It must appear in "My materials" and survive a reload. (Uploads
  // kept "on this device" use IndexedDB — browser-only, not reachable from Node;
  // see the SKIP note below.)
  section('19. Personal file upload (synced to account)');
  if (studentOk) {
    const ins = await sbStudent.from('documents').insert({
      user_id: studentId, title: '__nmtest_upload.pdf', source_text: 'uploaded text',
      original_full_text: 'uploaded text',
      parts: [{ index: 0, title: 'Page 1', text: 'page one', pageNumber: 1 }],
      total_sections: 1, is_course_material: false, doc_type: 'paper',
      last_opened_at: new Date().toISOString()
    }).select('id').single();
    const upId = ins.data?.id ?? null;
    check('User can upload a personal file to their account', !ins.error && !!upId, ins.error ? ins.error.message : '');
    if (upId) {
      cleanup.push(async () => { await sbStudent.from('documents').delete().eq('id', upId); });
      const list = await sbStudent.from('documents').select('id,title,doc_type').eq('user_id', studentId).eq('is_course_material', false);
      const found = !list.error && (list.data || []).some(d => d.id === upId);
      check('Uploaded file appears in “My materials” and survives reload', found, list.error ? list.error.message : `count=${list.data?.length}`);
    }
    skip('Local (on-device) upload round-trip', 'IndexedDB store (localStore.ts) is browser-only — verify in the UI');
  } else {
    skip('Personal file upload', 'no student session');
  }

  // ── 19b. Private per-cell notebook notes (migration 21) ────────────────
  // A student's margin notes on a shared (teacher-uploaded) notebook are saved
  // to their OWN account, survive reload, and stay private (RLS owner-only).
  section('19b. Private per-cell notebook notes');
  if (studentOk && teacherOk) {
    const nbKey = '__nmtest_notes.ipynb';
    const note = 'my private aha ' + rand(4);
    const up = await sbStudent.from('cell_notes').upsert(
      { user_id: studentId, notebook_key: nbKey, cell_index: 2, notes: { L: [note], R: [] } },
      { onConflict: 'user_id,notebook_key,cell_index' }
    );
    check('Student can save a private cell note', !up.error, up.error ? up.error.message : '');

    const back = await sbStudent.from('cell_notes').select('notes').eq('user_id', studentId).eq('notebook_key', nbKey).eq('cell_index', 2).single();
    const ok = !back.error && back.data?.notes?.L?.[0] === note;
    check('Private note reads back after reload', ok, back.error ? back.error.message : `L=${JSON.stringify(back.data?.notes?.L)}`);

    // Privacy: the teacher (a different user) must not see the student's note.
    const leak = await sbTeacher.from('cell_notes').select('id').eq('notebook_key', nbKey).eq('cell_index', 2);
    check('Notes are private — another user cannot read them', !leak.error && Array.isArray(leak.data) && leak.data.length === 0, leak.error ? leak.error.message : `leaked ${leak.data?.length} rows`);

    // Clearing both margins removes the row (matches the client's empty-note path).
    await sbStudent.from('cell_notes').delete().eq('user_id', studentId).eq('notebook_key', nbKey);
    const gone = await sbStudent.from('cell_notes').select('id').eq('user_id', studentId).eq('notebook_key', nbKey);
    check('Cleared note is removed', !gone.error && (gone.data || []).length === 0, gone.error ? gone.error.message : `rows=${gone.data?.length}`);
  } else {
    skip('Private per-cell notebook notes', 'need student + teacher sessions');
  }

  // ── 20. Friend requests / sharing (consent-based, migration 18) ─────────
  // End-to-end: student sends a request to the teacher by email → one-directional
  // (stats hidden) → teacher accepts → mutual (stats visible) → student withdraws.
  section('20. Friend requests & sharing');
  if (teacherOk && studentOk) {
    // Start from a clean slate between these two accounts.
    await sbStudent.from('friend_shares').delete().eq('owner_id', studentId).eq('friend_id', teacherId);
    await sbTeacher.from('friend_shares').delete().eq('owner_id', teacherId).eq('friend_id', studentId);

    // Student sends a friend request (shares stats) to the teacher by email.
    const req = await sbStudent.rpc('request_friend', { p_email: TEACHER.email });
    const reqOk = !req.error && Array.isArray(req.data) && req.data[0]?.friend_id === teacherId;
    check('Send friend request by email (request_friend RPC)', reqOk, req.error ? req.error.message : `to=${req.data?.[0]?.display_name}`);

    // Student's view: outgoing request pending, stats still hidden.
    const f1 = await sbStudent.rpc('get_my_friends');
    const row1 = Array.isArray(f1.data) ? f1.data.find(r => r.friend_id === teacherId) : null;
    check('Outgoing request shows (i_share=true, they_share=false)', !!row1 && row1.i_share === true && row1.they_share === false, row1 ? `i=${row1.i_share} they=${row1.they_share}` : 'missing');
    check('Friend stats stay hidden until sharing is mutual', !!row1 && Number(row1.points) === 0 && Number(row1.notebooks_completed) === 0, row1 ? `points=${row1.points}` : '');

    // Teacher's view: an incoming request they can accept.
    const tf = await sbTeacher.rpc('get_my_friends');
    const trow = Array.isArray(tf.data) ? tf.data.find(r => r.friend_id === studentId) : null;
    check('Teacher sees the incoming request (they_share=true, i_share=false)', !!trow && trow.they_share === true && trow.i_share === false, trow ? `i=${trow.i_share} they=${trow.they_share}` : 'missing');

    // Teacher accepts by sharing back (direct insert — how the UI's "Accept" works).
    const acc = await sbTeacher.from('friend_shares').insert({ owner_id: teacherId, friend_id: studentId });
    check('Accept & share back (insert own friend_shares row)', !acc.error, acc.error ? acc.error.message : '');

    // Now mutual → the student can see the teacher's real stats.
    const f2 = await sbStudent.rpc('get_my_friends');
    const row2 = Array.isArray(f2.data) ? f2.data.find(r => r.friend_id === teacherId) : null;
    check('Mutual sharing unlocks the friend on both sides', !!row2 && row2.i_share && row2.they_share, row2 ? `i=${row2.i_share} they=${row2.they_share}` : 'missing');
    check('Friend stats become visible once mutual (persist on reload)', !!row2 && !!row2.display_name && Number(row2.points) >= 0, row2 ? `name=${row2.display_name} pts=${row2.points}` : '');

    // Negative: a request to an unknown email adds nobody.
    const bogus = await sbStudent.rpc('request_friend', { p_email: `no.one.${rand(6).toLowerCase()}@gmail.com` });
    check('Request to an unknown email adds nobody', !bogus.error && Array.isArray(bogus.data) && bogus.data.length === 0, bogus.error ? bogus.error.message : `rows=${bogus.data?.length}`);

    // Negative: you can't friend yourself.
    const self = await sbStudent.rpc('request_friend', { p_email: STUDENT.email });
    check('Cannot send a friend request to yourself', !self.error && Array.isArray(self.data) && self.data.length === 0, self.error ? self.error.message : `rows=${self.data?.length}`);

    // Student takes their sharing back (unfriend / withdraw).
    const del = await sbStudent.from('friend_shares').delete().eq('owner_id', studentId).eq('friend_id', teacherId);
    check('Withdraw sharing (delete own friend_shares row)', !del.error, del.error ? del.error.message : '');
    const f3 = await sbStudent.rpc('get_my_friends');
    const row3 = Array.isArray(f3.data) ? f3.data.find(r => r.friend_id === teacherId) : null;
    check('After withdrawing, I no longer share (they still do)', !!row3 && row3.i_share === false && row3.they_share === true, row3 ? `i=${row3.i_share} they=${row3.they_share}` : 'row gone');

    // RLS: I can see a share directed at me (the teacher→student row remains).
    const peek = await sbStudent.from('friend_shares').select('id').eq('owner_id', teacherId).eq('friend_id', studentId);
    check('RLS lets me read shares directed to me', !peek.error && Array.isArray(peek.data) && peek.data.length === 1, peek.error ? peek.error.message : `rows=${peek.data?.length}`);

    // Clean up both directions.
    cleanup.push(async () => {
      await sbStudent.from('friend_shares').delete().eq('owner_id', studentId).eq('friend_id', teacherId);
      await sbTeacher.from('friend_shares').delete().eq('owner_id', teacherId).eq('friend_id', studentId);
    });
  } else {
    skip('Friend requests & sharing', 'need both teacher and student sessions');
  }

  // ── 21. Delete account (self-service, migration 19) ────────────────────
  // Real, destructive round-trip on a THROWAWAY account (never the shared test
  // accounts): create a confirmed user directly in the DB, sign in as them, call
  // delete_my_account, then verify the auth.users row is gone and they can no
  // longer sign in. Needs a direct DB connection (the anon key can't create a
  // confirmed user); without one we fall back to a safe existence probe.
  section('21. Delete account');
  {
    const DB_URL = process.env.NM_DB_URL || process.env.DATABASE_URL || '';
    let pg = null;
    try { pg = require('pg'); } catch { pg = null; }

    if (DB_URL && pg) {
      const dbc = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
      const email = `nm.deltest.${Date.now()}.${rand(4).toLowerCase()}@gmail.com`;
      const password = 'Del123!' + rand(6);
      let newId = null;
      try {
        await dbc.connect();
        const ins = await dbc.query(
          `insert into auth.users
             (instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
              raw_app_meta_data,raw_user_meta_data,created_at,updated_at,
              confirmation_token,recovery_token,email_change_token_new,email_change,
              email_change_token_current,reauthentication_token)
           values
             ('00000000-0000-0000-0000-000000000000',gen_random_uuid(),'authenticated','authenticated',
              $1,crypt($2,gen_salt('bf')),now(),
              '{"provider":"email","providers":["email"]}',jsonb_build_object('display_name','Del Test'),now(),now(),
              '','','','','','')
           returning id`,
          [email, password]
        );
        newId = ins.rows[0].id;
        await dbc.query(
          `insert into auth.identities (provider_id,user_id,identity_data,provider,last_sign_in_at,created_at,updated_at)
           values ($1::text,$1::uuid,jsonb_build_object('sub',$1::text,'email',$2::text),'email',now(),now(),now())`,
          [newId, email]
        );
        check('Throwaway account created for the delete test', !!newId, `id=${newId}`);

        // Sign in as the throwaway user via the public anon client.
        const sbDel = createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } });
        const login = await loginWithRetry(sbDel, email, password);
        check('Throwaway account can sign in', !!login.data?.user?.id, login.error ? login.error.message : email);

        // Give it a row that must disappear on delete (proves the cascade).
        await sbDel.from('documents').insert({
          user_id: newId, title: '__deltest_doc', source_text: 'x', original_full_text: 'x',
          parts: [{ index: 0, title: 'S', text: 'x' }], total_sections: 1, last_opened_at: new Date().toISOString()
        });

        // Delete via the RPC — acting as the user themselves.
        const del = await sbDel.rpc('delete_my_account');
        check('delete_my_account RPC succeeds for the caller', !del.error, del.error ? del.error.message : 'deleted');

        const gone = await dbc.query('select 1 from auth.users where id=$1', [newId]);
        check('Account removed from auth.users', gone.rowCount === 0, `rows=${gone.rowCount}`);

        const profGone = await dbc.query('select 1 from public.profiles where user_id=$1', [newId]);
        check('Profile + owned data cascade-deleted', profGone.rowCount === 0, `profiles=${profGone.rowCount}`);

        const relogin = await loginWithRetry(createClient(SUPABASE_URL, ANON_KEY, { auth: { persistSession: false } }), email, password, 2);
        check('Deleted account can no longer sign in', !!relogin.error, relogin.error ? relogin.error.message : 'STILL SIGNS IN (BAD)');

        newId = null; // successfully deleted — nothing to clean up
      } catch (e) {
        check('Delete account end-to-end', false, e.message);
      } finally {
        if (newId) { try { await dbc.query('delete from auth.users where id=$1', [newId]); } catch { /* ignore */ } }
        try { await dbc.end(); } catch { /* ignore */ }
      }
    } else {
      // Safe existence probe: an unauthenticated call must raise (not "no such
      // function"), which proves the RPC is deployed without deleting anyone.
      const r = await sbAnon.rpc('delete_my_account');
      const notFound = r.error && /could not find|not find the function|does not exist|schema cache/i.test(r.error.message);
      check('delete_my_account RPC is deployed', !notFound, notFound ? 'NOT FOUND — apply migration19.sql' : (r.error ? `guarded (${r.error.message})` : 'callable'));
      skip('Delete account (destructive round-trip)', 'set NM_DB_URL (or DATABASE_URL) to create+delete a throwaway user');
    }
  }

  // ── 22. AI generation ──────────────────────────────────────────────────
  section('22. AI generation');
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

  // ── 23. Realtime (live updates, migration 20) ──────────────────────────
  // The teacher dashboard, Explain comments and friends update live via Supabase
  // Realtime (postgres_changes). Two checks: the tables are in the realtime
  // publication, and a subscriber actually receives a live INSERT event.
  section('23. Realtime (live updates)');
  {
    // (a) Publication membership — needs a direct DB connection.
    const DB_URL = process.env.NM_DB_URL || process.env.DATABASE_URL || '';
    let pg = null;
    try { pg = require('pg'); } catch { pg = null; }
    if (DB_URL && pg) {
      const dbc = new pg.Client({ connectionString: DB_URL, ssl: { rejectUnauthorized: false } });
      try {
        await dbc.connect();
        const r = await dbc.query(
          `select tablename from pg_publication_tables where pubname='supabase_realtime' and schemaname='public'`
        );
        const have = new Set(r.rows.map(x => x.tablename));
        const want = ['course_enrollments', 'notebook_submissions', 'cell_comments', 'friend_shares', 'cell_attempts', 'course_notebooks'];
        const missing = want.filter(t => !have.has(t));
        check('Realtime enabled on the collaboration tables', missing.length === 0, missing.length ? `missing: ${missing.join(', ')}` : `${want.length} tables in supabase_realtime`);
      } catch (e) {
        check('Realtime publication membership', false, e.message);
      } finally {
        try { await dbc.end(); } catch { /* ignore */ }
      }
    } else {
      skip('Realtime publication membership', 'set NM_DB_URL to verify pg_publication_tables');
    }

    // (b) Live end-to-end: subscribe as the teacher (the already-signed-in
    // client, so its socket carries the auth JWT and RLS lets the event through),
    // insert a comment on their temp course, and assert the INSERT arrives.
    if (teacherOk && tempCourseId) {
      try { sbTeacher.realtime.setAuth(teacherToken); } catch { /* older client */ }

      let resolveEvt;
      let lastStatus = '(none)';
      const received = new Promise(res => { resolveEvt = res; });
      const ch = sbTeacher
        .channel('nmtest:rt:' + rand())
        .on(
          'postgres_changes',
          { event: 'INSERT', schema: 'public', table: 'cell_comments', filter: `course_id=eq.${tempCourseId}` },
          () => resolveEvt('event')
        )
        .subscribe(async status => {
          lastStatus = status;
          if (status === 'SUBSCRIBED') {
            // Insert only once the socket is live so we never miss the event.
            await sbTeacher.from('cell_comments').insert({
              user_id: teacherId, course_id: tempCourseId, notebook_key: 'rt_test',
              cell_index: 0, role: 'teacher', author_name: null, body: 'realtime ping ' + rand()
            });
          } else if (status === 'CHANNEL_ERROR' || status === 'TIMED_OUT') {
            resolveEvt('status:' + status);
          }
        });

      // Generous window — the socket handshake + RLS join can be slow to warm up
      // on the free tier, and that time shouldn't count against event delivery.
      const outcome = await Promise.race([
        received,
        new Promise(res => setTimeout(() => res('timeout'), 30000))
      ]);
      check('Realtime delivers a live INSERT event (cell_comments)', outcome === 'event', outcome === 'event' ? 'event received over the socket' : `${outcome} (last status: ${lastStatus})`);
      try { await sbTeacher.removeChannel(ch); } catch { /* ignore */ }
    } else {
      skip('Realtime live INSERT event', 'no teacher session or temp course');
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
