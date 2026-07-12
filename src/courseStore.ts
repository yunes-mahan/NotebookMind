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

export function allCourses(): IUserCourse[] {
  return courses;
}

export function activeCourse(): IUserCourse {
  return courses.find(c => c.id === activeId) ?? courses[0];
}

export function activeData(): ICourse {
  return activeCourse().data;
}

export function setActiveCourse(id: string): void {
  if (courses.some(c => c.id === id)) {
    activeId = id;
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
