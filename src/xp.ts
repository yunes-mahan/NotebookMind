import { Difficulty } from './challenge';

export const XP_BY_DIFFICULTY: Record<Difficulty, number> = {
  easy: 2,
  medium: 4,
  hard: 6,
  impossible: 10
};

export const DIFFICULTY_META: Record<
  Difficulty,
  { label: string; color: string }
> = {
  easy: { label: 'Easy', color: '#5F8B27' },
  medium: { label: 'Medium', color: '#B27B1F' },
  hard: { label: 'Hard', color: '#C9633A' },
  impossible: { label: 'Impossible', color: '#6B4FCF' }
};

export interface IXpBreakdownRow {
  count: number;
  xp: number;
}

export class XpSession {
  private _entries: Difficulty[] = [];
  private _attempts = 0;
  private _firstTry = 0;

  reset(): void {
    this._entries = [];
    this._attempts = 0;
    this._firstTry = 0;
  }

  award(difficulty: Difficulty): number {
    this._entries.push(difficulty);
    return XP_BY_DIFFICULTY[difficulty];
  }

  /** Record a completed cell (this run) and whether it was solved first try. */
  recordAttempt(firstTry: boolean): void {
    this._attempts += 1;
    if (firstTry) {
      this._firstTry += 1;
    }
  }

  get attempts(): number {
    return this._attempts;
  }

  firstTryPct(): number {
    return this._attempts
      ? Math.round((this._firstTry / this._attempts) * 100)
      : 0;
  }

  get total(): number {
    return this._entries.reduce((sum, d) => sum + XP_BY_DIFFICULTY[d], 0);
  }

  get count(): number {
    return this._entries.length;
  }

  breakdown(): Record<Difficulty, IXpBreakdownRow> {
    const rows: Record<Difficulty, IXpBreakdownRow> = {
      easy: { count: 0, xp: 0 },
      medium: { count: 0, xp: 0 },
      hard: { count: 0, xp: 0 },
      impossible: { count: 0, xp: 0 }
    };
    this._entries.forEach(d => {
      rows[d].count += 1;
      rows[d].xp += XP_BY_DIFFICULTY[d];
    });
    return rows;
  }
}
