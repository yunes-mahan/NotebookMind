import { getCellStates, saveCellState } from './supabase';

export type CellState = 'mastered' | 'pending' | 'skipped';

export class ProgressTracker {
  private _states: Map<string, CellState>;

  constructor() {
    this._states = getCellStates() as Map<string, CellState>;
  }

  setState(cellId: string, state: CellState): void {
    this._states.set(cellId, state);
    saveCellState(cellId, state);
    document.dispatchEvent(
      new CustomEvent('notebookmind:progress', {
        detail: { cellId, state, states: this._states }
      })
    );
  }

  getState(cellId: string): CellState {
    return this._states.get(cellId) ?? 'pending';
  }

  getAllStates(): Map<string, CellState> {
    return this._states;
  }

  getMasteredCount(): number {
    let count = 0;
    this._states.forEach(s => {
      if (s === 'mastered') {
        count++;
      }
    });
    return count;
  }
}

export const progressTracker = new ProgressTracker();
