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
  docTitle?: string
): Promise<void> {
  const client = getClient();
  const user = getCurrentUser();
  if (!client || !user || points <= 0) {
    return;
  }
  await Promise.all([
    client.from('point_events').insert({
      user_id: user.id,
      points,
      reason,
      document_title: docTitle ?? null
    }),
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
