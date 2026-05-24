import { NotebookMindApp } from './nbApp';
import { Difficulty } from './challenge';
import { DIFFICULTY_META, XP_BY_DIFFICULTY } from './xp';
import { button, maxWidth } from './uiKit';

const ORDER: Difficulty[] = ['easy', 'medium', 'hard', 'impossible'];

export function renderComplete(host: HTMLElement, app: NotebookMindApp): void {
  const root = maxWidth(host);

  const hero = document.createElement('div');
  hero.style.cssText = 'text-align:center;margin:48px 0 28px';
  const emoji = document.createElement('div');
  emoji.style.cssText = 'font-size:64px;line-height:1';
  emoji.textContent = '🏆';
  const title = document.createElement('div');
  title.style.cssText =
    'font-size:28px;font-weight:800;color:var(--nm-text);margin-top:10px';
  title.textContent = 'Notebook complete!';
  const sub = document.createElement('div');
  sub.style.cssText = 'font-size:15px;color:var(--nm-text-secondary);margin-top:4px';
  sub.textContent = app.doc ? app.doc.name : '';
  hero.appendChild(emoji);
  hero.appendChild(title);
  hero.appendChild(sub);
  root.appendChild(hero);

  // Three small metric widgets, side by side.
  const metrics = document.createElement('div');
  metrics.style.cssText =
    'display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;margin-bottom:26px';
  metrics.appendChild(metricCard(`+${app.xp.total}`, 'XP earned', 'var(--nm-fg-strong)'));
  metrics.appendChild(
    metricCard(String(app.xp.attempts), 'Code blocks solved', 'var(--nm-fg-strong)')
  );
  metrics.appendChild(
    metricCard(`${app.xp.firstTryPct()}%`, 'First try', 'var(--nm-fg-strong)')
  );
  root.appendChild(metrics);

  // Breakdown
  const breakdown = app.xp.breakdown();
  const bdTitle = document.createElement('div');
  bdTitle.style.cssText =
    'font-size:13px;font-weight:700;color:var(--nm-text-secondary);text-transform:uppercase;letter-spacing:0.6px;margin-bottom:12px';
  bdTitle.textContent = 'XP breakdown';
  root.appendChild(bdTitle);

  const grid = document.createElement('div');
  grid.style.cssText = 'display:flex;flex-direction:column;gap:8px;margin-bottom:26px';
  ORDER.forEach(d => {
    const row = breakdown[d];
    const meta = DIFFICULTY_META[d];
    const item = document.createElement('div');
    const dim = row.count === 0;
    item.style.cssText = [
      'display:grid;grid-template-columns:14px 1fr auto auto;gap:12px;align-items:center',
      'padding:13px 16px;background:#fff;border:1px solid var(--nm-border);border-radius:12px',
      dim ? 'opacity:0.5' : ''
    ].join(';');

    const dot = document.createElement('span');
    dot.style.cssText = `width:12px;height:12px;border-radius:50%;background:${meta.color}`;
    const name = document.createElement('span');
    name.style.cssText = 'font-size:14px;font-weight:600;color:var(--nm-text)';
    name.textContent = `${meta.label} (${XP_BY_DIFFICULTY[d]} XP each)`;
    const count = document.createElement('span');
    count.style.cssText = 'font-size:13px;color:var(--nm-text-secondary)';
    count.textContent = `× ${row.count}`;
    const xp = document.createElement('span');
    xp.style.cssText = `font-size:14px;font-weight:700;color:${meta.color};min-width:54px;text-align:right`;
    xp.textContent = `${row.xp} XP`;

    item.appendChild(dot);
    item.appendChild(name);
    item.appendChild(count);
    item.appendChild(xp);
    grid.appendChild(item);
  });
  root.appendChild(grid);

  // Actions
  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;gap:12px';
  const boardBtn = button('🏆 View leaderboard');
  boardBtn.style.flex = '1';
  boardBtn.addEventListener('click', () => app.navigate('board'));
  // Gray fill so it lifts off the warm page background.
  const homeBtn = document.createElement('button');
  homeBtn.textContent = 'Back to notebooks';
  homeBtn.style.cssText = [
    'flex:1;padding:9px 15px;border-radius:var(--nm-radius-md);cursor:pointer',
    'font:500 14px var(--nm-font-sans);color:var(--nm-fg-strong)',
    'background:var(--nm-bg-section);border:1px solid var(--nm-border);transition:all 160ms var(--nm-ease)'
  ].join(';');
  homeBtn.addEventListener('mouseenter', () => {
    homeBtn.style.background = 'var(--nm-border)';
  });
  homeBtn.addEventListener('mouseleave', () => {
    homeBtn.style.background = 'var(--nm-bg-section)';
  });
  homeBtn.addEventListener('click', () => app.navigate('home'));
  actions.appendChild(boardBtn);
  actions.appendChild(homeBtn);
  root.appendChild(actions);
}

function metricCard(value: string, label: string, color: string): HTMLElement {
  const card = document.createElement('div');
  card.style.cssText = [
    'background:#fff;border:1px solid var(--nm-border);border-radius:var(--nm-radius-lg)',
    'padding:18px 14px;text-align:center;box-shadow:var(--nm-shadow-xs)'
  ].join(';');
  const v = document.createElement('div');
  v.style.cssText = `font-size:30px;font-weight:800;line-height:1;color:${color}`;
  v.textContent = value;
  const l = document.createElement('div');
  l.style.cssText =
    'font-size:12.5px;color:var(--nm-text-secondary);margin-top:6px;font-weight:600';
  l.textContent = label;
  card.appendChild(v);
  card.appendChild(l);
  return card;
}
