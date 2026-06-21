import { NotebookMindApp } from './nbApp';
import { getCurrentUser, isConnected } from './supabase';
import {
  getLeaderboard, getMyProfile, setLeaderboardOptIn, ILeaderEntry
} from './supabaseDB';
import { pointsEngine } from './points';
import { button, heading, maxWidth, spinner } from './uiKit';

// Course this leaderboard is scoped to (matches the seeded demo course).
const DEMO_COURSE_ID = '00000000-0000-0000-0000-000000000001';

// Legacy mock fallback when Supabase is not connected
function mockLeaderboard(): ILeaderEntry[] {
  return [
    { rank: 1, display_name: 'Alice M.', username: null, points: 340, weekly_points: 120 },
    { rank: 2, display_name: 'Demo Student', username: null, points: 290, weekly_points: 95 },
    { rank: 3, display_name: 'Carlos R.', username: null, points: 210, weekly_points: 80 },
    { rank: 4, display_name: 'Priya K.', username: null, points: 185, weekly_points: 60 },
    { rank: 5, display_name: 'Tom B.', username: null, points: 160, weekly_points: 40 }
  ];
}

export function renderBoard(host: HTMLElement, app: NotebookMindApp): void {
  const root = maxWidth(host);
  const head = heading('Leaderboard', 'How you stack up against the class');
  head.style.marginTop = 'clamp(8px, 6vh, 64px)';
  root.appendChild(head);

  // ── Stats row ───────────────────────────────────────────────
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

  // ── Table placeholder ────────────────────────────────────────
  const tableWrap = document.createElement('div');
  root.appendChild(tableWrap);

  const loadEl = document.createElement('div');
  loadEl.style.cssText =
    'display:flex;align-items:center;gap:8px;color:var(--nm-fg-muted);font-size:13px;padding:14px 0';
  loadEl.appendChild(spinner('Loading leaderboard…'));
  tableWrap.appendChild(loadEl);

  const me = getCurrentUser();
  const myDisplayName = me?.user_metadata?.display_name ?? me?.email ?? 'Demo Student';

  const showEntries = (entries: ILeaderEntry[]) => {
    if (entries.length === 0) {
      entries = mockLeaderboard();
    }
    // Inject own XP if not in results yet
    const myEntry = entries.find(e => e.display_name === myDisplayName);
    if (myEntry && pointsEngine.total > myEntry.points) {
      myEntry.points = pointsEngine.total;
    }
    entries.sort((a, b) => b.points - a.points);
    entries.forEach((e, i) => { e.rank = i + 1; });
    tableWrap.innerHTML = '';
    renderTable(tableWrap, entries, myDisplayName);
  };

  if (!isConnected()) {
    // Demo mode: no backend — show mock data.
    tableWrap.innerHTML = '';
    renderTable(tableWrap, mockLeaderboard(), 'Demo Student');
  } else {
    // Leaderboards are opt-in: check the user's preference first.
    getMyProfile()
      .then(profile => {
        if (!profile?.leaderboard_opt_in) {
          tableWrap.innerHTML = '';
          renderOptIn(tableWrap, () => renderBoard(host, app));
          return;
        }
        // Opted in → course-scoped leaderboard.
        getLeaderboard(DEMO_COURSE_ID)
          .then(entries => {
            showEntries(entries);
            const optOut = button('Hide me from the leaderboard', 'ghost');
            optOut.style.cssText += ';margin-top:14px;font-size:12px';
            optOut.addEventListener('click', async () => {
              optOut.textContent = 'Updating…';
              (optOut as HTMLButtonElement).disabled = true;
              await setLeaderboardOptIn(false).catch(() => null);
              renderBoard(host, app);
            });
            tableWrap.appendChild(optOut);
          })
          .catch(() => {
            tableWrap.innerHTML = '';
            renderTable(tableWrap, mockLeaderboard(), myDisplayName);
          });
      })
      .catch(() => {
        tableWrap.innerHTML = '';
        renderTable(tableWrap, mockLeaderboard(), myDisplayName);
      });
  }

  const back = button('← Back to notebooks', 'ghost');
  back.style.marginTop = '26px';
  back.addEventListener('click', () => app.navigate('home'));
  root.appendChild(back);
}

function renderOptIn(host: HTMLElement, onOptedIn: () => void): void {
  const card = document.createElement('div');
  card.style.cssText = [
    'background:#fff;border:1px solid var(--nm-border);border-radius:14px',
    'padding:28px 24px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:12px'
  ].join(';');

  const icon = document.createElement('div');
  icon.style.cssText = 'font-size:40px';
  icon.textContent = '🏆';

  const title = document.createElement('div');
  title.style.cssText = 'font-size:17px;font-weight:700;color:var(--nm-fg-strong)';
  title.textContent = 'Join the leaderboard?';

  const body = document.createElement('div');
  body.style.cssText = 'font-size:13px;color:var(--nm-fg-muted);line-height:1.55;max-width:340px';
  body.textContent =
    'Leaderboards are opt-in. Turn this on to compare your XP with classmates in this course. You can turn it off again any time.';

  const optInBtn = button('Show me on the leaderboard', 'primary');
  optInBtn.addEventListener('click', async () => {
    optInBtn.textContent = 'Joining…';
    (optInBtn as HTMLButtonElement).disabled = true;
    try {
      await setLeaderboardOptIn(true);
      onOptedIn();
    } catch {
      optInBtn.textContent = 'Show me on the leaderboard';
      (optInBtn as HTMLButtonElement).disabled = false;
    }
  });

  card.appendChild(icon);
  card.appendChild(title);
  card.appendChild(body);
  card.appendChild(optInBtn);
  host.appendChild(card);
}

function renderTable(host: HTMLElement, entries: ILeaderEntry[], myName: string): void {
  const badges = ['🥇', '🥈', '🥉'];
  const colHeader = document.createElement('div');
  colHeader.style.cssText = [
    'display:grid;grid-template-columns:56px 1fr 90px 44px',
    'padding:6px 16px;font-size:11px;font-weight:700;color:var(--nm-fg-subtle)',
    'text-transform:uppercase;letter-spacing:0.6px;margin-bottom:6px'
  ].join(';');
  ['Rank', 'Student', 'XP', ''].forEach(h => {
    const c = document.createElement('div');
    c.textContent = h;
    colHeader.appendChild(c);
  });
  host.appendChild(colHeader);

  const table = document.createElement('div');
  table.style.cssText = 'display:flex;flex-direction:column;gap:6px';

  entries.forEach((entry, i) => {
    const isMe =
      entry.display_name === myName ||
      entry.username === myName;
    const row = document.createElement('div');
    row.style.cssText = [
      'display:grid;grid-template-columns:56px 1fr 90px 44px',
      'padding:13px 16px;border-radius:11px;align-items:center',
      `background:${isMe ? 'var(--nm-secondary)' : '#fff'}`,
      `border:1px solid ${isMe ? 'var(--nm-secondary-hover)' : 'var(--nm-border)'}`,
      'opacity:0;transition:opacity 0.3s'
    ].join(';');

    const rank = document.createElement('div');
    rank.style.cssText =
      'font-size:16px;font-weight:700;color:var(--nm-fg-strong)';
    rank.textContent = `#${entry.rank}`;

    const name = document.createElement('div');
    name.style.cssText = `font-size:14px;color:var(--nm-fg);font-weight:${isMe ? '700' : '500'}`;
    name.textContent = isMe
      ? `${entry.display_name} (you)`
      : entry.display_name;

    const pts = document.createElement('div');
    pts.style.cssText = 'font-size:14px;font-weight:700;color:var(--nm-primary)';
    pts.textContent = String(entry.points);

    const badge = document.createElement('div');
    badge.style.cssText = 'font-size:18px;text-align:center';
    badge.textContent = badges[i] ?? '';

    row.appendChild(rank);
    row.appendChild(name);
    row.appendChild(pts);
    row.appendChild(badge);
    table.appendChild(row);
    setTimeout(() => { row.style.opacity = '1'; }, i * 60);
  });

  host.appendChild(table);
}

function statCard(label: string, value: string): HTMLElement {
  const card = document.createElement('div');
  card.style.cssText =
    'background:#fff;border:1px solid var(--nm-border);border-radius:14px;padding:18px 20px';
  const v = document.createElement('div');
  v.style.cssText =
    'font-size:32px;font-weight:800;color:var(--nm-fg-strong);line-height:1';
  v.textContent = value;
  const l = document.createElement('div');
  l.style.cssText =
    'font-size:13px;color:var(--nm-fg-muted);margin-top:6px;font-weight:500';
  l.textContent = label;
  card.appendChild(v);
  card.appendChild(l);
  return card;
}
