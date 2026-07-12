import { NotebookMindApp } from './nbApp';
import { button, maxWidth } from './uiKit';

/** Prototype "Notebook complete" card. */
export function renderComplete(host: HTMLElement, app: NotebookMindApp): void {
  const root = maxWidth(host, 780);

  const cardEl = document.createElement('div');
  cardEl.style.cssText = [
    'display:flex;flex-direction:column;align-items:center;gap:14px;padding:56px 24px;margin-top:24px',
    'background:var(--surface-card);border:1px solid rgba(94,106,210,0.4);border-radius:12px',
    'text-align:center;animation:nm-rise 0.3s ease-out both'
  ].join(';');

  const ring = document.createElement('div');
  ring.style.cssText =
    'width:52px;height:52px;border-radius:50%;background:var(--accent-subtle-bg);display:flex;align-items:center;justify-content:center';
  ring.innerHTML =
    '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--brand-300)" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>';
  cardEl.appendChild(ring);

  const h2 = document.createElement('h2');
  h2.style.cssText =
    'margin:0;font-size:20px;font-weight:600;letter-spacing:-0.02em;color:var(--text-primary)';
  h2.textContent = 'Notebook complete';
  cardEl.appendChild(h2);

  if (app.doc) {
    const sub = document.createElement('span');
    sub.style.cssText = 'font-size:12.5px;color:var(--text-tertiary)';
    sub.textContent = app.doc.name;
    cardEl.appendChild(sub);
  }

  const metrics = document.createElement('div');
  metrics.style.cssText = 'display:flex;gap:28px;margin-top:4px';
  const metric = (value: string, label: string, accent = false) => {
    const d = document.createElement('div');
    d.style.cssText = 'display:flex;flex-direction:column;gap:2px';
    d.innerHTML =
      `<span style="font-size:22px;font-weight:600;font-family:var(--font-mono);color:${accent ? 'var(--accent-text)' : 'var(--text-primary)'}">${value}</span>` +
      `<span style="font-size:11px;color:var(--text-quaternary);text-transform:uppercase;letter-spacing:0.06em">${label}</span>`;
    return d;
  };
  metrics.appendChild(metric(`+${app.xp.total}`, 'XP earned', true));
  metrics.appendChild(metric(String(app.xp.attempts), 'Steps solved'));
  metrics.appendChild(metric(`${app.xp.firstTryPct()}%`, 'First try'));
  cardEl.appendChild(metrics);

  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;gap:8px;margin-top:6px';
  const back = button('Back to Course', 'primary');
  back.addEventListener('click', () => app.navigate('home'));
  const board = button('View leaderboard', 'ghost');
  board.addEventListener('click', () => app.navigate('board'));
  actions.appendChild(back);
  actions.appendChild(board);
  cardEl.appendChild(actions);

  root.appendChild(cardEl);
}
