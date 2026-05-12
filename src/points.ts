import { savePoints } from './supabase';

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

  addPoints(amount: number, reason: string): void {
    this._total += amount;
    savePoints('mock-user-1', this._total);
    document.dispatchEvent(
      new CustomEvent('notebookmind:points', {
        detail: { total: this._total, delta: amount, reason }
      })
    );
    this._showToast(amount);
  }

  private _showToast(amount: number): void {
    if (!document.querySelector('#nm-toast-style')) {
      const style = document.createElement('style');
      style.id = 'nm-toast-style';
      style.textContent =
        '@keyframes nmFadeOut{0%{opacity:1;transform:translateY(0)}70%{opacity:1;transform:translateY(-6px)}100%{opacity:0;transform:translateY(-12px)}}';
      document.head.appendChild(style);
    }
    const toast = document.createElement('div');
    toast.textContent = `+${amount} pts`;
    Object.assign(toast.style, {
      position: 'fixed',
      top: '80px',
      right: '24px',
      zIndex: '9999',
      background: '#10B981',
      color: 'white',
      padding: '8px 16px',
      borderRadius: '20px',
      fontWeight: '600',
      fontSize: '14px',
      boxShadow: '0 4px 12px rgba(16,185,129,0.4)',
      animation: 'nmFadeOut 2s forwards',
      pointerEvents: 'none'
    });
    document.body.appendChild(toast);
    setTimeout(() => toast.remove(), 2000);
  }
}

export const pointsEngine = new PointsEngine();
