/**
 * Session store for the consent-based friends system (prototype behavior).
 * `me`/`them` are independent flags; only me && them makes stats visible.
 * The Supabase pairwise `friend_shares` table wires in here later.
 */

export interface IMate {
  id: string;
  name: string;
  xp: number;
  notebooks: number;
  firstTry: number;
  me: boolean; // I share with them
  them: boolean; // they share with me
}

export const MATES: IMate[] = [
  { id: 'alice', name: 'Alice M.', xp: 340, notebooks: 5, firstTry: 82, me: false, them: true },
  { id: 'carlos', name: 'Carlos R.', xp: 210, notebooks: 4, firstTry: 64, me: true, them: true },
  { id: 'priya', name: 'Priya K.', xp: 185, notebooks: 3, firstTry: 71, me: false, them: false },
  { id: 'tom', name: 'Tom B.', xp: 160, notebooks: 3, firstTry: 58, me: true, them: false }
];

export const invited: Array<{ name: string; email: string }> = [];

export type UserRole = 'student' | 'teacher';

/** Local profile / signed-in user (demo mode — no backend). */
export const profile: {
  name: string;
  email: string;
  signedIn: boolean;
  avatarUrl: string;
  role: UserRole;
  onboarded: boolean;
} = {
  name: 'Guest',
  email: '',
  signedIn: false,
  avatarUrl: '',
  role: 'student',
  onboarded: false
};

/** Set the signed-in user and notify the shell (sidebar account row). */
export function setUser(name: string, email: string, role: UserRole = 'student'): void {
  profile.name = name;
  profile.email = email;
  profile.role = role;
  profile.signedIn = true;
  document.dispatchEvent(new CustomEvent('notebookmind:user'));
}

/** Update display name / avatar and notify the shell to repaint. */
export function setProfile(patch: { name?: string; avatarUrl?: string }): void {
  if (typeof patch.name === 'string') {
    profile.name = patch.name;
  }
  if (typeof patch.avatarUrl === 'string') {
    profile.avatarUrl = patch.avatarUrl;
  }
  document.dispatchEvent(new CustomEvent('notebookmind:user'));
}

export function clearUser(): void {
  profile.name = 'Guest';
  profile.email = '';
  profile.signedIn = false;
  profile.avatarUrl = '';
  profile.role = 'student';
  profile.onboarded = false;
  document.dispatchEvent(new CustomEvent('notebookmind:user'));
}

export function mutualMates(): IMate[] {
  return MATES.filter(m => m.me && m.them);
}
