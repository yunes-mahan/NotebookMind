import { COURSE, ICourse } from './courseData';
import { profile } from './friendsData';

/**
 * Session course registry — makes the app a complete product loop:
 * students join courses by invite code, teachers create their own.
 * The demo course (code DEMO2025) carries all seeded content; new courses
 * start empty and are filled via the Teacher dashboard.
 */

export interface IUserCourse {
  id: string;
  code: string;
  isOwn: boolean; // I created it → I am its teacher
  isDemo: boolean;
  data: ICourse;
}

const courses: IUserCourse[] = [
  { id: 'demo', code: 'DEMO2025', isOwn: false, isDemo: true, data: COURSE }
];

let activeId = 'demo';

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
  courses.splice(idx, 1);
  if (activeId === id) {
    activeId = courses[0]?.id ?? 'none';
  }
}

/** Leave a course you joined (or the demo). Own courses use deleteCourse. */
export function leaveCourse(id: string): void {
  const idx = courses.findIndex(c => c.id === id);
  if (idx < 0) {
    return;
  }
  courses.splice(idx, 1);
  if (activeId === id) {
    activeId = courses[0]?.id ?? 'none';
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

export function coursePercentOf(c: ICourse): number {
  const all = Object.values(c.notebooks);
  if (all.length === 0) {
    return 0;
  }
  const done = all.filter(n => n.status === 'done').length;
  return Math.round((done / all.length) * 100);
}
