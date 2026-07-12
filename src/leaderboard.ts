import { getLeaderboard } from './supabaseDB';

const CURRENT_USER = 'Demo Student';

export function renderLeaderboard(container: HTMLElement): void {
  container.innerHTML = '';

  const header = document.createElement('div');
  header.style.cssText = 'margin-bottom:16px';
  const title = document.createElement('div');
  title.style.cssText = 'font-size:16px;font-weight:700;color:var(--nm-fg);margin-bottom:4px';
  title.textContent = '📚 NotebookMind Leaderboard';
  const sub = document.createElement('div');
  sub.style.cssText = 'font-size:12px;color:var(--nm-fg-muted)';
  sub.textContent = 'Demo Notebook — Week 12';
  header.appendChild(title);
  header.appendChild(sub);

  const banner = document.createElement('div');
  banner.style.cssText = [
    'background:var(--nm-warning-soft);border:1px solid var(--nm-warning);border-radius:8px',
    'padding:10px 14px;margin-bottom:16px;font-size:12px;color:#92400E',
    'display:flex;align-items:center;gap:6px'
  ].join(';');
  banner.innerHTML = '🔌 <strong>Connect Supabase for live data</strong>';

  // Column headers
  const colHeader = document.createElement('div');
  colHeader.style.cssText = [
    'display:grid;grid-template-columns:44px 1fr 58px 36px',
    'padding:6px 12px;font-size:10px;font-weight:700;color:var(--nm-fg-subtle)',
    'text-transform:uppercase;letter-spacing:0.6px;margin-bottom:4px'
  ].join(';');
  ['Rank', 'Student', 'Points', ''].forEach(h => {
    const c = document.createElement('div');
    c.textContent = h;
    colHeader.appendChild(c);
  });

  const table = document.createElement('div');
  table.style.cssText = 'display:flex;flex-direction:column;gap:4px';

  getLeaderboard().then(entries => entries).catch(() => []).then(entries => entries.forEach((entry: any, i: number) => {
    const isCurrent = (entry.display_name || entry.name) === CURRENT_USER;
    const row = document.createElement('div');
    row.style.cssText = [
      'display:grid;grid-template-columns:44px 1fr 58px 36px',
      'padding:10px 12px;border-radius:9px;align-items:center',
      `background:${isCurrent ? 'var(--nm-accent-soft)' : '#FFFFFF'}`,
      `border:1px solid ${isCurrent ? 'var(--nm-accent-border)' : 'var(--nm-bg-elev-2)'}`,
      'opacity:0;transition:opacity 0.3s'
    ].join(';');

    const rankMap: Record<number, string> = { 1: '🥇', 2: '🥈', 3: '🥉' };
    const rankCell = document.createElement('div');
    rankCell.style.cssText = 'font-size:15px;font-weight:700';
    rankCell.textContent = rankMap[entry.rank] ?? `#${entry.rank}`;

    const nameCell = document.createElement('div');
    nameCell.style.cssText = `font-size:13px;color:var(--nm-fg);font-weight:${isCurrent ? '700' : '400'}`;
    nameCell.textContent = entry.display_name || entry.name || '?';

    const ptsCell = document.createElement('div');
    ptsCell.style.cssText = 'font-size:13px;font-weight:600;color:var(--nm-primary)';
    ptsCell.textContent = String(entry.points);

    const badgeCell = document.createElement('div');
    badgeCell.style.cssText = 'font-size:16px;text-align:center';
    badgeCell.textContent = entry.badge ?? '';

    row.appendChild(rankCell);
    row.appendChild(nameCell);
    row.appendChild(ptsCell);
    row.appendChild(badgeCell);
    table.appendChild(row);

    // Staggered fade-in
    setTimeout(() => { row.style.opacity = '1'; }, i * 70);
  }));

  container.appendChild(header);
  container.appendChild(banner);
  container.appendChild(colHeader);
  container.appendChild(table);
}
