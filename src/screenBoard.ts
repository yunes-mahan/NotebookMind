import { NotebookMindApp } from './nbApp';
import { getLeaderboard, ILeaderboardEntry } from './supabase';
import { pointsEngine } from './points';
import { button, heading, maxWidth } from './uiKit';

const CURRENT_USER = 'Demo Student';

export function renderBoard(host: HTMLElement, app: NotebookMindApp): void {
  const root = maxWidth(host);
  // Breathing room from the top when there's vertical space available.
  const head = heading('Leaderboard', 'How you stack up against the class');
  head.style.marginTop = 'clamp(8px, 6vh, 64px)';
  root.appendChild(head);

  // ── Stats row ─────────────────────────────────────────────────
  const stats = document.createElement('div');
  stats.style.cssText =
    'display:grid;grid-template-columns:1fr 1fr 1fr;gap:14px;margin-bottom:26px';
  stats.appendChild(statCard('⭐ Total XP', String(pointsEngine.total)));
  stats.appendChild(
    statCard('📓 Notebooks completed', String(app.notebooksCompleted))
  );
  stats.appendChild(
    statCard(
      '🎯 Cells correct 1st try',
      app.cellsAttempted ? `${app.firstTryPct()}%` : '—'
    )
  );
  root.appendChild(stats);

  // ── Leaderboard ──────────────────────────────────────────────
  const entries: ILeaderboardEntry[] = getLeaderboard().map(e => ({ ...e }));
  const me = entries.find(e => e.name === CURRENT_USER);
  if (me) {
    me.points = Math.max(me.points, pointsEngine.total);
  }
  entries.sort((a, b) => b.points - a.points);
  const badges = ['🥇', '🥈', '🥉'];
  entries.forEach((e, i) => {
    e.rank = i + 1;
    e.badge = badges[i] ?? '';
  });

  const colHeader = document.createElement('div');
  colHeader.style.cssText = [
    'display:grid;grid-template-columns:56px 1fr 90px 44px',
    'padding:6px 16px;font-size:11px;font-weight:700;color:var(--nm-text-faint)',
    'text-transform:uppercase;letter-spacing:0.6px;margin-bottom:6px'
  ].join(';');
  ['Rank', 'Student', 'XP', ''].forEach(h => {
    const c = document.createElement('div');
    c.textContent = h;
    colHeader.appendChild(c);
  });
  root.appendChild(colHeader);

  const table = document.createElement('div');
  table.style.cssText = 'display:flex;flex-direction:column;gap:6px';
  entries.forEach((entry, i) => {
    const isMe = entry.name === CURRENT_USER;
    const row = document.createElement('div');
    row.style.cssText = [
      'display:grid;grid-template-columns:56px 1fr 90px 44px',
      'padding:13px 16px;border-radius:11px;align-items:center',
      `background:${isMe ? 'var(--nm-accent-light)' : '#fff'}`,
      `border:1px solid ${isMe ? 'var(--nm-accent-border)' : 'var(--nm-border-subtle)'}`,
      'opacity:0;transition:opacity 0.3s'
    ].join(';');

    const rank = document.createElement('div');
    rank.style.cssText = 'font-size:16px;font-weight:700;color:var(--nm-text)';
    rank.textContent = `#${entry.rank}`;
    const name = document.createElement('div');
    name.style.cssText = `font-size:14px;color:var(--nm-text);font-weight:${isMe ? '700' : '500'}`;
    name.textContent = isMe ? `${entry.name} (you)` : entry.name;
    const pts = document.createElement('div');
    pts.style.cssText = 'font-size:14px;font-weight:700;color:var(--nm-accent)';
    pts.textContent = String(entry.points);
    const badge = document.createElement('div');
    badge.style.cssText = 'font-size:18px;text-align:center';
    badge.textContent = entry.badge;

    row.appendChild(rank);
    row.appendChild(name);
    row.appendChild(pts);
    row.appendChild(badge);
    table.appendChild(row);
    setTimeout(() => {
      row.style.opacity = '1';
    }, i * 60);
  });
  root.appendChild(table);

  const back = button('← Back to notebooks', 'ghost');
  back.style.marginTop = '26px';
  back.addEventListener('click', () => app.navigate('home'));
  root.appendChild(back);
}

function statCard(label: string, value: string): HTMLElement {
  const card = document.createElement('div');
  card.style.cssText =
    'background:#fff;border:1px solid var(--nm-border);border-radius:14px;padding:18px 20px';
  const v = document.createElement('div');
  v.style.cssText = 'font-size:32px;font-weight:800;color:var(--nm-text);line-height:1';
  v.textContent = value;
  const l = document.createElement('div');
  l.style.cssText = 'font-size:13px;color:var(--nm-text-secondary);margin-top:6px;font-weight:500';
  l.textContent = label;
  card.appendChild(v);
  card.appendChild(l);
  return card;
}
