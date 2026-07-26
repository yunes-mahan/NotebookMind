import { COURSE, ICourse, ICourseNotebook, ICourseWeek, NbStatus } from './courseData';
import { profile, setProfile } from './friendsData';
import { INbDoc } from './nbSource';
import { setAuthoredChallenge } from './demoData';
import {
  listMyCourses,
  getCourseWeeks,
  listCourseNotebooks,
  joinCourseByInvite,
  createCourseDB,
  deleteCourseDB,
  leaveCourseDB,
  listMyCompletedNotebookKeys,
  getMyProfile,
  getMyLearningStats,
  IMyLearningStats,
  IDbWeek
} from './supabaseDB';
import { isConnected } from './supabase';
import { pointsEngine } from './points';

/**
 * Content for DB-backed course notebooks, keyed by notebook key (nb_key).
 * Populated when a course loads its notebooks so the session screen can open
 * real content from the DB instead of a local workspace file.
 */
const courseDocs = new Map<string, INbDoc>();

/** The stored INbDoc for a DB-backed course notebook, if loaded. */
export function getCourseDoc(key: string): INbDoc | undefined {
  return courseDocs.get(key);
}

/**
 * Session course registry — makes the app a complete product loop:
 * students join courses by invite code, teachers create their own.
 * The demo course (code DEMO2025) carries all seeded content; new courses
 * start empty and are filled via the Teacher dashboard.
 */

/** The seeded demo course's Supabase UUID — the only course backed by the DB. */
export const DEMO_COURSE_ID = '00000000-0000-0000-0000-000000000001';

export interface IUserCourse {
  id: string;
  code: string;
  isOwn: boolean; // I created it → I am its teacher
  isDemo: boolean;
  backendId?: string; // Supabase course uuid when DB-backed
  data: ICourse;
}

function makeDemoCourse(): IUserCourse {
  return {
    id: 'demo',
    code: 'DEMO2025',
    isOwn: false,
    isDemo: true,
    backendId: DEMO_COURSE_ID,
    data: COURSE
  };
}

const courses: IUserCourse[] = [makeDemoCourse()];

let activeId = 'demo';

/**
 * Per-user notebook completion, keyed by the notebook's file basename (the same
 * `notebook_key` we persist in notebook_submissions). This is the real, personal
 * "done" state — the course seed only encodes structure (available/locked), so a
 * fresh user starts at 0% and only sees a notebook as done once they finish it.
 */
const completedKeys = new Set<string>();

/**
 * The signed-in user's persisted learning totals (from notebook_submissions),
 * loaded on login so the home "Solved" / "First try" tiles survive a reload.
 * Bumped locally as notebooks complete this session.
 */
let myStats: IMyLearningStats = {
  cellsAttempted: 0,
  cellsFirstTry: 0,
  notebooksCompleted: 0
};

export function getMyStats(): IMyLearningStats {
  return myStats;
}

/** Add this session's just-completed notebook to the persisted totals. */
export function addLocalStats(cellsAttempted: number, cellsFirstTry: number): void {
  myStats = {
    cellsAttempted: myStats.cellsAttempted + cellsAttempted,
    cellsFirstTry: myStats.cellsFirstTry + cellsFirstTry,
    notebooksCompleted: myStats.notebooksCompleted + 1
  };
}

function basename(p: string): string {
  return p.split('/').pop() ?? p;
}

/** The submission key for a course notebook (undefined for dummy/no-file entries). */
function notebookKey(nb: ICourseNotebook): string | undefined {
  return nb.path ? basename(nb.path) : undefined;
}

/** Whether the signed-in user has completed this notebook. */
export function isNotebookDone(nb: ICourseNotebook): boolean {
  if (nb.status === 'done') {
    return true;
  }
  const key = notebookKey(nb);
  return !!key && completedKeys.has(key);
}

/** Mark a notebook done for this user (called when a Learn session completes). */
export function markNotebookDone(key: string): void {
  if (key) {
    completedKeys.add(basename(key));
  }
}

/** A notebook is openable only if it has real content (a workspace file). */
export function isNotebookOpenable(nb: ICourseNotebook): boolean {
  return nb.status === 'available' && !!nb.path;
}

/**
 * The status to actually SHOW a student, resolving the three real states:
 *   done      — this user completed it (overrides everything)
 *   available — the teacher released it AND it has openable content
 *   locked    — the teacher locked it, OR there is no notebook to open yet
 * This is why a placeholder with no file reads as "Locked", never a dead
 * "Available" the student can't click.
 */
export function notebookDisplayStatus(nb: ICourseNotebook): NbStatus {
  if (isNotebookDone(nb)) {
    return 'done';
  }
  if (isNotebookOpenable(nb)) {
    return 'available';
  }
  return 'locked';
}

/** Clear per-user progress (sign-out / account switch). */
export function resetProgress(): void {
  completedKeys.clear();
  myStats = { cellsAttempted: 0, cellsFirstTry: 0, notebooksCompleted: 0 };
}

/** Reset to just the seeded demo course — call on sign-out so the next
 *  user doesn't inherit the previous user's DB courses. */
export function resetToDemoOnly(): void {
  courses.splice(0, courses.length, makeDemoCourse());
  activeId = 'demo';
}

/** Fallback so screens never crash when the user has left every course. */
const NO_COURSE: IUserCourse = {
  id: 'none',
  code: '',
  isOwn: false,
  isDemo: false,
  data: { subject: 'No course', teacher: '', currentWeek: 1, weeks: [], notebooks: {} }
};

export function allCourses(): IUserCourse[] {
  return courses;
}

export function hasCourses(): boolean {
  return courses.length > 0;
}

export function activeCourse(): IUserCourse {
  return courses.find(c => c.id === activeId) ?? courses[0] ?? NO_COURSE;
}

export function activeData(): ICourse {
  return activeCourse().data;
}

export function setActiveCourse(id: string): void {
  if (courses.some(c => c.id === id)) {
    activeId = id;
  }
}

/** Courses the signed-in user teaches (created themselves). */
export function ownedCourses(): IUserCourse[] {
  return courses.filter(c => c.isOwn);
}

/** Remove a course you created. The seeded demo course can't be removed. */
export function deleteCourse(id: string): void {
  const idx = courses.findIndex(c => c.id === id);
  if (idx < 0 || courses[idx].isDemo) {
    return;
  }
  const removed = courses[idx];
  courses.splice(idx, 1);
  if (activeId === id) {
    activeId = courses[0]?.id ?? 'none';
  }
  // Persist the deletion for backend-backed courses the user owns.
  if (removed.backendId && removed.isOwn) {
    void deleteCourseDB(removed.backendId).catch(() => undefined);
  }
}

/** Leave a course you joined (or the demo). Own courses use deleteCourse. */
export function leaveCourse(id: string): void {
  const idx = courses.findIndex(c => c.id === id);
  if (idx < 0) {
    return;
  }
  const removed = courses[idx];
  courses.splice(idx, 1);
  if (activeId === id) {
    activeId = courses[0]?.id ?? 'none';
  }
  // Persist leaving for backend-backed courses (removes the DB enrollment).
  if (removed.backendId && !removed.isOwn) {
    void leaveCourseDB(removed.backendId).catch(() => undefined);
  }
}

function emptyCourse(subject: string, teacher: string): ICourse {
  return { subject, teacher, currentWeek: 1, weeks: [], notebooks: {} };
}

/** Join by invite code. DEMO2025 → the seeded demo course. */
export function joinByCode(codeRaw: string): IUserCourse | null {
  const code = codeRaw.trim().toUpperCase();
  if (!code || code.length < 4) {
    return null;
  }
  const existing = courses.find(c => c.code === code);
  if (existing) {
    activeId = existing.id;
    return existing;
  }
  const joined: IUserCourse = {
    id: `join-${code}`,
    code,
    isOwn: false,
    isDemo: false,
    data: emptyCourse(`Course ${code}`, 'Your teacher')
  };
  courses.push(joined);
  activeId = joined.id;
  return joined;
}

/** Create a course — you become its teacher; students join with the code. */
export function createCourse(name: string): IUserCourse {
  const code = Array.from({ length: 6 }, () =>
    'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'.charAt(Math.floor(Math.random() * 32))
  ).join('');
  const own: IUserCourse = {
    id: `own-${Date.now()}`,
    code,
    isOwn: true,
    isDemo: false,
    data: emptyCourse(name, profile.name)
  };
  courses.push(own);
  activeId = own.id;
  return own;
}

/**
 * The Supabase course id for the active course, or undefined when it isn't
 * backed by the DB (locally-created / joined courses live only in this session).
 * Used to scope real telemetry writes + teacher analytics to the demo course.
 */
export function activeBackendCourseId(): string | undefined {
  return activeCourse().backendId;
}

/** Map DB weeks into the ICourse shape the UI renders. */
function weeksFromDb(dbWeeks: IDbWeek[]): ICourseWeek[] {
  return dbWeeks.map(w => ({
    week: w.week_number,
    theme: w.theme,
    topics: w.topics.length ? w.topics : ['To be planned'],
    slides: {
      pdf: w.hasSlides ? 'online' : '',
      label: w.hasSlides ? 'Slides (online)' : 'No slides yet'
    },
    notebookIds: []
  }));
}

/**
 * Load a course's DB notebooks into its ICourse: register each notebook (with
 * its real release status), stash its content for opening, publish its authored
 * challenges to the Learn store, and ensure a week bucket exists so it renders.
 */
async function loadCourseNotebooks(courseId: string, data: ICourse): Promise<void> {
  const nbs = await listCourseNotebooks(courseId).catch(() => []);
  for (const nb of nbs) {
    const week = nb.week_number ?? 1;
    data.notebooks[nb.nb_key] = {
      id: nb.nb_key,
      title: nb.title,
      topic: '',
      blurb: nb.blurb ?? `${nb.cells.length} cells`,
      week,
      // path = the key so the notebook reads as openable; the session screen
      // resolves the content from courseDocs rather than the filesystem.
      status: nb.status as NbStatus,
      path: nb.nb_key,
      deps: []
    };
    courseDocs.set(nb.nb_key, {
      name: nb.title,
      key: nb.nb_key,
      path: nb.nb_key,
      cells: nb.cells
    });
    // Publish the teacher's authored tasks so Learn shows them course-wide.
    for (const [i, ch] of Object.entries(nb.challenges)) {
      setAuthoredChallenge(nb.nb_key, Number(i), ch as any);
    }
    // Make sure the notebook's week exists and lists it.
    let wk = data.weeks.find(w => w.week === week);
    if (!wk) {
      wk = {
        week,
        theme: `Week ${week}`,
        topics: ['To be planned'],
        slides: { pdf: '', label: 'No slides yet' },
        notebookIds: []
      };
      data.weeks.push(wk);
      data.weeks.sort((a, b) => a.week - b.week);
    }
    if (!wk.notebookIds.includes(nb.nb_key)) {
      wk.notebookIds.push(nb.nb_key);
    }
  }
}

/**
 * Load the signed-in user's DB courses (taught + enrolled) into the registry,
 * so prof-created courses and joined courses persist across sessions and show
 * their published weeks + slides. Safe to call repeatedly (dedupes by backendId).
 */
export async function loadCoursesFromDB(): Promise<void> {
  if (!isConnected()) {
    return;
  }
  const mine = await listMyCourses().catch(() => []);
  for (const m of mine) {
    if (courses.some(c => c.backendId === m.id)) {
      continue; // already present (e.g. the seeded demo course)
    }
    const weeks = weeksFromDb(await getCourseWeeks(m.id).catch(() => []));
    const uc: IUserCourse = {
      id: `db-${m.id}`,
      code: m.invite_code,
      isOwn: m.isOwn,
      isDemo: false,
      backendId: m.id,
      data: {
        subject: m.name,
        teacher: m.isOwn ? profile.name : m.teacher_name || 'Course teacher',
        currentWeek: 1,
        weeks,
        notebooks: {}
      }
    };
    await loadCourseNotebooks(m.id, uc.data);
    courses.push(uc);
  }
}

/**
 * Join a course by invite code. When connected, enrolls in the DB via the
 * join RPC and loads the real course + its published weeks; offline, falls
 * back to the local placeholder behavior.
 */
export async function joinCourse(codeRaw: string): Promise<IUserCourse | null> {
  const code = codeRaw.trim().toUpperCase();
  if (!code || code.length < 4) {
    return null;
  }
  if (isConnected()) {
    const joined = await joinCourseByInvite(code);
    if (!joined) {
      // Not a real course — activate a local copy if we happen to have one.
      return courses.find(c => c.code === code) ?? null;
    }
    const local = courses.find(c => c.backendId === joined.id);
    if (local) {
      activeId = local.id;
      return local;
    }
    const weeks = weeksFromDb(await getCourseWeeks(joined.id).catch(() => []));
    const uc: IUserCourse = {
      id: `db-${joined.id}`,
      code: joined.invite_code,
      isOwn: joined.isOwn,
      isDemo: false,
      backendId: joined.id,
      data: { subject: joined.name, teacher: joined.teacher_name || 'Course teacher', currentWeek: 1, weeks, notebooks: {} }
    };
    await loadCourseNotebooks(joined.id, uc.data);
    courses.push(uc);
    activeId = uc.id;
    return uc;
  }
  return joinByCode(code);
}

/** Create a course — persists to the DB when connected, else local-only. */
export async function createOwnCourse(name: string): Promise<IUserCourse> {
  if (isConnected()) {
    const created = await createCourseDB(name);
    if (created) {
      const uc: IUserCourse = {
        id: `db-${created.id}`,
        code: created.invite_code,
        isOwn: true,
        isDemo: false,
        backendId: created.id,
        data: { subject: created.name, teacher: profile.name, currentWeek: 1, weeks: [], notebooks: {} }
      };
      courses.push(uc);
      activeId = uc.id;
      return uc;
    }
  }
  return createCourse(name);
}

/**
 * Progress over a course. Only notebooks that are actually workable count —
 * a notebook the user has done or can open (available). Locked / not-yet-released
 * placeholders are excluded from the denominator, so progress can reach 100% and
 * doesn't get diluted by content that isn't available to the student.
 */
export function courseProgressOf(c: ICourse): {
  done: number;
  total: number;
  pct: number;
} {
  const statuses = Object.values(c.notebooks).map(notebookDisplayStatus);
  const done = statuses.filter(s => s === 'done').length;
  const total = statuses.filter(s => s !== 'locked').length; // available + done
  return { done, total, pct: total ? Math.round((done / total) * 100) : 0 };
}

export function coursePercentOf(c: ICourse): number {
  return courseProgressOf(c).pct;
}

/** How many notebooks in a course the signed-in user has completed. */
export function courseDoneCount(c: ICourse): number {
  return courseProgressOf(c).done;
}

/**
 * Load the signed-in user's real progress from the DB: their persisted XP total
 * (profiles.points → seeds the Total XP counter) and which notebooks they've
 * completed (notebook_submissions → the per-user "done" overlay). Called after
 * login so the home screen reflects the account, not stale seed/session state.
 */
export async function loadProgressFromDB(): Promise<void> {
  if (!isConnected()) {
    return;
  }
  const [prof, keys, stats] = await Promise.all([
    getMyProfile().catch(() => null),
    listMyCompletedNotebookKeys().catch(() => [] as string[]),
    getMyLearningStats().catch(() => null)
  ]);
  if (prof && typeof prof.points === 'number') {
    pointsEngine.syncTotal(prof.points);
  }
  // Reflect the account's saved display name + photo (edits persist across
  // reloads / devices), overriding the local sign-in defaults.
  if (prof) {
    setProfile({
      name: prof.display_name ?? profile.name,
      avatarUrl: prof.avatar_url ?? ''
    });
  }
  completedKeys.clear();
  for (const k of keys) {
    markNotebookDone(k);
  }
  if (stats) {
    myStats = stats;
  }
}
