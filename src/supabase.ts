// SUPABASE PLACEHOLDER — replace with real client when ready
// import { createClient } from '@supabase/supabase-js'

export type CellState = 'mastered' | 'pending' | 'skipped';

export interface IUser {
  id: string;
  email: string;
  name: string;
}

export interface ILeaderboardEntry {
  rank: number;
  name: string;
  points: number;
  badge: string;
}

export interface IUserSettings {
  level: 'beginner' | 'intermediate' | 'expert';
  theme: 'light' | 'dark';
}

export function getUser(): IUser {
  return { id: 'mock-user-1', email: 'student@demo.com', name: 'Demo Student' };
}

export function getLeaderboard(): ILeaderboardEntry[] {
  return [
    { rank: 1, name: 'Alice M.', points: 340, badge: '🏆' },
    { rank: 2, name: 'Demo Student', points: 290, badge: '🥈' },
    { rank: 3, name: 'Carlos R.', points: 210, badge: '🥉' },
    { rank: 4, name: 'Priya K.', points: 185, badge: '' },
    { rank: 5, name: 'Tom B.', points: 160, badge: '' },
    { rank: 6, name: 'Sara L.', points: 140, badge: '' },
    { rank: 7, name: 'James O.', points: 95, badge: '' },
    { rank: 8, name: 'Mia C.', points: 60, badge: '' }
  ];
}

export function getUserSettings(): IUserSettings {
  return { level: 'beginner', theme: 'light' };
}

export function savePoints(userId: string, points: number): boolean {
  console.log(`[NotebookMind] savePoints: user=${userId}, points=${points}`);
  return true;
}

export function saveCellState(cellId: string, state: CellState): boolean {
  console.log(`[NotebookMind] saveCellState: cell=${cellId}, state=${state}`);
  return true;
}

export function getCellStates(): Map<string, CellState> {
  return new Map<string, CellState>();
}
