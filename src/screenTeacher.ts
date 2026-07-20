import { NotebookMindApp } from './nbApp';
import { ICourseWeek } from './courseData';
import { activeCourse, activeData, activeBackendCourseId } from './courseStore';
import { teacherInsights, teacherAsk, generateChallenge, isAiReady } from './gemini';
import { renderMarkdown } from './markdown';
import { loadNotebook, parseUploadedNotebook, INbDoc } from './nbSource';
import {
  cellTitle,
  setAuthoredChallenge,
  demoChallenge,
  setTeacherExplain,
  getTeacherExplain,
  demoCellMeta,
  IAuthoredChallenge
} from './demoData';
import { Difficulty } from './challenge';
import {
  button,
  infoBox,
  spinner,
  maxWidth,
  backArrow,
  segmented,
  tag,
  statusIcon,
  celebrate
} from './uiKit';
import { extractPdfFull } from './pdfExtract';
import {
  upsertCourseWeekSlides,
  getCellFailStats,
  getCourseActivity,
  getCellComments,
  upsertTeacherNote,
  ICellFailStat,
  ICourseActivity
} from './supabaseDB';
import { isConnected } from './supabase';

type Tab = 'overview' | 'content';

function basename(p: string): string {
  return p.split('/').pop() ?? p;
}

export function renderTeacher(host: HTMLElement, app: NotebookMindApp): void {
  const root = maxWidth(host, 1100);
  root.style.cssText +=
    ';display:flex;flex-direction:column;gap:18px;padding-bottom:64px';
  let tab: Tab = 'overview';

  // Header: back link · (title + badge + course line) left / tabs right
  const head = document.createElement('div');
  head.style.cssText = 'display:flex;flex-direction:column;gap:8px';

  const headRow = document.createElement('div');
  headRow.style.cssText =
    'display:flex;align-items:flex-end;justify-content:space-between;gap:16px;flex-wrap:wrap';

  const left = document.createElement('div');
  left.style.cssText = 'display:flex;flex-direction:column;gap:6px;min-width:0';
  const titleRow = document.createElement('div');
  titleRow.style.cssText = 'display:flex;align-items:center;gap:10px';
  titleRow.appendChild(backArrow(() => app.navigate('home'), 'Back to Course'));
  const h1 = document.createElement('h1');
  h1.style.cssText =
    'margin:0;font-size:22px;font-weight:600;letter-spacing:-0.018em;color:var(--text-primary)';
  h1.textContent = 'Teacher dashboard';
  titleRow.appendChild(h1);
  titleRow.appendChild(tag('Aggregates only', 'success'));
  left.appendChild(titleRow);
  const ucHead = activeCourse();
  const courseLine = document.createElement('div');
  courseLine.style.cssText =
    'display:flex;align-items:center;gap:8px;flex-wrap:wrap';
  const subj = document.createElement('span');
  subj.style.cssText = 'font-size:13px;font-weight:500;color:var(--text-secondary)';
  subj.textContent = ucHead.data.subject;
  courseLine.appendChild(subj);
  if (ucHead.isOwn) {
    courseLine.appendChild(tag('You teach', 'accent', true));
    // Invite-code chip with click-to-copy
    const chip = document.createElement('span');
    chip.style.cssText =
      'display:inline-flex;align-items:center;gap:6px;font-size:11.5px;color:var(--text-tertiary);background:var(--bg-panel);border:1px solid var(--border-default);border-radius:7px;padding:3px 8px;cursor:pointer;transition:border-color var(--dur-fast) var(--ease-out)';
    const setChip = (copied: boolean): void => {
      chip.innerHTML =
        '<span style="color:var(--text-quaternary)">Invite code</span>' +
        `<span style="font-family:var(--font-mono);font-weight:600;letter-spacing:0.06em;color:var(--accent-text)">${ucHead.code}</span>` +
        (copied
          ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="var(--green-400)" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>'
          : '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2"></rect><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"></path></svg>');
    };
    setChip(false);
    chip.title = 'Copy invite code';
    chip.addEventListener('mouseenter', () => (chip.style.borderColor = 'var(--border-strong)'));
    chip.addEventListener('mouseleave', () => (chip.style.borderColor = 'var(--border-default)'));
    chip.addEventListener('click', () => {
      void navigator.clipboard?.writeText(ucHead.code).catch(() => undefined);
      setChip(true);
      setTimeout(() => setChip(false), 1400);
    });
    courseLine.appendChild(chip);
  } else {
    const by = document.createElement('span');
    by.style.cssText = 'font-size:13px;color:var(--text-tertiary)';
    by.textContent = `· ${ucHead.data.teacher}`;
    courseLine.appendChild(by);
  }
  left.appendChild(courseLine);
  headRow.appendChild(left);

  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'content', label: 'Weeks & content' }
  ];
  const seg = segmented(tabs, tab, id => {
    tab = id as Tab;
    render();
  });
  seg.style.flexShrink = '0';
  headRow.appendChild(seg);
  head.appendChild(headRow);
  root.appendChild(head);

  const body = document.createElement('div');
  root.appendChild(body);

  function render(): void {
    body.innerHTML = '';
    if (tab === 'overview') {
      renderOverview(body);
    } else {
      renderContent(body, app);
    }
  }
  render();
}

function field(labelText: string, el: HTMLElement): HTMLElement {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'margin-bottom:12px;display:flex;flex-direction:column;gap:5px';
  const l = document.createElement('div');
  l.style.cssText =
    'font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;color:var(--text-quaternary)';
  l.textContent = labelText;
  wrap.appendChild(l);
  wrap.appendChild(el);
  return wrap;
}

function _focusable(el: HTMLInputElement | HTMLTextAreaElement): void {
  el.addEventListener('focus', () => {
    el.style.borderColor = 'var(--accent)';
    el.style.boxShadow = 'var(--ring)';
  });
  el.addEventListener('blur', () => {
    el.style.borderColor = 'var(--border-default)';
    el.style.boxShadow = 'none';
  });
}

function textInput(value = ''): HTMLInputElement {
  const i = document.createElement('input');
  i.type = 'text';
  i.value = value;
  i.style.cssText =
    'width:100%;box-sizing:border-box;height:var(--control-md);padding:0 11px;font-family:var(--font-sans);font-size:13px;border:1px solid var(--border-default);border-radius:var(--radius-control);outline:none;color:var(--text-primary);background:var(--surface-input);transition:border-color var(--dur-fast) var(--ease-out),box-shadow var(--dur-fast) var(--ease-out)';
  _focusable(i);
  return i;
}

function textArea(value = '', rows = 4): HTMLTextAreaElement {
  const t = document.createElement('textarea');
  t.value = value;
  t.rows = rows;
  t.style.cssText =
    'width:100%;box-sizing:border-box;resize:vertical;font-family:var(--font-sans);font-size:13px;padding:9px 11px;border:1px solid var(--border-default);border-radius:var(--radius-control);outline:none;color:var(--text-primary);background:var(--surface-input);line-height:1.55;transition:border-color var(--dur-fast) var(--ease-out),box-shadow var(--dur-fast) var(--ease-out)';
  _focusable(t);
  return t;
}

// ── Overview ──────────────────────────────────────────────────────
/** One row of the struggle chart, derived from real cell-attempt stats. */
interface IStruggleRow {
  label: string;
  struggle: number; // 0–100, higher = more students struggled (1 - first-try rate)
  firstTryPct: number;
  attempts: number;
}

/** Trim a raw notebook key/path into a compact label. */
function shortKey(key: string): string {
  const base = key.split('/').pop() ?? key;
  const name = base.replace(/\.ipynb$/i, '');
  return name.length > 26 ? name.slice(0, 25) + '…' : name;
}

function toStruggleRows(stats: ICellFailStat[]): IStruggleRow[] {
  return stats.map(s => ({
    label: `${shortKey(s.notebook_key)} · Cell ${s.cell_index + 1}`,
    struggle: Math.round((1 - s.success_rate) * 100),
    firstTryPct: Math.round(s.success_rate * 100),
    attempts: s.total_attempts
  }));
}

/** Colored-dot KPI tile (prototype styling). */
function kpiTile(
  value: string,
  label: string,
  sub: string,
  color = 'var(--text-primary)'
): HTMLElement {
  const d = document.createElement('div');
  d.style.cssText =
    'background:var(--surface-card);border:1px solid var(--border-default);border-radius:10px;padding:15px 16px;display:flex;flex-direction:column;gap:9px';
  d.innerHTML =
    `<div style="display:flex;align-items:center;gap:7px"><span style="width:6px;height:6px;border-radius:50%;flex:0 0 auto;background:${color}"></span>` +
    `<span style="font-size:10.5px;color:var(--text-quaternary);text-transform:uppercase;letter-spacing:0.06em;font-weight:600;line-height:1.3">${label}</span></div>` +
    `<span style="font-size:28px;font-weight:600;font-family:var(--font-mono);letter-spacing:-0.02em;line-height:1;color:${color}">${value}</span>` +
    `<span style="font-size:11.5px;color:var(--text-tertiary);line-height:1.35">${sub}</span>`;
  return d;
}

/** Centered dashed empty-state card. */
function analyticsEmpty(title: string, body: string): HTMLElement {
  const empty = document.createElement('div');
  empty.style.cssText =
    'display:flex;flex-direction:column;align-items:center;gap:10px;padding:40px 24px;background:var(--bg-panel);border:1px dashed var(--border-strong);border-radius:10px;text-align:center';
  empty.innerHTML =
    '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--text-quaternary)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle></svg>' +
    `<span style="font-size:13px;font-weight:600;color:var(--text-primary)">${title}</span>` +
    `<span style="font-size:12.5px;color:var(--text-tertiary);line-height:1.55;max-width:420px">${body}</span>`;
  return empty;
}

// ── Overview — real, anonymous aggregate analytics from Supabase ──
function renderOverview(host: HTMLElement): void {
  host.style.cssText = 'display:flex;flex-direction:column;gap:14px';

  const courseId = activeBackendCourseId();
  if (!courseId) {
    host.appendChild(
      analyticsEmpty(
        'Analytics aren’t connected for this course',
        'Live class analytics are available for the connected demo course. Locally-created courses aren’t wired to the analytics backend yet.'
      )
    );
    return;
  }

  const loading = spinner('Loading class analytics…');
  host.appendChild(loading);

  void Promise.all([
    getCellFailStats(courseId).catch(() => [] as ICellFailStat[]),
    getCourseActivity(courseId).catch(() => null)
  ]).then(([cellStats, activity]) => {
    loading.remove();
    const act: ICourseActivity = activity ?? {
      submissionCount: 0,
      activeStudents: 0,
      avgFirstTryPct: 0,
      totalXp: 0,
      recent: []
    };

    if (cellStats.length === 0 && act.submissionCount === 0) {
      host.appendChild(
        analyticsEmpty(
          'No student activity yet',
          'Aggregate analytics appear here once students join with your invite code and work through notebooks in Learn mode.'
        )
      );
      return;
    }

    const struggles = toStruggleRows(cellStats);
    const highStruggle = struggles.filter(s => s.struggle >= 50).length;

    // KPI tiles
    const stats = document.createElement('div');
    stats.style.cssText =
      'display:grid;grid-template-columns:repeat(4,1fr);gap:12px';
    stats.appendChild(kpiTile(String(act.activeStudents), 'Active students', 'submitted a notebook'));
    stats.appendChild(kpiTile(`${act.avgFirstTryPct}%`, 'Avg first-try rate', 'across submissions'));
    stats.appendChild(kpiTile(String(act.submissionCount), 'Submissions', 'notebook runs completed'));
    stats.appendChild(
      kpiTile(String(highStruggle), 'High-struggle cells', 'need your attention', 'var(--yellow-500)')
    );
    host.appendChild(stats);

    // Struggle (left, wide) + Topic mastery (right) — only when we have per-cell data.
    if (struggles.length > 0) {
      const grid = document.createElement('div');
      grid.style.cssText =
        'display:grid;grid-template-columns:minmax(0,1.5fr) minmax(0,1fr);gap:12px;align-items:start';
      grid.appendChild(struggleCard(struggles));
      grid.appendChild(topicMastery(struggles));
      host.appendChild(grid);
    }

    // AI insights — grounded in the real per-cell data.
    host.appendChild(insightsCard(struggles, act));
  });
}

/** Build a real data context string for the AI from the aggregates. */
function buildInsightsContext(rows: IStruggleRow[], act: ICourseActivity): string {
  const perf = rows.length
    ? rows
        .map(
          r =>
            `- ${r.label}: ${r.firstTryPct}% first-try over ${r.attempts} attempt(s) (struggle ${r.struggle}/100)`
        )
        .join('\n')
    : '(no per-cell data yet)';
  return `Class: ${act.activeStudents} active students, ${act.submissionCount} notebook submissions, avg first-try ${act.avgFirstTryPct}%.\n\nPer-cell first-try success (worst first):\n${perf}`;
}

/** A locally-computed real summary, shown when AI isn't configured. */
function localInsights(rows: IStruggleRow[]): string {
  if (rows.length === 0) {
    return 'Students have submitted notebooks, but there isn’t enough per-cell data yet to pinpoint where they struggle. Encourage more Learn-mode practice.';
  }
  const worst = rows.slice(0, 3);
  const lines = worst
    .map(r => `- **${r.label}** — ${r.firstTryPct}% first-try over ${r.attempts} attempt(s).`)
    .join('\n');
  return `## Where students struggle\n\nThe lowest first-try rates this far:\n\n${lines}\n\n**Suggested action:** revisit these cells in class or add a worked example to the relevant week’s slides.`;
}

/** AI-insights card with a real-data fallback + the "ask" chat. */
function insightsCard(rows: IStruggleRow[], act: ICourseActivity): HTMLElement {
  const context = buildInsightsContext(rows, act);
  const aiCard = document.createElement('div');
  aiCard.style.cssText =
    'background:var(--surface-card);border:1px solid var(--border-default);border-radius:10px;padding:18px 20px;display:flex;flex-direction:column;gap:12px';
  const aiHead = document.createElement('div');
  aiHead.style.cssText = 'display:flex;align-items:center;gap:8px';
  const aiTitle = document.createElement('span');
  aiTitle.style.cssText = 'font-size:13.5px;font-weight:600;color:var(--text-primary)';
  aiTitle.textContent = 'AI insights';
  aiHead.appendChild(aiTitle);
  aiHead.appendChild(tag(isAiReady() ? 'Generated' : 'From your data', 'accent'));
  aiCard.appendChild(aiHead);

  const insHost = document.createElement('div');
  insHost.style.cssText = 'font-size:13px;line-height:1.65;color:var(--text-secondary)';
  insHost.appendChild(renderMarkdown(localInsights(rows)));
  aiCard.appendChild(insHost);

  // Upgrade to an AI-written report when a key is configured — still grounded
  // in the real context so it never invents cells that don't exist.
  if (isAiReady()) {
    void teacherInsights(context)
      .then(text => {
        insHost.innerHTML = '';
        insHost.appendChild(renderMarkdown(text));
      })
      .catch(() => undefined);
  }

  aiCard.appendChild(teacherChat(context));
  return aiCard;
}

/** Where students struggle — horizontal indigo bars, from real cell stats. */
function struggleCard(rows: IStruggleRow[]): HTMLElement {
  const c = document.createElement('div');
  c.style.cssText =
    'background:var(--surface-card);border:1px solid var(--border-default);border-radius:10px;padding:18px 20px;display:flex;flex-direction:column;gap:14px';
  const head = document.createElement('div');
  head.style.cssText = 'display:flex;align-items:baseline;gap:8px';
  head.innerHTML =
    '<span style="font-size:13.5px;font-weight:600;color:var(--text-primary)">Where students struggle</span>' +
    '<span style="flex:1"></span>' +
    '<span style="font-size:11px;color:var(--text-quaternary)">All students · aggregate</span>';
  c.appendChild(head);

  const list = document.createElement('div');
  list.style.cssText = 'display:flex;flex-direction:column;gap:10px';
  const ordered = [...rows].sort((a, b) => b.struggle - a.struggle).slice(0, 8);
  const maxStruggle = Math.max(1, ...ordered.map(p => p.struggle));
  ordered.forEach(p => {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;flex-direction:column;gap:5px';
    row.title = `${p.label}\n${p.firstTryPct}% first-try · ${p.attempts} attempt(s)`;
    const lblRow = document.createElement('div');
    lblRow.style.cssText = 'display:flex;align-items:baseline;gap:10px';
    lblRow.innerHTML =
      `<span style="flex:1;min-width:0;font-size:12px;color:var(--text-secondary);line-height:1.35;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.label}</span>` +
      `<span style="flex:0 0 auto;font-size:11.5px;font-family:var(--font-mono);color:var(--text-tertiary)">${p.struggle}</span>`;
    const track = document.createElement('div');
    track.style.cssText =
      'height:8px;border-radius:4px;background:var(--gray-800);overflow:hidden';
    const fill = document.createElement('div');
    const alpha = p.struggle >= 55 ? 1 : p.struggle >= 35 ? 0.72 : 0.45;
    fill.style.cssText = `height:100%;border-radius:4px;background:rgba(94,106,210,${alpha});width:${Math.round((p.struggle / maxStruggle) * 100)}%`;
    track.appendChild(fill);
    row.appendChild(lblRow);
    row.appendChild(track);
    list.appendChild(row);
  });
  c.appendChild(list);

  const hint = document.createElement('span');
  hint.style.cssText = 'font-size:11px;color:var(--text-quaternary)';
  hint.textContent =
    'Struggle score = share of students who did NOT solve the cell on the first try.';
  c.appendChild(hint);
  return c;
}

/** Topic mastery — "Going well" (green) vs "Needs review" (yellow) bars. */
function topicMastery(rows: IStruggleRow[]): HTMLElement {
  const c = document.createElement('div');
  c.style.cssText =
    'background:var(--surface-card);border:1px solid var(--border-default);border-radius:10px;padding:18px 20px;display:flex;flex-direction:column;gap:16px';
  c.innerHTML =
    '<span style="font-size:13.5px;font-weight:600;color:var(--text-primary)">Topic mastery</span>';

  const sorted = [...rows].sort((a, b) => b.firstTryPct - a.firstTryPct);
  const strengths = sorted.slice(0, 3);
  const weaknesses = sorted.slice(-3).reverse().filter(w => !strengths.includes(w));

  const makeList = (
    title: string,
    items: IStruggleRow[],
    color: string
  ): HTMLElement => {
    const col = document.createElement('div');
    col.style.cssText = 'display:flex;flex-direction:column;gap:11px';
    col.innerHTML = `<span style="font-size:11px;font-weight:600;color:${color};text-transform:uppercase;letter-spacing:0.05em">${title}</span>`;
    items.forEach(p => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;flex-direction:column;gap:5px';
      row.innerHTML =
        `<div style="display:flex;align-items:baseline;gap:10px"><span style="flex:1;min-width:0;font-size:12.5px;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.label}</span>` +
        `<span style="flex:0 0 auto;font-size:11.5px;font-family:var(--font-mono);color:${color}">${p.firstTryPct}%</span></div>` +
        `<div style="height:6px;border-radius:3px;background:var(--gray-800);overflow:hidden"><div style="height:100%;border-radius:3px;background:${color === 'var(--green-400)' ? 'var(--green-500)' : 'var(--yellow-500)'};width:${Math.min(100, p.firstTryPct)}%"></div></div>`;
      col.appendChild(row);
    });
    return col;
  };

  c.appendChild(makeList('Going well', strengths, 'var(--green-400)'));
  if (weaknesses.length) {
    const sep = document.createElement('div');
    sep.style.cssText = 'height:1px;background:var(--border-subtle)';
    c.appendChild(sep);
    c.appendChild(makeList('Needs review', weaknesses, 'var(--yellow-500)'));
  }
  return c;
}

function teacherChat(context: string): HTMLElement {
  const wrap = document.createElement('div');
  const log = document.createElement('div');
  log.style.cssText =
    'display:flex;flex-direction:column;gap:8px;max-height:240px;overflow-y:auto;margin-bottom:10px';
  const hint = document.createElement('div');
  hint.style.cssText = 'font-size:12.5px;color:var(--nm-fg-subtle);font-style:italic';
  hint.textContent =
    'e.g. "How can I help the bottom third on group-by?" or "What should I review before Week 4?"';
  log.appendChild(hint);

  const history: { role: 'user' | 'assistant'; text: string }[] = [];
  const inputRow = document.createElement('div');
  inputRow.style.cssText = 'display:flex;gap:8px;align-items:stretch';
  const input = document.createElement('input');
  input.type = 'text';
  input.placeholder = 'Ask for improvements…';
  input.style.cssText = [
    'flex:1;box-sizing:border-box;height:40px;font-family:var(--nm-font-sans);font-size:13px',
    'padding:0 12px;border:1px solid var(--nm-border);border-radius:var(--nm-radius);outline:none;color:var(--nm-fg)'
  ].join(';');
  const send = button('Ask', 'accent');
  send.style.height = '40px';

  function bubble(role: 'user' | 'assistant', text: string): HTMLElement {
    const b = document.createElement('div');
    const isUser = role === 'user';
    b.style.cssText = [
      'font-size:13px;line-height:1.6;padding:9px 12px;border-radius:var(--nm-radius);max-width:90%;white-space:pre-wrap',
      isUser
        ? 'align-self:flex-end;background:var(--nm-accent);color:#fff'
        : 'align-self:flex-start;background:var(--nm-bg-elev-2);color:var(--nm-fg);border:1px solid var(--nm-border)'
    ].join(';');
    b.textContent = text;
    return b;
  }

  async function submit(): Promise<void> {
    const q = input.value.trim();
    if (!q) {
      return;
    }
    input.value = '';
    if (history.length === 0) {
      log.innerHTML = '';
    }
    history.push({ role: 'user', text: q });
    log.appendChild(bubble('user', q));
    const thinking = bubble('assistant', '…');
    log.appendChild(thinking);
    log.scrollTop = log.scrollHeight;
    send.disabled = true;
    try {
      const ans = await teacherAsk(q, context, history.slice(0, -1));
      thinking.textContent = ans;
      history.push({ role: 'assistant', text: ans });
    } catch {
      thinking.textContent = 'Sorry — something went wrong.';
    } finally {
      send.disabled = false;
      log.scrollTop = log.scrollHeight;
    }
  }
  send.addEventListener('click', () => void submit());
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      e.preventDefault();
      void submit();
    }
  });

  inputRow.appendChild(input);
  inputRow.appendChild(send);
  wrap.appendChild(log);
  wrap.appendChild(inputRow);
  return wrap;
}

// ── Weeks & content (prototype layout) ────────────────────────────
// Session stores: expanded rows · timed releases · uploaded material names.
const tExpand = new Map<string, boolean>(); // notebook → practice-tasks open
const tSchedules = new Map<string, string>();
const tEditWeek = new Set<number>();
// Teacher-uploaded notebooks (session-scoped): notebook id → parsed cells.
const uploadedDocs = new Map<string, INbDoc>();

/** Keep week numbers contiguous (1..n) and notebook.week in sync after edits. */
function renumberWeeks(COURSE: ReturnType<typeof activeData>): void {
  COURSE.weeks.forEach((w, i) => {
    const newNum = i + 1;
    w.week = newNum;
    w.notebookIds.forEach(id => {
      const nb = COURSE.notebooks[id];
      if (nb) {
        nb.week = newNum;
      }
    });
  });
  COURSE.currentWeek = Math.min(
    Math.max(1, COURSE.currentWeek),
    Math.max(1, COURSE.weeks.length)
  );
}

function renderContent(host: HTMLElement, app: NotebookMindApp): void {
  const COURSE = activeData();
  host.style.cssText = 'display:flex;flex-direction:column;gap:10px';

  // Timed releases that have passed → unlock automatically.
  tSchedules.forEach((when, nbId) => {
    if (when && new Date(when) <= new Date()) {
      const nb = COURSE.notebooks[nbId];
      if (nb && nb.status === 'locked') nb.status = 'available';
      tSchedules.delete(nbId);
    }
  });

  const repaint = (): void => {
    host.innerHTML = '';
    renderContent(host, app);
  };

  // Current-week picker chips (only when weeks exist)
  if (COURSE.weeks.length > 0) {
    const top = document.createElement('div');
    top.style.cssText =
      'background:var(--surface-card);border:1px solid var(--border-default);border-radius:10px;padding:16px 18px;display:flex;align-items:center;gap:14px;flex-wrap:wrap';
    const lbl = document.createElement('span');
    lbl.style.cssText = 'font-size:13px;font-weight:500;color:var(--text-secondary)';
    lbl.textContent = 'Current week';
    top.appendChild(lbl);
    const picks = document.createElement('div');
    picks.style.cssText = 'display:flex;gap:4px';
    COURSE.weeks.forEach(w => {
      const p = document.createElement('span');
      p.textContent = String(w.week);
      const on = COURSE.currentWeek === w.week;
      p.style.cssText =
        'width:23px;height:23px;display:flex;align-items:center;justify-content:center;border-radius:6px;font-size:11.5px;font-weight:600;cursor:pointer;font-family:var(--font-mono);' +
        (on
          ? 'background:var(--accent);color:#fff'
          : 'background:var(--bg-panel);color:var(--text-tertiary);border:1px solid var(--border-subtle)');
      p.addEventListener('click', () => {
        COURSE.currentWeek = w.week;
        repaint();
      });
      picks.appendChild(p);
    });
    top.appendChild(picks);
    const theme = document.createElement('span');
    theme.style.cssText = 'font-size:12px;color:var(--text-quaternary)';
    theme.textContent =
      COURSE.weeks.find(w => w.week === COURSE.currentWeek)?.theme ?? '';
    top.appendChild(theme);
    host.appendChild(top);
  } else {
    const hint = document.createElement('div');
    hint.style.cssText =
      'padding:16px 4px;font-size:13px;color:var(--text-tertiary)';
    hint.textContent =
      'No weeks yet. Add a week, then upload notebooks and slides to it.';
    host.appendChild(hint);
  }

  COURSE.weeks.forEach(w => host.appendChild(weekAdmin(w, app, repaint)));

  const addBtn = button('+ Add week', 'secondary');
  addBtn.style.alignSelf = 'flex-start';
  addBtn.addEventListener('click', () => {
    const w: ICourseWeek = {
      week: COURSE.weeks.length + 1,
      theme: 'New week',
      topics: ['To be planned'],
      slides: { pdf: '', label: 'No slides yet' },
      notebookIds: []
    };
    COURSE.weeks.push(w);
    renumberWeeks(COURSE);
    tEditWeek.add(w.week); // open the new week for editing right away
    repaint();
  });
  host.appendChild(addBtn);
}

/** True when a week has slides attached (uploaded locally or online). */
function slidesReady(w: ICourseWeek): boolean {
  return !!w.slides.pdf || /online|uploaded/i.test(w.slides.label);
}

/** Upload-styled label button with a hidden file input. */
function uploadButton(
  labelHtml: string,
  accept: string,
  onFile: (file: File) => void
): HTMLElement {
  const label = document.createElement('label');
  label.style.cssText =
    'display:inline-flex;align-items:center;gap:6px;height:var(--control-sm);box-sizing:border-box;font-size:12px;font-weight:500;color:var(--text-secondary);cursor:pointer;white-space:nowrap;border:1px solid var(--border-default);border-radius:6px;padding:0 12px;transition:border-color var(--dur-fast) var(--ease-out),color var(--dur-fast) var(--ease-out)';
  label.innerHTML = labelHtml;
  label.addEventListener('mouseenter', () => {
    label.style.color = 'var(--text-primary)';
    label.style.borderColor = 'var(--border-strong)';
  });
  label.addEventListener('mouseleave', () => {
    label.style.color = 'var(--text-secondary)';
    label.style.borderColor = 'var(--border-default)';
  });
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = accept;
  input.style.display = 'none';
  input.addEventListener('change', () => {
    const f = input.files?.[0];
    if (f) onFile(f);
    input.value = '';
  });
  label.appendChild(input);
  return label;
}

function weekAdmin(
  w: ICourseWeek,
  app: NotebookMindApp,
  repaint: () => void
): HTMLElement {
  const COURSE = activeData();
  const box = document.createElement('div');
  box.style.cssText =
    'background:var(--bg-panel);border:1px solid var(--border-default);border-radius:10px;overflow:hidden';

  // ── Header: title · current badge · spacer · Edit · Delete ──
  const head = document.createElement('div');
  head.style.cssText =
    'display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid var(--border-subtle);flex-wrap:wrap';
  const t = document.createElement('span');
  t.style.cssText =
    'font-size:13px;font-weight:600;white-space:nowrap;color:var(--text-primary)';
  t.textContent = `Week ${w.week} — ${w.theme}`;
  head.appendChild(t);
  if (w.week === COURSE.currentWeek) head.appendChild(tag('Current', 'accent', true));
  const spacer = document.createElement('span');
  spacer.style.cssText = 'flex:1;min-width:12px';
  head.appendChild(spacer);

  const editBtn = button(tEditWeek.has(w.week) ? 'Close' : 'Edit', 'ghost');
  editBtn.style.height = 'var(--control-sm)';
  editBtn.style.fontSize = '12px';
  editBtn.addEventListener('click', () => {
    if (tEditWeek.has(w.week)) tEditWeek.delete(w.week);
    else tEditWeek.add(w.week);
    repaint();
  });
  head.appendChild(editBtn);

  let delArmed = false;
  const delBtn = button('Delete week', 'ghost');
  delBtn.style.height = 'var(--control-sm)';
  delBtn.style.fontSize = '12px';
  delBtn.style.color = 'var(--red-400)';
  delBtn.addEventListener('click', () => {
    if (!delArmed) {
      delArmed = true;
      delBtn.textContent = 'Confirm delete';
      delBtn.style.background = 'var(--red-bg)';
      return;
    }
    const idx = COURSE.weeks.findIndex(x => x.week === w.week);
    if (idx >= 0) COURSE.weeks.splice(idx, 1);
    tEditWeek.delete(w.week);
    renumberWeeks(COURSE);
    repaint();
  });
  head.appendChild(delBtn);
  box.appendChild(head);

  // Edit panel: theme + topics
  if (tEditWeek.has(w.week)) {
    box.appendChild(weekEditPanel(w, repaint));
  }

  const nbs = w.notebookIds.map(id => COURSE.notebooks[id]).filter(Boolean);
  const unlocked = nbs.filter(n => n.status !== 'locked').length;

  // ── Status + add row: slide status · notebook count · +Notebook · +Slides ──
  const bar = document.createElement('div');
  bar.style.cssText =
    'display:flex;align-items:center;gap:10px;flex-wrap:wrap;padding:10px 16px;border-bottom:1px solid var(--border-subtle)';

  const slideChip = document.createElement('span');
  const ready = slidesReady(w);
  slideChip.style.cssText =
    'display:inline-flex;align-items:center;gap:5px;font-size:11.5px;white-space:nowrap;color:' +
    (ready ? 'var(--green-400)' : 'var(--text-quaternary)');
  slideChip.innerHTML = ready
    ? '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>Slides: ' +
      w.slides.label.replace(/\s*\((online|uploaded)\)/i, '')
    : '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="13" rx="2"></rect><path d="M8 21h8"></path><path d="M12 16v5"></path></svg>No slides yet';
  bar.appendChild(slideChip);

  const dot = document.createElement('span');
  dot.style.cssText = 'color:var(--text-quaternary)';
  dot.textContent = '·';
  bar.appendChild(dot);

  const nbCount = document.createElement('span');
  nbCount.style.cssText =
    'font-size:11.5px;color:var(--text-quaternary);font-family:var(--font-mono);white-space:nowrap';
  nbCount.textContent = `${nbs.length} notebook${nbs.length === 1 ? '' : 's'} · ${unlocked} unlocked`;
  bar.appendChild(nbCount);

  const barSpacer = document.createElement('span');
  barSpacer.style.cssText = 'flex:1;min-width:8px';
  bar.appendChild(barSpacer);

  // + Notebook (upload .ipynb)
  const nbUpload = uploadButton(
    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>Notebook',
    '.ipynb',
    async file => {
      try {
        const doc = await parseUploadedNotebook(file);
        const id = `up-${Date.now()}`;
        COURSE.notebooks[id] = {
          id,
          title: file.name.replace(/\.ipynb$/i, ''),
          topic: 'Uploaded',
          blurb: `${doc.cells.length} cells`,
          week: w.week,
          status: 'available',
          path: undefined,
          deps: []
        };
        uploadedDocs.set(id, doc);
        w.notebookIds.push(id);
        // Analyse the notebook: for every code cell, generate a starter task
        // (rotating the type) so questions are ready to review/customise.
        const rotation: IAuthoredChallenge['type'][] = ['predict-mc', 'bugfix', 'fillblank'];
        doc.cells.forEach((src, i) => {
          setAuthoredChallenge(id, i, dummyAuthored(src, rotation[i % rotation.length]));
        });
        tExpand.set(id, true); // open its task editor straight away
        repaint();
        celebrate(`Analysed ${doc.cells.length} cells · tasks generated`);
      } catch {
        alert('That file could not be parsed as a notebook.');
      }
    }
  );
  bar.appendChild(nbUpload);

  // + Slides (upload PDF)
  const slideStatus = document.createElement('span');
  slideStatus.style.cssText =
    'font-size:11px;color:var(--text-quaternary);white-space:nowrap';
  const slideUpload = uploadButton(
    (ready
      ? '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>Replace slides'
      : '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>Slides'),
    '.pdf',
    async file => {
      // Upload to the DB when connected AND this course is backend-backed;
      // otherwise keep the slide reference local to the session.
      const cid = activeBackendCourseId();
      if (!isConnected() || !cid) {
        w.slides = { pdf: 'local', label: `${file.name} (uploaded)` };
        repaint();
        return;
      }
      slideStatus.textContent = 'Extracting…';
      try {
        const result = await extractPdfFull(file);
        await upsertCourseWeekSlides({
          courseId: cid,
          weekNumber: w.week,
          weekTheme: w.theme,
          topics: w.topics,
          title: `Week ${w.week} — ${file.name.replace(/\.pdf$/i, '')}`,
          sourceText: result.fullText,
          parts: result.pages.map((p, i) => ({
            index: i,
            title: `Page ${p.pageNumber}`,
            text: p.text,
            imageBase64: p.imageBase64,
            width: p.width,
            height: p.height
          }))
        });
        w.slides = { pdf: 'online', label: `${file.name} (online)` };
        repaint();
      } catch (err) {
        slideStatus.textContent = `Error: ${(err as Error).message}`;
        slideStatus.style.color = 'var(--red-400)';
      }
    }
  );
  bar.appendChild(slideUpload);
  bar.appendChild(slideStatus);
  box.appendChild(bar);

  // ── Notebook rows ──
  if (nbs.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText =
      'padding:12px 16px;font-size:12px;color:var(--text-quaternary)';
    empty.textContent = 'No notebooks yet — upload one with “+ Notebook”.';
    box.appendChild(empty);
  }
  nbs.forEach(nb => box.appendChild(nbAdminRow(nb, w, app, repaint)));
  return box;
}

/** Inline editor for a week's theme + topics. */
function weekEditPanel(w: ICourseWeek, repaint: () => void): HTMLElement {
  const panel = document.createElement('div');
  panel.style.cssText =
    'display:flex;flex-direction:column;gap:12px;padding:14px 16px;border-bottom:1px solid var(--border-subtle);background:var(--bg-base)';

  const themeInput = textInput(w.theme);
  const topicsInput = textInput(w.topics.join(', '));

  panel.appendChild(field('Week title', themeInput));
  const topicsWrap = field('Topics (comma-separated)', topicsInput);
  topicsWrap.style.marginBottom = '0';
  panel.appendChild(topicsWrap);

  const row = document.createElement('div');
  row.style.cssText = 'display:flex;gap:8px;align-items:center';
  const save = button('Save week', 'accent');
  save.style.height = 'var(--control-sm)';
  const cancel = button('Cancel', 'ghost');
  cancel.style.height = 'var(--control-sm)';
  save.addEventListener('click', () => {
    w.theme = themeInput.value.trim() || w.theme;
    w.topics = topicsInput.value
      .split(',')
      .map(t => t.trim())
      .filter(Boolean);
    if (w.topics.length === 0) {
      w.topics = ['To be planned'];
    }
    tEditWeek.delete(w.week);
    repaint();
  });
  cancel.addEventListener('click', () => {
    tEditWeek.delete(w.week);
    repaint();
  });
  row.appendChild(save);
  row.appendChild(cancel);
  panel.appendChild(row);
  return panel;
}

/** Load a notebook's cells — from an uploaded doc or the workspace path. */
async function loadCells(
  app: NotebookMindApp,
  nb: ReturnType<typeof activeData>['notebooks'][string]
): Promise<{ key: string; cells: string[] } | null> {
  const up = uploadedDocs.get(nb.id);
  if (up) {
    return { key: nb.id, cells: up.cells };
  }
  if (nb.path) {
    const doc = await loadNotebook(app.services.contents, nb.path, nb.title);
    return { key: basename(nb.path), cells: doc.cells };
  }
  return null;
}

/** One notebook row: status · title · state · Lock/Unlock · Tasks ▾ · Delete. */
function nbAdminRow(
  nb: ReturnType<typeof activeData>['notebooks'][string],
  w: ICourseWeek,
  app: NotebookMindApp,
  repaint: () => void
): HTMLElement {
  const COURSE = activeData();
  const locked = nb.status === 'locked';
  const sched = tSchedules.get(nb.id) ?? '';
  const wrap = document.createElement('div');
  wrap.style.cssText =
    'display:flex;flex-direction:column;border-top:1px solid var(--border-subtle)';

  const open = !!tExpand.get(nb.id);
  const row = document.createElement('div');
  row.style.cssText =
    'display:flex;align-items:center;gap:10px;padding:9px 16px;transition:background-color var(--dur-fast) var(--ease-out)';

  // Clickable left area (status · title · chevron) → open the practice tasks.
  const left = document.createElement('div');
  left.style.cssText =
    'display:flex;align-items:center;gap:9px;min-width:0;cursor:pointer;padding:5px 9px;margin:-5px -6px;border-radius:8px;transition:background-color var(--dur-fast) var(--ease-out)';
  left.title = 'Open practice tasks';
  left.appendChild(
    statusIcon(nb.status === 'done' ? 'done' : locked ? 'backlog' : 'started', 14)
  );
  const title = document.createElement('span');
  title.style.cssText =
    'font-size:12.5px;font-weight:600;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;transition:color var(--dur-fast) var(--ease-out);color:' +
    (open ? 'var(--accent-text)' : 'var(--text-primary)');
  title.textContent = nb.title;
  left.appendChild(title);
  const chev = document.createElement('span');
  chev.style.cssText =
    'flex:0 0 auto;display:inline-flex;transition:transform var(--dur-fast) var(--ease-out),color var(--dur-fast) var(--ease-out);color:' +
    (open ? 'var(--accent-text)' : 'var(--text-quaternary)') +
    (open ? ';transform:rotate(180deg)' : '');
  chev.innerHTML =
    '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>';
  left.appendChild(chev);
  left.addEventListener('mouseenter', () => {
    left.style.background = 'var(--accent-subtle-bg)';
    title.style.color = 'var(--accent-text)';
    chev.style.color = 'var(--accent-text)';
  });
  left.addEventListener('mouseleave', () => {
    left.style.background = 'transparent';
    if (!open) {
      title.style.color = 'var(--text-primary)';
      chev.style.color = 'var(--text-quaternary)';
    }
  });
  left.addEventListener('click', () => {
    tExpand.set(nb.id, !tExpand.get(nb.id));
    repaint();
  });
  row.appendChild(left);

  // Timed release — inline, right behind the title.
  const timeWrap = document.createElement('div');
  timeWrap.style.cssText =
    'display:flex;align-items:center;gap:4px;flex:0 0 auto;height:var(--control-sm);box-sizing:border-box;padding:0 4px 0 8px;border-radius:7px;border:1px solid ' +
    (sched ? 'rgba(94,106,210,0.4)' : 'var(--border-default)') +
    ';background:' + (sched ? 'var(--accent-subtle-bg)' : 'var(--bg-panel)');
  timeWrap.title = 'Timed release — locks the notebook until this time';
  timeWrap.innerHTML =
    `<span style="display:inline-flex;flex:0 0 auto;color:${sched ? 'var(--accent-text)' : 'var(--text-quaternary)'}"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"></circle><polyline points="12 7 12 12 15 14"></polyline></svg></span>`;
  const dt = document.createElement('input');
  dt.type = 'datetime-local';
  dt.value = sched;
  dt.style.cssText =
    `border:none;outline:none;background:transparent;font-family:var(--font-sans);font-size:11.5px;padding:0;max-width:152px;color:${sched ? 'var(--accent-text)' : 'var(--text-tertiary)'}`;
  dt.addEventListener('change', () => {
    if (dt.value) {
      tSchedules.set(nb.id, dt.value);
      nb.status = 'locked';
    } else {
      tSchedules.delete(nb.id);
    }
    repaint();
  });
  timeWrap.appendChild(dt);
  if (sched) {
    const clr = document.createElement('span');
    clr.style.cssText =
      'flex:0 0 auto;cursor:pointer;color:var(--accent-text);display:inline-flex;padding:2px;border-radius:4px';
    clr.title = 'Clear schedule';
    clr.innerHTML =
      '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
    clr.addEventListener('click', () => {
      tSchedules.delete(nb.id);
      repaint();
    });
    timeWrap.appendChild(clr);
  }
  row.appendChild(timeWrap);

  const spacer = document.createElement('span');
  spacer.style.cssText = 'flex:1;min-width:8px';
  row.appendChild(spacer);

  const stateLbl = document.createElement('span');
  stateLbl.style.cssText =
    'font-size:11.5px;font-weight:500;white-space:nowrap;flex:0 0 auto;color:' +
    (locked ? (sched ? 'var(--accent-text)' : 'var(--text-quaternary)') : 'var(--green-400)');
  stateLbl.textContent = locked ? (sched ? 'Scheduled' : 'Locked') : 'Unlocked';
  row.appendChild(stateLbl);

  const toggleBtn = button(locked ? 'Unlock' : 'Lock', 'secondary');
  toggleBtn.style.height = 'var(--control-sm)';
  toggleBtn.style.fontSize = '12px';
  toggleBtn.addEventListener('click', () => {
    nb.status = locked ? 'available' : 'locked';
    tSchedules.delete(nb.id);
    repaint();
  });
  row.appendChild(toggleBtn);

  let delArmed = false;
  const delBtn = button('Delete', 'ghost');
  delBtn.style.height = 'var(--control-sm)';
  delBtn.style.fontSize = '12px';
  delBtn.style.color = 'var(--red-400)';
  delBtn.addEventListener('click', () => {
    if (!delArmed) {
      delArmed = true;
      delBtn.textContent = 'Confirm';
      delBtn.style.background = 'var(--red-bg)';
      return;
    }
    w.notebookIds = w.notebookIds.filter(id => id !== nb.id);
    delete COURSE.notebooks[nb.id];
    uploadedDocs.delete(nb.id);
    tSchedules.delete(nb.id);
    tExpand.delete(nb.id);
    repaint();
  });
  row.appendChild(delBtn);
  wrap.appendChild(row);

  // ── Practice tasks panel (opened by clicking the notebook name) ──
  if (tExpand.get(nb.id)) {
    const panel = document.createElement('div');
    panel.style.cssText =
      'display:flex;flex-direction:column;gap:12px;padding:14px 16px 16px 42px;background:var(--bg-base)';

    const tasksHead = document.createElement('div');
    tasksHead.style.cssText = 'display:flex;align-items:center;gap:8px;flex-wrap:wrap';
    tasksHead.innerHTML =
      '<span style="font-size:12px;font-weight:600;color:var(--text-primary)">Practice tasks</span>' +
      '<span style="font-size:11.5px;color:var(--text-tertiary)">One per cell — change the type, edit the description and solution.</span>';
    panel.appendChild(tasksHead);

    const listHost = document.createElement('div');
    listHost.style.cssText = 'display:flex;flex-direction:column;gap:10px';
    listHost.appendChild(spinner('Loading notebook cells…'));
    panel.appendChild(listHost);

    void loadCells(app, nb)
      .then(res => {
        listHost.innerHTML = '';
        if (!res) {
          listHost.appendChild(
            infoBox(
              'This notebook has no editable source. Upload an .ipynb to author tasks per cell.',
              'info'
            )
          );
          return;
        }
        res.cells.forEach((src, i) =>
          listHost.appendChild(cellAuthor(res.key, i, src))
        );
      })
      .catch(() => {
        listHost.innerHTML = '';
        listHost.appendChild(
          infoBox(`Could not load ${nb.title} from the workspace.`, 'error')
        );
      });

    wrap.appendChild(panel);
  }

  return wrap;
}

function cellAuthor(key: string, i: number, source: string): HTMLElement {
  const c = document.createElement('div');
  c.style.cssText =
    'background:var(--surface-card);border:1px solid var(--border-default);border-radius:10px;overflow:hidden';
  const t = document.createElement('div');
  t.style.cssText =
    'display:flex;align-items:center;gap:10px;padding:11px 16px';
  const num = document.createElement('span');
  num.style.cssText =
    'font-size:11px;font-weight:600;color:var(--text-quaternary);font-family:var(--font-mono);flex:0 0 auto';
  num.textContent = String(i + 1).padStart(2, '0');
  const tl = document.createElement('span');
  tl.style.cssText =
    'font-size:13px;font-weight:600;flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--text-primary)';
  tl.textContent = cellTitle(key, source, i);
  const toggle = button('Author', 'ghost');
  toggle.style.height = 'var(--control-sm)';
  toggle.style.fontSize = '12px';
  t.appendChild(num);
  t.appendChild(tl);
  t.appendChild(toggle);
  c.appendChild(t);

  const formHost = document.createElement('div');
  formHost.style.display = 'none';
  c.appendChild(formHost);

  let built = false;
  toggle.addEventListener('click', () => {
    if (formHost.style.display === 'none') {
      if (!built) {
        formHost.appendChild(buildForm(key, i, source));
        built = true;
      }
      formHost.style.display = 'block';
      formHost.style.padding = '0 16px 14px';
      toggle.textContent = 'Hide';
    } else {
      formHost.style.display = 'none';
      toggle.textContent = 'Author';
    }
  });
  return c;
}

/** Built-in (no-AI) task generator so authoring works without an API key. */
function dummyAuthored(
  source: string,
  type: IAuthoredChallenge['type']
): IAuthoredChallenge {
  if (type === 'bugfix') {
    return {
      type,
      difficulty: 'medium',
      summary: 'This cell performs the computation shown in the code.',
      instructions:
        'Find and fix the one bug in the code below, then run the cell so it produces the correct output.',
      hints: ['Read each line carefully.', 'Check operators, signs and function names.'],
      presentedCode: source
    };
  }
  if (type === 'fillblank') {
    return {
      type,
      difficulty: 'medium',
      summary: 'This cell produces a specific result.',
      instructions:
        'Write the code for this cell from scratch so it runs and produces the expected output.',
      hints: ['Recreate the logic shown in the reference.', 'Check variable names and output format.']
    };
  }
  return {
    type: 'predict-mc',
    difficulty: 'easy',
    summary: 'This cell runs the code shown.',
    instructions: 'Read the code and pick the best description of what it does.',
    hints: [],
    options: [
      'It executes the code shown in the cell.',
      'It only defines variables without running anything.',
      'It imports libraries but does nothing else.',
      'It produces an error and stops.'
    ],
    answer: 'It executes the code shown in the cell.'
  };
}

function buildForm(key: string, i: number, source: string): HTMLElement {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'border-top:1px solid var(--border-subtle);padding-top:12px';

  // Prefill from the notebook's existing (generated / seeded) task, if any.
  const seed = demoChallenge(key, i, source);
  let type: IAuthoredChallenge['type'] =
    (seed?.type as IAuthoredChallenge['type']) ?? 'predict-mc';
  const typeRow = document.createElement('div');
  typeRow.style.cssText = 'display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap';
  const dynamic = document.createElement('div');

  const summary = textInput(seed?.summary ?? '');
  const instructions = textInput(seed?.instructions ?? '');
  const hint1 = textInput(seed?.hints?.[0] ?? '');
  const hint2 = textInput(seed?.hints?.[1] ?? '');
  summary.placeholder = 'What this cell does (short).';
  instructions.placeholder = 'What the learner must do.';
  hint1.placeholder = 'A gentle hint.';
  hint2.placeholder = 'A more direct hint.';

  // Teacher note for this cell — shown to students in the Explain tab.
  const teacherNote = textArea(
    getTeacherExplain(key, i) ?? demoCellMeta(key, i)?.teacher ?? '',
    3
  );
  teacherNote.placeholder =
    'Optional note for students on this cell — appears under “Teacher notes” in the Explain tab. Markdown supported.';
  // Prefill from the persisted note (survives reloads) when connected.
  const noteCid = activeBackendCourseId();
  if (isConnected() && noteCid) {
    void getCellComments(noteCid, key, i)
      .then(rows => {
        const saved = rows.find(r => r.role === 'teacher');
        if (saved && !teacherNote.value.trim()) {
          teacherNote.value = saved.body;
          setTeacherExplain(key, i, saved.body);
        }
      })
      .catch(() => null);
  }

  function buildDynamic(): void {
    dynamic.innerHTML = '';
    if (type === 'predict-mc') {
      const seedOpts = type === seed?.type ? seed?.options ?? [] : [];
      const seedAns = type === seed?.type ? seed?.answer : undefined;
      const opts: HTMLInputElement[] = [];
      let correct = Math.max(0, seedOpts.indexOf(seedAns ?? ''));
      for (let k = 0; k < 4; k++) {
        const rowEl = document.createElement('div');
        rowEl.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:6px';
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = `correct-${key}-${i}`;
        radio.checked = k === correct;
        radio.addEventListener('change', () => {
          correct = k;
        });
        const inp = textInput(seedOpts[k] ?? '');
        inp.placeholder = k === 0 ? 'Correct answer' : `Distractor ${k}`;
        opts.push(inp);
        rowEl.appendChild(radio);
        rowEl.appendChild(inp);
        dynamic.appendChild(rowEl);
      }
      dynamic.dataset.kind = 'mc';
      (dynamic as any)._read = (): Partial<IAuthoredChallenge> => ({
        options: opts.map(o => o.value),
        answer: opts[correct].value
      });
    } else if (type === 'bugfix') {
      const code = textArea(
        type === seed?.type ? seed?.presentedCode ?? source : source,
        7
      );
      code.style.fontFamily = 'var(--font-mono)';
      dynamic.appendChild(field('Buggy code (introduce one bug)', code));
      (dynamic as any)._read = (): Partial<IAuthoredChallenge> => ({
        presentedCode: code.value
      });
    } else {
      const note = document.createElement('div');
      note.style.cssText = 'font-size:12.5px;color:var(--text-tertiary);line-height:1.5';
      note.textContent =
        'Free text shows an empty editor; the learner writes the cell, checked against its real output.';
      dynamic.appendChild(note);
      (dynamic as any)._read = (): Partial<IAuthoredChallenge> => ({});
    }
  }

  (['predict-mc', 'bugfix', 'fillblank'] as IAuthoredChallenge['type'][]).forEach(
    tk => {
      const b = document.createElement('button');
      const label =
        tk === 'predict-mc'
          ? 'Multiple choice'
          : tk === 'bugfix'
          ? 'Find the bug'
          : 'Free text';
      b.textContent = label;
      const paint = (): void => {
        const on = type === tk;
        b.style.cssText = [
          'padding:5px 12px;border-radius:6px;font-size:12px;font-weight:500;cursor:pointer',
          'font-family:var(--font-sans);border:1px solid;transition:background-color var(--dur-fast) var(--ease-out),border-color var(--dur-fast) var(--ease-out)',
          on
            ? 'background:var(--accent-subtle-bg);color:var(--accent-text);border-color:transparent'
            : 'background:var(--bg-panel);color:var(--text-tertiary);border-color:var(--border-default)'
        ].join(';');
      };
      paint();
      b.addEventListener('click', () => {
        type = tk;
        Array.from(typeRow.children).forEach(ch => {
          // repaint all
          (ch as HTMLElement).dispatchEvent(new Event('repaint'));
        });
        buildDynamic();
        repaintTypeButtons();
      });
      b.addEventListener('repaint', paint);
      typeRow.appendChild(b);
    }
  );
  function repaintTypeButtons(): void {
    Array.from(typeRow.children).forEach(ch =>
      (ch as HTMLElement).dispatchEvent(new Event('repaint'))
    );
  }

  buildDynamic();

  const diffSel = document.createElement('select');
  diffSel.style.cssText =
    'font-family:var(--font-sans);font-size:13px;height:var(--control-md);box-sizing:border-box;padding:0 10px;border:1px solid var(--border-default);border-radius:var(--radius-control);background:var(--surface-input);color:var(--text-primary);outline:none';
  (['easy', 'medium', 'hard', 'impossible'] as Difficulty[]).forEach(d => {
    const o = document.createElement('option');
    o.value = d;
    o.textContent = d;
    if (d === (seed?.difficulty ?? 'medium')) {
      o.selected = true;
    }
    diffSel.appendChild(o);
  });

  const status = document.createElement('div');
  status.style.cssText = 'font-size:12px;color:var(--green-400);margin-top:8px;min-height:16px';

  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;gap:8px;margin-top:8px;flex-wrap:wrap';
  const saveBtn = button('Save task', 'accent');
  const aiBtn = button(isAiReady() ? '✨ Generate' : '✨ Generate demo', 'secondary');

  function compose(): IAuthoredChallenge {
    const extra = (dynamic as any)._read
      ? (dynamic as any)._read()
      : {};
    return {
      type,
      difficulty: diffSel.value as Difficulty,
      summary: summary.value,
      instructions: instructions.value,
      hints: [hint1.value, hint2.value].filter(Boolean),
      ...extra
    };
  }

  saveBtn.addEventListener('click', () => {
    setAuthoredChallenge(key, i, compose());
    const note = teacherNote.value.trim();
    setTeacherExplain(key, i, note);
    // Persist the note so it survives reloads and reaches students in Explain.
    const cid = activeBackendCourseId();
    if (isConnected() && cid) {
      void upsertTeacherNote(cid, key, i, note).catch(() => null);
    }
    status.textContent = '✓ Saved — task shows in Learn, note in the Explain tab.';
  });

  aiBtn.addEventListener('click', async () => {
    const origLabel = aiBtn.textContent;
    aiBtn.textContent = '✨ Generating…';
    aiBtn.disabled = true;
    status.textContent = '';
    try {
      let ch: IAuthoredChallenge;
      if (isAiReady()) {
        const g = await generateChallenge(source, type);
        ch = {
          type: g.type === 'predict-free' ? 'predict-mc' : g.type,
          difficulty: g.difficulty,
          summary: g.summary ?? '',
          instructions: g.instructions ?? '',
          hints: g.hints,
          presentedCode: g.presentedCode,
          options: g.options,
          answer: g.answer
        };
      } else {
        ch = dummyAuthored(source, type);
      }
      type = ch.type;
      summary.value = ch.summary;
      instructions.value = ch.instructions;
      hint1.value = ch.hints[0] ?? '';
      hint2.value = ch.hints[1] ?? '';
      diffSel.value = ch.difficulty;
      setAuthoredChallenge(key, i, ch);
      status.textContent = isAiReady()
        ? '✓ Task generated and saved.'
        : '✓ Demo task generated and saved.';
    } catch {
      const ch = dummyAuthored(source, type);
      summary.value = ch.summary;
      instructions.value = ch.instructions;
      setAuthoredChallenge(key, i, ch);
      status.textContent = '✓ Demo task generated and saved.';
    } finally {
      aiBtn.textContent = origLabel;
      aiBtn.disabled = false;
    }
  });

  actions.appendChild(saveBtn);
  actions.appendChild(aiBtn);

  wrap.appendChild(field('Challenge type', typeRow));
  wrap.appendChild(dynamic);
  wrap.appendChild(field('Difficulty', diffSel));
  wrap.appendChild(field('Summary', summary));
  wrap.appendChild(field('Instructions', instructions));
  wrap.appendChild(field('Hint 1', hint1));
  wrap.appendChild(field('Hint 2', hint2));
  wrap.appendChild(field('Teacher note · shown in the Explain tab', teacherNote));
  wrap.appendChild(actions);
  wrap.appendChild(status);
  return wrap;
}

