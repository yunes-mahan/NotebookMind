import { addPoints as dbAddPoints } from './supabaseDB';

export const EXPLAIN_CELL = 1;
export const QUIZ_CORRECT = 2;
export const BUG_QUIZ_CORRECT = 5;
export const FLASHCARD_EASY = 3;
export const NOTEBOOK_COMPLETE = 30;

export class PointsEngine {
  private _total = 0;

  get total(): number {
    return this._total;
  }

  /** Wipe the local XP counter (sign-out / delete account). */
  reset(): void {
    this._total = 0;
    document.dispatchEvent(
      new CustomEvent('notebookmind:points', {
        detail: { total: 0, delta: 0, reason: 'reset' }
      })
    );
  }

  addPoints(amount: number, reason: string): void {
    this._total += amount;
    dbAddPoints(amount, reason).catch(() => null);
    document.dispatchEvent(
      new CustomEvent('notebookmind:points', {
        detail: { total: this._total, delta: amount, reason }
      })
    );
    this._showToast(amount);
  }

  /** Prototype celebration chip (single instance — richer labels may replace it). */
  private _showToast(amount: number): void {
    const existing = document.getElementById('nm-celebrate-chip');
    if (existing) existing.remove();
    const chip = document.createElement('div');
    chip.id = 'nm-celebrate-chip';
    chip.textContent = `+${amount} XP`;
    chip.style.cssText = [
      'position:fixed;top:60px;right:24px;z-index:3000;padding:8px 14px;border-radius:9999px',
      'background:var(--surface-card);border:1px solid rgba(94,106,210,0.5);color:var(--accent-text)',
      'font-size:13px;font-weight:600;font-family:var(--font-sans)',
      'box-shadow:0 4px 16px rgba(0,0,0,0.10), 0 0 12px var(--brand-glow)',
      'animation:nm-pop 1.4s var(--ease-out) both;pointer-events:none'
    ].join(';');
    document.body.appendChild(chip);
    setTimeout(() => chip.remove(), 1500);
  }
}

export const pointsEngine = new PointsEngine();
