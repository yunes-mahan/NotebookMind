import { NotebookMindApp } from './nbApp';
import { pointsEngine } from './points';
import { button, maxWidth, avatar, tag } from './uiKit';
import { MATES, mutualMates, profile } from './friendsData';

/** Leaderboard — prototype layout. Comparison shows ONLY mutual shares. */
export function renderBoard(host: HTMLElement, app: NotebookMindApp): void {
  const root = maxWidth(host, 760);
  root.style.cssText +=
    ';display:flex;flex-direction:column;gap:22px;padding-bottom:32px';

  const head = document.createElement('div');
  head.style.cssText = 'display:flex;flex-direction:column;gap:6px';
  head.innerHTML =
    '<h1 style="margin:0;font-size:22px;font-weight:600;letter-spacing:-0.018em;color:var(--text-primary)">Leaderboard</h1>' +
    '<span style="font-size:13px;color:var(--text-tertiary)">Comparison is opt-in and mutual — you only see friends who also chose to see you.</span>';
  root.appendChild(head);

  // ── My stats ──────────────────────────────────────────────────
  const stats = document.createElement('div');
  stats.style.cssText =
    'display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px';
  const statTile = (value: string, label: string, color: string) => {
    const d = document.createElement('div');
    d.style.cssText =
      'background:var(--surface-card);border:1px solid var(--border-default);border-radius:10px;padding:16px 18px;display:flex;flex-direction:column;gap:4px';
    d.innerHTML =
      `<span style="font-size:24px;font-weight:600;font-family:var(--font-mono);color:${color}">${value}</span>` +
      `<span style="font-size:11.5px;color:var(--text-quaternary);text-transform:uppercase;letter-spacing:0.06em;font-weight:500">${label}</span>`;
    return d;
  };
  stats.appendChild(
    statTile(String(pointsEngine.total), 'Total XP', 'var(--accent-text)')
  );
  stats.appendChild(
    statTile(String(app.notebooksCompleted), 'Notebooks completed', 'var(--text-primary)')
  );
  stats.appendChild(
    statTile(
      app.cellsAttempted ? `${app.firstTryPct()}%` : '0%',
      'First-try rate',
      'var(--text-primary)'
    )
  );
  root.appendChild(stats);

  // ── Comparison ────────────────────────────────────────────────
  const compWrap = document.createElement('div');
  compWrap.style.cssText = 'display:flex;flex-direction:column;gap:10px';

  const compHead = document.createElement('div');
  compHead.style.cssText = 'display:flex;align-items:center;gap:10px';
  const compLbl = document.createElement('span');
  compLbl.style.cssText =
    'font-size:13px;font-weight:600;color:var(--text-secondary);flex:1';
  compLbl.textContent = 'Comparison — you & mutual friends';
  compHead.appendChild(compLbl);
  const manage = button('Manage friends & sharing', 'secondary');
  manage.addEventListener('click', () => app.navigate('friends'));
  compHead.appendChild(manage);
  compWrap.appendChild(compHead);

  const mutual = mutualMates();
  if (mutual.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText =
      'display:flex;flex-direction:column;align-items:center;gap:10px;padding:36px 24px;background:var(--bg-panel);border:1px dashed var(--border-strong);border-radius:10px;text-align:center';
    empty.innerHTML =
      '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--text-quaternary)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"></rect><path d="M7 11V7a5 5 0 0 1 10 0v4"></path></svg>' +
      '<span style="font-size:12.5px;color:var(--text-tertiary);line-height:1.55;max-width:380px">Nobody appears here until BOTH sides share. Offer to share your stats — when a classmate shares back, you both show up, and either of you can stop at any time.</span>';
    compWrap.appendChild(empty);
  } else {
    const table = document.createElement('div');
    table.style.cssText =
      'background:var(--bg-panel);border:1px solid var(--border-default);border-radius:10px;overflow:hidden';
    const cols = 'grid-template-columns:44px 1fr 90px 100px 80px';
    const th = (t: string, right = false) =>
      `<span style="font-size:10.5px;font-weight:600;color:var(--text-quaternary);text-transform:uppercase;letter-spacing:0.06em${right ? ';text-align:right' : ''}">${t}</span>`;
    const headerRow = document.createElement('div');
    headerRow.style.cssText = `display:grid;${cols};gap:8px;padding:9px 16px;border-bottom:1px solid var(--border-subtle)`;
    headerRow.innerHTML =
      th('Rank') + th('Student') + th('XP', true) + th('Notebooks', true) + th('First try', true);
    table.appendChild(headerRow);

    interface IRow {
      name: string;
      xp: number;
      nbs: number;
      ft: string;
      isMe: boolean;
    }
    const rows: IRow[] = [
      {
        name: profile.name,
        xp: pointsEngine.total,
        nbs: app.notebooksCompleted,
        ft: app.cellsAttempted ? String(app.firstTryPct()) : '0',
        isMe: true
      },
      ...mutual.map(m => ({
        name: m.name,
        xp: m.xp,
        nbs: m.notebooks,
        ft: String(m.firstTry),
        isMe: false
      }))
    ].sort((a, b) => b.xp - a.xp);

    rows.forEach((r, i) => {
      const row = document.createElement('div');
      row.style.cssText = `display:grid;${cols};gap:8px;align-items:center;padding:10px 16px;${i > 0 ? 'border-top:1px solid var(--border-subtle);' : ''}${r.isMe ? 'background:var(--accent-subtle-bg)' : ''}`;
      const rank = document.createElement('span');
      rank.style.cssText =
        'font-size:12.5px;font-weight:600;font-family:var(--font-mono);color:var(--text-tertiary)';
      rank.textContent = `#${i + 1}`;
      const who = document.createElement('div');
      who.style.cssText = 'display:flex;align-items:center;gap:9px;min-width:0';
      who.appendChild(avatar(r.name, 22));
      const nm = document.createElement('span');
      nm.style.cssText =
        'font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--text-primary)';
      nm.textContent = r.name;
      who.appendChild(nm);
      if (r.isMe) who.appendChild(tag('You', 'accent'));
      const xp = document.createElement('span');
      xp.style.cssText =
        'font-size:13px;font-family:var(--font-mono);text-align:right;color:var(--accent-text);font-weight:500';
      xp.textContent = r.xp.toLocaleString('en-US');
      const nbs = document.createElement('span');
      nbs.style.cssText =
        'font-size:13px;font-family:var(--font-mono);text-align:right;color:var(--text-secondary)';
      nbs.textContent = String(r.nbs);
      const ft = document.createElement('span');
      ft.style.cssText =
        'font-size:13px;font-family:var(--font-mono);text-align:right;color:var(--text-secondary)';
      ft.textContent = `${r.ft}%`;
      row.appendChild(rank);
      row.appendChild(who);
      row.appendChild(xp);
      row.appendChild(nbs);
      row.appendChild(ft);
      table.appendChild(row);
    });
    compWrap.appendChild(table);
  }

  // Keep an easy path to sharing even when the table is full.
  if (MATES.some(m => m.them && !m.me)) {
    const hint = document.createElement('span');
    hint.style.cssText = 'font-size:12px;color:var(--accent-text)';
    const waiting = MATES.filter(m => m.them && !m.me).map(m => m.name);
    hint.textContent = `${waiting.join(', ')} shared with you — share back under “Manage friends & sharing” to compare.`;
    compWrap.appendChild(hint);
  }

  root.appendChild(compWrap);
}
