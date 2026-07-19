import { getClient, getCurrentUser } from './supabase';

// ── Profiles ─────────────────────────────────────────────────

export interface IProfile {
  id: string;
  user_id: string;
  display_name: string | null;
  role: string;
  points: number;
  weekly_points: number;
  username: string | null;
  leaderboard_opt_in: boolean;
}

export async function getMyProfile(): Promise<IProfile | null> {
  const client = getClient();
  const user = getCurrentUser();
  if (!client || !user) {
    return null;
  }
  const { data } = await client
    .from('profiles')
    .select('id,user_id,display_name,role,points,weekly_points,username,leaderboard_opt_in')
    .eq('user_id', user.id)
    .single();
  return data as IProfile | null;
}

export async function updateProfile(
  fields: Partial<Pick<IProfile, 'display_name' | 'username' | 'leaderboard_opt_in'>>
): Promise<void> {
  const client = getClient();
  const user = getCurrentUser();
  if (!client || !user) {
    return;
  }
  await client.from('profiles').update(fields).eq('user_id', user.id);
}

export async function setLeaderboardOptIn(optIn: boolean): Promise<void> {
  await updateProfile({ leaderboard_opt_in: optIn });
}

// ── XP / Points ──────────────────────────────────────────────

export async function addPoints(
  points: number,
  reason: string,
  docTitle?: string,
  courseId?: string
): Promise<void> {
  const client = getClient();
  const user = getCurrentUser();
  if (!client || !user || points <= 0) {
    return;
  }
  await Promise.all([
    // course_id scopes this event to the course it was earned in, so the
    // course leaderboard can rank by per-course XP (null = personal work).
    client.from('point_events').insert({
      user_id: user.id,
      points,
      reason,
      document_title: docTitle ?? null,
      course_id: courseId ?? null
    }),
    // Still bump the global personal total (home / profile "Total XP").
    client.rpc('increment_points', { p_user_id: user.id, p_points: points })
  ]);
}

// ── Leaderboard ──────────────────────────────────────────────

export interface ILeaderEntry {
  rank: number;
  display_name: string;
  username: string | null;
  points: number;
  weekly_points: number;
}

export async function getLeaderboard(courseId?: string): Promise<ILeaderEntry[]> {
  const client = getClient();
  if (!client) {
    return [];
  }

  // Course-scoped: use the SECURITY DEFINER RPC so an enrolled student
  // can see classmates' ranks (course_enrollments RLS blocks a direct join).
  if (courseId) {
    const { data, error } = await client.rpc('get_course_leaderboard', {
      p_course_id: courseId
    });
    if (error || !data) {
      return [];
    }
    return (data as any[]).map((row: any) => ({
      rank: Number(row.rank),
      display_name: row.display_name ?? 'Anonymous',
      username: row.username,
      points: row.points ?? 0,
      weekly_points: row.weekly_points ?? 0
    }));
  }

  // Global fallback: opted-in profiles only (leaderboards are opt-in).
  const { data } = await client
    .from('profiles')
    .select('display_name,username,points,weekly_points')
    .eq('leaderboard_opt_in', true)
    .order('points', { ascending: false })
    .limit(50);

  if (!data) {
    return [];
  }
  return data.map((row: any, i: number) => ({
    rank: i + 1,
    display_name: row.display_name ?? 'Anonymous',
    username: row.username,
    points: row.points ?? 0,
    weekly_points: row.weekly_points ?? 0
  }));
}

// ── Notebook Submissions ─────────────────────────────────────

export async function saveNotebookSubmission(opts: {
  notebookKey: string;
  notebookTitle: string;
  xpEarned: number;
  cellsAttempted: number;
  cellsFirstTry: number;
  courseId?: string;
}): Promise<void> {
  const client = getClient();
  const user = getCurrentUser();
  if (!client || !user) {
    return;
  }
  await client.from('notebook_submissions').insert({
    user_id: user.id,
    course_id: opts.courseId ?? null,
    notebook_key: opts.notebookKey,
    notebook_title: opts.notebookTitle,
    xp_earned: opts.xpEarned,
    cells_attempted: opts.cellsAttempted,
    cells_first_try: opts.cellsFirstTry
  });
}

export interface IMyLearningStats {
  cellsAttempted: number;
  cellsFirstTry: number;
  notebooksCompleted: number;
}

/**
 * The signed-in user's own learning totals, summed from their notebook
 * submissions. Used to make the home "Solved" / "First try" tiles persist
 * across reloads instead of resetting to the session counters.
 */
export async function getMyLearningStats(): Promise<IMyLearningStats> {
  const empty: IMyLearningStats = {
    cellsAttempted: 0,
    cellsFirstTry: 0,
    notebooksCompleted: 0
  };
  const client = getClient();
  const user = getCurrentUser();
  if (!client || !user) {
    return empty;
  }
  const { data } = await client
    .from('notebook_submissions')
    .select('cells_attempted,cells_first_try')
    .eq('user_id', user.id);
  if (!data) {
    return empty;
  }
  let cellsAttempted = 0;
  let cellsFirstTry = 0;
  for (const row of data as any[]) {
    cellsAttempted += row.cells_attempted ?? 0;
    cellsFirstTry += row.cells_first_try ?? 0;
  }
  return { cellsAttempted, cellsFirstTry, notebooksCompleted: data.length };
}

/** The distinct notebook keys the signed-in user has completed (any course). */
export async function listMyCompletedNotebookKeys(): Promise<string[]> {
  const client = getClient();
  const user = getCurrentUser();
  if (!client || !user) {
    return [];
  }
  const { data } = await client
    .from('notebook_submissions')
    .select('notebook_key')
    .eq('user_id', user.id);
  if (!data) {
    return [];
  }
  return Array.from(
    new Set((data as any[]).map(r => r.notebook_key).filter(Boolean))
  );
}

// ── Cell Attempts (anonymous) ─────────────────────────────────

export async function recordCellAttempt(
  notebookKey: string,
  cellIndex: number,
  succeeded: boolean,
  attemptNumber: number,
  courseId?: string
): Promise<void> {
  const client = getClient();
  if (!client) {
    return;
  }
  await client.from('cell_attempts').insert({
    notebook_key: notebookKey,
    cell_index: cellIndex,
    course_id: courseId ?? null,
    succeeded,
    attempt_number: attemptNumber
  });
}

// ── Courses: create / join / list (DB-backed course loop) ────

export interface IDbCourse {
  id: string;
  name: string;
  code: string;
  invite_code: string;
  isOwn: boolean;
}

export interface IDbWeek {
  week_number: number;
  theme: string;
  topics: string[];
  hasSlides: boolean;
}

/** Create a course in the DB; the caller becomes its teacher. */
export async function createCourseDB(name: string): Promise<IDbCourse | null> {
  const client = getClient();
  const user = getCurrentUser();
  if (!client || !user) {
    return null;
  }
  const code = Array.from({ length: 6 }, () =>
    'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'.charAt(Math.floor(Math.random() * 32))
  ).join('');
  const { data, error } = await client
    .from('courses')
    .insert({ name, code, invite_code: code, teacher_id: user.id, is_active: true })
    .select('id,name,code,invite_code')
    .single();
  if (error || !data) {
    return null;
  }
  return { id: data.id, name: data.name, code: data.code, invite_code: data.invite_code, isOwn: true };
}

/** Delete a course you own (RLS: teacher only). Cascades weeks/enrollments. */
export async function deleteCourseDB(courseId: string): Promise<void> {
  const client = getClient();
  if (!client) {
    return;
  }
  await client.from('courses').delete().eq('id', courseId);
}

/** Leave a course you joined (removes your own enrollment). */
export async function leaveCourseDB(courseId: string): Promise<void> {
  const client = getClient();
  const user = getCurrentUser();
  if (!client || !user) {
    return;
  }
  await client.from('course_enrollments').delete().eq('course_id', courseId).eq('user_id', user.id);
}

/** Enroll the signed-in user via invite code (SECURITY DEFINER RPC). */
export async function joinCourseByInvite(code: string): Promise<IDbCourse | null> {
  const client = getClient();
  const user = getCurrentUser();
  if (!client || !user) {
    return null;
  }
  const { data, error } = await client.rpc('join_course_by_invite', { p_code: code });
  if (error || !data || !data.length) {
    return null;
  }
  const r = data[0] as any;
  return { id: r.id, name: r.name, code: r.code, invite_code: r.invite_code, isOwn: false };
}

/** Courses the signed-in user teaches or is enrolled in. */
export async function listMyCourses(): Promise<IDbCourse[]> {
  const client = getClient();
  const user = getCurrentUser();
  if (!client || !user) {
    return [];
  }
  const byId = new Map<string, IDbCourse>();
  // Courses I teach.
  const own = await client
    .from('courses')
    .select('id,name,code,invite_code')
    .eq('teacher_id', user.id);
  for (const c of (own.data as any[]) ?? []) {
    byId.set(c.id, { id: c.id, name: c.name, code: c.code, invite_code: c.invite_code, isOwn: true });
  }
  // Courses I'm enrolled in.
  const enr = await client
    .from('course_enrollments')
    .select('courses(id,name,code,invite_code)')
    .eq('user_id', user.id);
  for (const row of (enr.data as any[]) ?? []) {
    const c = row.courses;
    if (c && !byId.has(c.id)) {
      byId.set(c.id, { id: c.id, name: c.name, code: c.code, invite_code: c.invite_code, isOwn: false });
    }
  }
  return Array.from(byId.values());
}

/** The published weeks of a course (for showing materials to enrolled students). */
export async function getCourseWeeks(courseId: string): Promise<IDbWeek[]> {
  const client = getClient();
  if (!client) {
    return [];
  }
  const { data } = await client
    .from('course_weeks')
    .select('week_number,theme,topics,slides_document_id')
    .eq('course_id', courseId)
    .order('week_number');
  return ((data as any[]) ?? []).map(w => ({
    week_number: w.week_number,
    theme: w.theme ?? `Week ${w.week_number}`,
    topics: Array.isArray(w.topics) ? w.topics : [],
    hasSlides: !!w.slides_document_id
  }));
}

// ── Teacher: course activity aggregate (from submissions) ────

export interface ICourseActivity {
  submissionCount: number;
  activeStudents: number;
  avgFirstTryPct: number;
  totalXp: number;
  recent: Array<{
    notebook_title: string;
    xp_earned: number;
    first_try_pct: number;
    cells_attempted: number;
    completed_at: string;
  }>;
}

/**
 * Anonymous, aggregate class activity for the teacher dashboard, derived from
 * real notebook_submissions. No per-student identities are exposed.
 */
export async function getCourseActivity(courseId: string): Promise<ICourseActivity> {
  const empty: ICourseActivity = {
    submissionCount: 0,
    activeStudents: 0,
    avgFirstTryPct: 0,
    totalXp: 0,
    recent: []
  };
  const client = getClient();
  if (!client) {
    return empty;
  }
  const { data } = await client
    .from('notebook_submissions')
    .select('user_id,notebook_title,xp_earned,cells_attempted,cells_first_try,completed_at')
    .eq('course_id', courseId)
    .order('completed_at', { ascending: false });
  if (!data || data.length === 0) {
    return empty;
  }

  const students = new Set<string>();
  let firstTrySum = 0;
  let attemptedSum = 0;
  let totalXp = 0;
  for (const row of data as any[]) {
    if (row.user_id) {
      students.add(row.user_id);
    }
    firstTrySum += row.cells_first_try ?? 0;
    attemptedSum += row.cells_attempted ?? 0;
    totalXp += row.xp_earned ?? 0;
  }

  return {
    submissionCount: data.length,
    activeStudents: students.size,
    avgFirstTryPct: attemptedSum > 0 ? Math.round((firstTrySum / attemptedSum) * 100) : 0,
    totalXp,
    recent: (data as any[]).slice(0, 6).map(r => ({
      notebook_title: r.notebook_title ?? 'Notebook',
      xp_earned: r.xp_earned ?? 0,
      first_try_pct:
        r.cells_attempted > 0
          ? Math.round(((r.cells_first_try ?? 0) / r.cells_attempted) * 100)
          : 0,
      cells_attempted: r.cells_attempted ?? 0,
      completed_at: r.completed_at
    }))
  };
}

// ── Teacher: anonymous aggregate cell failure stats ──────────

export interface ICellFailStat {
  notebook_key: string;
  cell_index: number;
  total_attempts: number;
  success_rate: number;
}

export async function getCellFailStats(courseId?: string): Promise<ICellFailStat[]> {
  const client = getClient();
  if (!client) {
    return [];
  }
  let query = client
    .from('cell_attempts')
    .select('notebook_key,cell_index,succeeded');
  if (courseId) {
    query = query.eq('course_id', courseId);
  }
  const { data } = await query;
  if (!data) {
    return [];
  }

  // Group client-side
  const map = new Map<string, { total: number; succeeded: number }>();
  for (const row of data as any[]) {
    const key = `${row.notebook_key}::${row.cell_index}`;
    const cur = map.get(key) ?? { total: 0, succeeded: 0 };
    cur.total++;
    if (row.succeeded) {
      cur.succeeded++;
    }
    map.set(key, cur);
  }

  return Array.from(map.entries())
    .map(([k, v]) => {
      const [nb, ci] = k.split('::');
      return {
        notebook_key: nb,
        cell_index: parseInt(ci, 10),
        total_attempts: v.total,
        success_rate: v.total > 0 ? v.succeeded / v.total : 0
      };
    })
    .sort((a, b) => a.success_rate - b.success_rate);
}

// ── Documents (papers / slides) ──────────────────────────────

export interface IDocument {
  id: string;
  title: string;
  source_text: string | null;
  parts: any[];
  total_sections: number;
  total_xp_earned: number;
  last_opened_at: string;
  created_at: string;
}

export async function listDocuments(): Promise<IDocument[]> {
  const client = getClient();
  const user = getCurrentUser();
  if (!client || !user) {
    return [];
  }
  const { data } = await client
    .from('documents')
    .select('id,title,source_text,parts,total_sections,total_xp_earned,last_opened_at,created_at')
    .eq('user_id', user.id)
    .order('last_opened_at', { ascending: false });
  return (data as IDocument[]) ?? [];
}

export async function upsertDocument(opts: {
  id?: string;
  title: string;
  sourceText: string;
  parts: any[];
  totalSections: number;
}): Promise<string | null> {
  const client = getClient();
  const user = getCurrentUser();
  if (!client || !user) {
    return null;
  }
  const payload: any = {
    user_id: user.id,
    title: opts.title,
    source_text: opts.sourceText,
    original_full_text: opts.sourceText,
    parts: opts.parts,
    total_sections: opts.totalSections,
    last_opened_at: new Date().toISOString()
  };
  if (opts.id) {
    payload.id = opts.id;
  }
  const { data } = await client
    .from('documents')
    .upsert(payload, { onConflict: 'id' })
    .select('id')
    .single();
  return data?.id ?? null;
}

// ── Generated content persistence (quizzes + Learn challenges) ───

export interface ISavedQuiz {
  questions: any[];
  answers: any[];
  done: boolean;
}

/** The saved quiz for a document section, if one was generated before. */
export async function getSavedQuiz(
  documentId: string,
  sectionIndex: number
): Promise<ISavedQuiz | null> {
  const client = getClient();
  const user = getCurrentUser();
  if (!client || !user) {
    return null;
  }
  const { data } = await client
    .from('quiz_sessions')
    .select('questions,answers')
    .eq('user_id', user.id)
    .eq('document_id', documentId)
    .eq('section_index', sectionIndex)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data || !Array.isArray(data.questions) || data.questions.length === 0) {
    return null;
  }
  const questions = data.questions as any[];
  const answers = Array.isArray(data.answers) ? (data.answers as any[]) : [];
  return { questions, answers, done: answers.length >= questions.length };
}

/** Save a freshly generated quiz so it's reused instead of regenerated. */
export async function saveQuiz(
  documentId: string,
  sectionIndex: number,
  questions: any[]
): Promise<void> {
  const client = getClient();
  const user = getCurrentUser();
  if (!client || !user) {
    return;
  }
  // One saved quiz per (user, document, section) — replace any prior one.
  await client
    .from('quiz_sessions')
    .delete()
    .eq('user_id', user.id)
    .eq('document_id', documentId)
    .eq('section_index', sectionIndex);
  await client.from('quiz_sessions').insert({
    user_id: user.id,
    document_id: documentId,
    section_index: sectionIndex,
    mode: 'section',
    questions,
    answers: [],
    total: questions.length
  });
}

/** Persist quiz progress (answers so far + score) so the user can resume. */
export async function updateQuizProgress(
  documentId: string,
  sectionIndex: number,
  answers: any[],
  score: number
): Promise<void> {
  const client = getClient();
  const user = getCurrentUser();
  if (!client || !user) {
    return;
  }
  await client
    .from('quiz_sessions')
    .update({ answers, score })
    .eq('user_id', user.id)
    .eq('document_id', documentId)
    .eq('section_index', sectionIndex);
}

/** All saved Learn-mode challenges for a notebook, keyed by cell index. */
export async function getNotebookChallenges(
  notebookKey: string
): Promise<Record<number, any>> {
  const client = getClient();
  const user = getCurrentUser();
  if (!client || !user) {
    return {};
  }
  const { data } = await client
    .from('notebook_challenges')
    .select('cell_index,payload')
    .eq('user_id', user.id)
    .eq('notebook_key', notebookKey);
  const out: Record<number, any> = {};
  for (const row of (data as any[]) ?? []) {
    out[row.cell_index] = row.payload;
  }
  return out;
}

/** Cache a generated challenge so the AI doesn't rebuild it next time. */
export async function saveNotebookChallenge(
  notebookKey: string,
  cellIndex: number,
  payload: any
): Promise<void> {
  const client = getClient();
  const user = getCurrentUser();
  if (!client || !user) {
    return;
  }
  await client.from('notebook_challenges').upsert(
    {
      user_id: user.id,
      notebook_key: notebookKey,
      cell_index: cellIndex,
      payload,
      updated_at: new Date().toISOString()
    },
    { onConflict: 'user_id,notebook_key,cell_index' }
  );
}

// ── Explain-mode cell comments (teacher notes + student comments) ─

export interface ICellComment {
  id: string;
  role: string; // 'teacher' | 'student'
  author_name: string | null;
  body: string;
  created_at: string;
}

/** Comments on one notebook cell, shared across the course. */
export async function getCellComments(
  courseId: string | undefined,
  notebookKey: string,
  cellIndex: number
): Promise<ICellComment[]> {
  const client = getClient();
  if (!client) {
    return [];
  }
  let q = client
    .from('cell_comments')
    .select('id,role,author_name,body,created_at')
    .eq('notebook_key', notebookKey)
    .eq('cell_index', cellIndex)
    .order('created_at', { ascending: true });
  q = courseId ? q.eq('course_id', courseId) : q.is('course_id', null);
  const { data } = await q;
  return (data as ICellComment[]) ?? [];
}

/** Post a comment (teacher note or student comment) on a cell. */
export async function addCellComment(opts: {
  courseId?: string;
  notebookKey: string;
  cellIndex: number;
  role: string;
  authorName: string;
  body: string;
}): Promise<ICellComment | null> {
  const client = getClient();
  const user = getCurrentUser();
  if (!client || !user) {
    return null;
  }
  const { data } = await client
    .from('cell_comments')
    .insert({
      user_id: user.id,
      course_id: opts.courseId ?? null,
      notebook_key: opts.notebookKey,
      cell_index: opts.cellIndex,
      role: opts.role,
      author_name: opts.authorName,
      body: opts.body
    })
    .select('id,role,author_name,body,created_at')
    .single();
  return (data as ICellComment) ?? null;
}

// ── Personal materials (uploads outside any course) ─────────

export interface IPersonalMaterial {
  id: string;
  title: string;
  docType: string; // 'paper' (PDF) | 'notebook'
  parts: any[];
}

/** The user's personal uploads synced to their account (not course material). */
export async function listPersonalMaterials(): Promise<IPersonalMaterial[]> {
  const client = getClient();
  const user = getCurrentUser();
  if (!client || !user) {
    return [];
  }
  const { data } = await client
    .from('documents')
    .select('id,title,doc_type,parts')
    .eq('user_id', user.id)
    .eq('is_course_material', false)
    .order('last_opened_at', { ascending: false });
  return ((data as any[]) ?? []).map(d => ({
    id: d.id,
    title: d.title,
    docType: d.doc_type ?? 'paper',
    parts: Array.isArray(d.parts) ? d.parts : []
  }));
}

/** Save a personal PDF (its extracted pages) to the user's account. */
export async function savePersonalPdf(opts: {
  title: string;
  sourceText: string;
  pages: Array<{
    pageNumber?: number;
    text?: string;
    imageBase64?: string | null;
    width?: number;
    height?: number;
  }>;
}): Promise<string | null> {
  const client = getClient();
  const user = getCurrentUser();
  if (!client || !user) {
    return null;
  }
  const parts = opts.pages.map((p, i) => ({
    index: i,
    title: `Page ${p.pageNumber ?? i + 1}`,
    text: p.text ?? '',
    imageBase64: p.imageBase64 ?? null,
    width: p.width ?? 1024,
    height: p.height ?? 576
  }));
  const { data } = await client
    .from('documents')
    .insert({
      user_id: user.id,
      title: opts.title,
      source_text: opts.sourceText,
      original_full_text: opts.sourceText,
      parts,
      total_sections: parts.length,
      doc_type: 'paper',
      is_course_material: false,
      last_opened_at: new Date().toISOString()
    })
    .select('id')
    .single();
  return data?.id ?? null;
}

/** Save a personal notebook (its code cells) to the user's account. */
export async function savePersonalNotebook(opts: {
  title: string;
  cells: string[];
}): Promise<string | null> {
  const client = getClient();
  const user = getCurrentUser();
  if (!client || !user) {
    return null;
  }
  const source = opts.cells.join('\n\n');
  const parts = opts.cells.map((src, i) => ({ index: i, text: src }));
  const { data } = await client
    .from('documents')
    .insert({
      user_id: user.id,
      title: opts.title,
      source_text: source,
      original_full_text: source,
      parts,
      total_sections: parts.length,
      doc_type: 'notebook',
      is_course_material: false,
      last_opened_at: new Date().toISOString()
    })
    .select('id')
    .single();
  return data?.id ?? null;
}

// ── Section Notes ────────────────────────────────────────────

export async function upsertSectionNote(
  documentId: string,
  sectionIndex: number,
  noteText: string,
  sectionTitle?: string
): Promise<void> {
  const client = getClient();
  const user = getCurrentUser();
  if (!client || !user) {
    return;
  }
  await client.from('section_notes').upsert(
    {
      user_id: user.id,
      document_id: documentId,
      section_index: sectionIndex,
      section_title: sectionTitle ?? null,
      note_text: noteText
    },
    { onConflict: 'document_id,section_index' }
  );
}

// ── Course Week Slides ───────────────────────────────────────

export interface IWeekSlideResult {
  pages: Array<{ pageNumber: number; text: string; imageBase64: string | null; width: number; height: number }>;
  title: string;
  docId: string;
}

export async function getSupaWeekSlides(
  courseId: string,
  weekNumber: number
): Promise<IWeekSlideResult | null> {
  const client = getClient();
  if (!client) {
    return null;
  }
  const { data: week } = await client
    .from('course_weeks')
    .select('slides_document_id')
    .eq('course_id', courseId)
    .eq('week_number', weekNumber)
    .single();
  if (!week?.slides_document_id) {
    return null;
  }
  const { data: doc } = await client
    .from('documents')
    .select('id,title,parts')
    .eq('id', week.slides_document_id)
    .single();
  if (!doc?.parts?.length) {
    return null;
  }
  const pages = (doc.parts as any[]).map((p: any, i: number) => ({
    pageNumber: i + 1,
    text: p.text ?? '',
    imageBase64: p.imageBase64 ?? null,
    width: p.width ?? 1024,
    height: p.height ?? 576
  }));
  return { pages, title: doc.title, docId: doc.id };
}

export async function upsertCourseWeekSlides(opts: {
  courseId: string;
  weekNumber: string | number;
  weekTheme: string;
  topics: string[];
  title: string;
  sourceText: string;
  parts: any[];
}): Promise<void> {
  const client = getClient();
  const user = getCurrentUser();
  if (!client || !user) {
    return;
  }
  // Upsert the document (slide deck as a document)
  const { data: docData } = await client
    .from('documents')
    .upsert({
      user_id: user.id,
      title: opts.title,
      source_text: opts.sourceText,
      original_full_text: opts.sourceText,
      parts: opts.parts,
      total_sections: opts.parts.length,
      is_course_material: true,
      course_id: opts.courseId,
      doc_type: 'slides',
      last_opened_at: new Date().toISOString()
    })
    .select('id')
    .single();
  if (!docData?.id) {
    return;
  }
  // Upsert the course week linking to this document
  await client
    .from('course_weeks')
    .upsert({
      course_id: opts.courseId,
      week_number: Number(opts.weekNumber),
      theme: opts.weekTheme,
      topics: opts.topics,
      slides_document_id: docData.id,
      is_unlocked: true
    }, { onConflict: 'course_id,week_number' });
}

// ── Flashcard CRUD ───────────────────────────────────────────

export interface IFlashcard {
  id: string;
  section_index: number;
  section_title: string;
  front: string;
  back: string;
  card_type: string;
  due_at: string;
  interval_days: number;
  ease_factor: number;
  repetitions: number;
  review_state: 'new' | 'learning' | 'mastered';
  created_at?: string;
}

export async function getDocumentFlashcards(documentId: string): Promise<IFlashcard[]> {
  const client = getClient();
  const user = getCurrentUser();
  if (!client || !user) return [];
  const { data } = await client
    .from('flashcards')
    .select('*')
    .eq('document_id', documentId)
    .eq('user_id', user.id)
    .order('section_index');
  return (data as IFlashcard[]) ?? [];
}

export async function upsertFlashcardsForSection(
  documentId: string,
  sectionIndex: number,
  sectionTitle: string,
  cards: Array<{ front: string; back: string; card_type: string }>
): Promise<IFlashcard[]> {
  const client = getClient();
  const user = getCurrentUser();
  if (!client || !user) return [];
  const now = new Date().toISOString();
  const payload = cards.map(c => ({
    user_id: user.id,
    document_id: documentId,
    section_index: sectionIndex,
    section_title: sectionTitle,
    front: c.front,
    back: c.back,
    context_sentence: '',
    card_type: c.card_type || 'term_definition',
    review_state: 'new',
    due_at: now,
    interval_days: 0,
    ease_factor: 2.5,
    repetitions: 0
  }));
  const { data } = await client.from('flashcards').insert(payload).select();
  return (data as IFlashcard[]) ?? [];
}

export async function updateFlashcard(
  cardId: string,
  updates: { interval_days: number; ease_factor: number; repetitions: number; due_at: string; review_state: string }
): Promise<void> {
  const client = getClient();
  if (!client) return;
  await client.from('flashcards').update(updates).eq('id', cardId);
}

export async function updateDocumentSections(
  documentId: string,
  sections: Array<{ index: number; understood: boolean }>
): Promise<void> {
  const client = getClient();
  if (!client) return;
  const understood = sections.filter(s => s.understood).length;
  await client.from('documents').update({
    sections_understood: understood,
    total_sections: sections.length
  }).eq('id', documentId);
}

export async function getSectionNotes(
  documentId: string
): Promise<Record<number, string>> {
  const client = getClient();
  const user = getCurrentUser();
  if (!client || !user) {
    return {};
  }
  const { data } = await client
    .from('section_notes')
    .select('section_index,note_text')
    .eq('document_id', documentId)
    .eq('user_id', user.id);
  if (!data) {
    return {};
  }
  const result: Record<number, string> = {};
  for (const row of data as any[]) {
    result[row.section_index] = row.note_text;
  }
  return result;
}
