import { NotebookMindApp } from './nbApp';
import { pointsEngine } from './points';
import { button, maxWidth, avatar, tag, spinner, infoBox } from './uiKit';
import { profile } from './friendsData';
import { activeCourse, activeBackendCourseId } from './courseStore';
import { isConnected } from './supabase';
import {
  getLeaderboard,
  getMyProfile,
  setLeaderboardOptIn,
  ILeaderEntry,
  IProfile
} from './supabaseDB';

/**
 * Leaderboard — real, course-scoped and opt-in. Rankings come from the
 * get_course_leaderboard RPC (only opted-in classmates of the active course).
 * Nobody appears until they choose to share, and you can hide again anytime.
 */
export function renderBoard(host: HTMLElement, app: NotebookMindApp): void {
  const root = maxWidth(host, 760);
  root.style.cssText +=
    ';display:flex;flex-direction:column;gap:22px;padding-bottom:32px';

  const uc = activeCourse();
  const courseId = activeBackendCourseId();

  const head = document.createElement('div');
  head.style.cssText = 'display:flex;flex-direction:column;gap:6px';
  head.innerHTML =
    '<h1 style="margin:0;font-size:22px;font-weight:600;letter-spacing:-0.018em;color:var(--text-primary)">Leaderboard</h1>' +
    `<span style="font-size:13px;color:var(--text-tertiary)">${
      courseId
        ? `${uc.data.subject} — course-scoped and opt-in. Only classmates who chose to share appear.`
        : 'Leaderboards are course-scoped. Join a connected course to compare with classmates.'
    }</span>`;
  root.appendChild(head);

  const body = document.createElement('div');
  body.style.cssText = 'display:flex;flex-direction:column;gap:22px';
  root.appendChild(body);

  const repaint = (): void => {
    body.innerHTML = '';
    void renderInner(body, courseId, repaint);
  };
  void renderInner(body, courseId, repaint);
}

async function renderInner(
  body: HTMLElement,
  courseId: string | undefined,
  repaint: () => void
): Promise<void> {
  const connected = isConnected() && !!courseId;

  const spin = spinner('Loading leaderboard…');
  body.appendChild(spin);

  let myProfile: IProfile | null = null;
  let entries: ILeaderEntry[] = [];
  if (connected) {
    myProfile = await getMyProfile().catch(() => null);
    if (myProfile?.leaderboard_opt_in) {
      entries = await getLeaderboard(courseId).catch(() => []);
    }
  }
  spin.remove();

  const myName = myProfile?.display_name || profile.name;
  const myRankIdx = entries.findIndex(e => e.display_name === myName);

  // ── My stats (persistent when connected, session XP otherwise) ──
  const totalXp = myProfile ? myProfile.points : pointsEngine.total;
  const weekly = myProfile ? myProfile.weekly_points : 0;
  const rankLabel =
    myRankIdx >= 0
      ? `#${myRankIdx + 1}`
      : myProfile?.leaderboard_opt_in
      ? '—'
      : 'Hidden';

  const stats = document.createElement('div');
  stats.style.cssText = 'display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px';
  const statTile = (value: string, label: string, color: string): HTMLElement => {
    const d = document.createElement('div');
    d.style.cssText =
      'background:var(--surface-card);border:1px solid var(--border-default);border-radius:10px;padding:16px 18px;display:flex;flex-direction:column;gap:4px';
    d.innerHTML =
      `<span style="font-size:24px;font-weight:600;font-family:var(--font-mono);color:${color}">${value}</span>` +
      `<span style="font-size:11.5px;color:var(--text-quaternary);text-transform:uppercase;letter-spacing:0.06em;font-weight:500">${label}</span>`;
    return d;
  };
  stats.appendChild(statTile(totalXp.toLocaleString('en-US'), 'Total XP', 'var(--accent-text)'));
  stats.appendChild(statTile(String(weekly), 'XP this week', 'var(--text-primary)'));
  stats.appendChild(statTile(rankLabel, 'Your rank', 'var(--text-primary)'));
  body.appendChild(stats);

  // ── Not connected → explain how to get on a real leaderboard ──
  if (!connected) {
    body.appendChild(
      infoBox(
        'The leaderboard is course-scoped and lives on the backend. Join the demo course (invite code DEMO2025) to see how you rank against classmates.',
        'info'
      )
    );
    return;
  }

  // ── Connected but not sharing → opt-in card ──
  if (!myProfile?.leaderboard_opt_in) {
    body.appendChild(
      optInCard(async () => {
        await setLeaderboardOptIn(true).catch(() => undefined);
        repaint();
      })
    );
    return;
  }

  // ── Opted in → the real ranked table ──
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;flex-direction:column;gap:10px';

  const barHead = document.createElement('div');
  barHead.style.cssText = 'display:flex;align-items:center;gap:10px';
  barHead.innerHTML =
    '<span style="font-size:13px;font-weight:600;color:var(--text-secondary);flex:1">Class ranking</span>';
  const hideBtn = button('Hide me from the leaderboard', 'secondary');
  hideBtn.addEventListener('click', () => {
    hideBtn.disabled = true;
    void setLeaderboardOptIn(false).then(() => repaint());
  });
  barHead.appendChild(hideBtn);
  wrap.appendChild(barHead);

  if (entries.length === 0) {
    wrap.appendChild(
      infoBox('No classmates are sharing yet — you’re the first. As others opt in, they’ll appear here.', 'info')
    );
    body.appendChild(wrap);
    return;
  }

  const table = document.createElement('div');
  table.style.cssText =
    'background:var(--bg-panel);border:1px solid var(--border-default);border-radius:10px;overflow:hidden';
  const cols = 'grid-template-columns:44px 1fr 90px 90px';
  const th = (t: string, right = false): string =>
    `<span style="font-size:10.5px;font-weight:600;color:var(--text-quaternary);text-transform:uppercase;letter-spacing:0.06em${right ? ';text-align:right' : ''}">${t}</span>`;
  const headerRow = document.createElement('div');
  headerRow.style.cssText = `display:grid;${cols};gap:8px;padding:9px 16px;border-bottom:1px solid var(--border-subtle)`;
  headerRow.innerHTML = th('Rank') + th('Student') + th('XP', true) + th('This week', true);
  table.appendChild(headerRow);

  entries.forEach((e, i) => {
    const isMe = e.display_name === myName;
    const row = document.createElement('div');
    row.style.cssText = `display:grid;${cols};gap:8px;align-items:center;padding:10px 16px;${i > 0 ? 'border-top:1px solid var(--border-subtle);' : ''}${isMe ? 'background:var(--accent-subtle-bg)' : ''}`;
    const rank = document.createElement('span');
    rank.style.cssText =
      'font-size:12.5px;font-weight:600;font-family:var(--font-mono);color:var(--text-tertiary)';
    rank.textContent = `#${e.rank}`;
    const who = document.createElement('div');
    who.style.cssText = 'display:flex;align-items:center;gap:9px;min-width:0';
    who.appendChild(avatar(e.display_name, 22));
    const nm = document.createElement('span');
    nm.style.cssText =
      'font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--text-primary)';
    nm.textContent = e.display_name;
    who.appendChild(nm);
    if (isMe) {
      who.appendChild(tag('You', 'accent'));
    }
    const xp = document.createElement('span');
    xp.style.cssText =
      'font-size:13px;font-family:var(--font-mono);text-align:right;color:var(--accent-text);font-weight:500';
    xp.textContent = e.points.toLocaleString('en-US');
    const wk = document.createElement('span');
    wk.style.cssText =
      'font-size:13px;font-family:var(--font-mono);text-align:right;color:var(--text-secondary)';
    wk.textContent = String(e.weekly_points);
    row.appendChild(rank);
    row.appendChild(who);
    row.appendChild(xp);
    row.appendChild(wk);
    table.appendChild(row);
  });
  wrap.appendChild(table);
  body.appendChild(wrap);
}

/** Privacy-first opt-in card shown until the student chooses to share. */
function optInCard(onOptIn: () => void): HTMLElement {
  const card = document.createElement('div');
  card.style.cssText =
    'display:flex;flex-direction:column;align-items:center;gap:12px;padding:40px 24px;background:var(--bg-panel);border:1px dashed var(--border-strong);border-radius:10px;text-align:center';
  card.innerHTML =
    '<svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="var(--accent-text)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M8 21h8M12 17v4M7 4h10v5a5 5 0 0 1-10 0z"></path><path d="M5 9a2 2 0 0 1-2-2V5h4M19 9a2 2 0 0 0 2-2V5h-4"></path></svg>' +
    '<span style="font-size:15px;font-weight:600;color:var(--text-primary)">Join the course leaderboard</span>' +
    '<span style="font-size:12.5px;color:var(--text-tertiary);line-height:1.55;max-width:420px">See how you rank against classmates — and let them see you. Sharing is opt-in and you can hide again at any time.</span>';
  const go = button('Show me on the leaderboard', 'primary');
  go.addEventListener('click', () => {
    go.disabled = true;
    go.textContent = 'Joining…';
    onOptIn();
  });
  card.appendChild(go);
  return card;
}
