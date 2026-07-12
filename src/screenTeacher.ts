import { NotebookMindApp } from './nbApp';
import { ICourseWeek } from './courseData';
import { activeCourse, activeData } from './courseStore';
import {
  TEACHER_STUDENTS,
  CELL_PERF,
  SUBMISSIONS,
  insightsContext
} from './teacherData';
import { teacherInsights, teacherAsk, generateChallenge } from './gemini';
import { renderMarkdown } from './markdown';
import { loadNotebook } from './nbSource';
import {
  cellTitle,
  setAuthoredChallenge,
  IAuthoredChallenge
} from './demoData';
import { Difficulty } from './challenge';
import {
  button,
  infoBox,
  spinner,
  maxWidth,
  backLink,
  segmented,
  tag,
  statusIcon
} from './uiKit';
import { extractPdfFull } from './pdfExtract';
import { upsertCourseWeekSlides } from './supabaseDB';
import { isConnected } from './supabase';

const DEMO_COURSE_ID = '00000000-0000-0000-0000-000000000001';

type Tab = 'overview' | 'content' | 'tasks';

function basename(p: string): string {
  return p.split('/').pop() ?? p;
}

export function renderTeacher(host: HTMLElement, app: NotebookMindApp): void {
  const root = maxWidth(host, 1100);
  root.style.cssText +=
    ';display:flex;flex-direction:column;gap:18px;padding-bottom:64px';
  let tab: Tab = 'overview';

  // Header: back link · title + "Aggregates only" badge · segmented tabs
  const head = document.createElement('div');
  head.style.cssText = 'display:flex;flex-direction:column;gap:8px';
  head.appendChild(backLink('Back to Course', () => app.navigate('home')));
  const titleRow = document.createElement('div');
  titleRow.style.cssText = 'display:flex;align-items:center;gap:12px';
  const h1 = document.createElement('h1');
  h1.style.cssText =
    'margin:0;font-size:22px;font-weight:600;letter-spacing:-0.018em;color:var(--text-primary)';
  h1.textContent = 'Teacher dashboard';
  titleRow.appendChild(h1);
  titleRow.appendChild(tag('Aggregates only', 'success'));
  head.appendChild(titleRow);
  const courseLine = document.createElement('span');
  courseLine.style.cssText = 'font-size:13px;color:var(--text-tertiary)';
  const ucHead = activeCourse();
  courseLine.textContent = ucHead.isOwn
    ? `${ucHead.data.subject} · you teach this course · invite code ${ucHead.code}`
    : `${ucHead.data.subject} · ${ucHead.data.teacher}`;
  head.appendChild(courseLine);

  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'content', label: 'Weeks & content' },
    { id: 'tasks', label: 'Tasks' }
  ];
  const seg = segmented(tabs, tab, id => {
    tab = id as Tab;
    render();
  });
  seg.style.alignSelf = 'flex-start';
  head.appendChild(seg);
  root.appendChild(head);

  const body = document.createElement('div');
  root.appendChild(body);

  function render(): void {
    body.innerHTML = '';
    if (tab === 'overview') {
      renderOverview(body);
    } else if (tab === 'content') {
      renderContent(body);
    } else {
      renderTasks(body, app);
    }
  }
  render();
}

function field(labelText: string, el: HTMLElement): HTMLElement {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'margin-bottom:10px';
  const l = document.createElement('div');
  l.style.cssText =
    'font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.04em;color:var(--nm-fg-muted);margin-bottom:4px';
  l.textContent = labelText;
  wrap.appendChild(l);
  wrap.appendChild(el);
  return wrap;
}

function textInput(value = ''): HTMLInputElement {
  const i = document.createElement('input');
  i.type = 'text';
  i.value = value;
  i.style.cssText =
    'width:100%;box-sizing:border-box;font-family:var(--nm-font-sans);font-size:13px;padding:8px 10px;border:1px solid var(--nm-border);border-radius:var(--nm-radius);outline:none;color:var(--nm-fg)';
  return i;
}

function textArea(value = '', rows = 4): HTMLTextAreaElement {
  const t = document.createElement('textarea');
  t.value = value;
  t.rows = rows;
  t.style.cssText =
    'width:100%;box-sizing:border-box;resize:vertical;font-family:var(--nm-font-sans);font-size:13px;padding:8px 10px;border:1px solid var(--nm-border);border-radius:var(--nm-radius);outline:none;color:var(--nm-fg);line-height:1.5';
  return t;
}

// ── Overview ──────────────────────────────────────────────────────
function renderOverview(host: HTMLElement): void {
  host.style.cssText = 'display:flex;flex-direction:column;gap:14px';
  if (!activeCourse().isDemo) {
    const empty = document.createElement('div');
    empty.style.cssText =
      'display:flex;flex-direction:column;align-items:center;gap:10px;padding:40px 24px;background:var(--bg-panel);border:1px dashed var(--border-strong);border-radius:10px;text-align:center';
    empty.innerHTML =
      '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--text-quaternary)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"></path><circle cx="9" cy="7" r="4"></circle></svg>' +
      '<span style="font-size:13px;font-weight:600;color:var(--text-primary)">No student activity yet</span>' +
      '<span style="font-size:12.5px;color:var(--text-tertiary);line-height:1.55;max-width:400px">Aggregate analytics appear here once students join with your invite code and work through notebooks.</span>';
    host.appendChild(empty);
    return;
  }
  const avgFirst = Math.round(
    TEACHER_STUDENTS.reduce((s, r) => s + r.firstTryPct, 0) / TEACHER_STUDENTS.length
  );

  // KPI tiles (prototype: colored dot + caps label + 28px mono value + sub)
  const kpiTile = (
    value: string,
    label: string,
    sub: string,
    color = 'var(--text-primary)'
  ): HTMLElement => {
    const d = document.createElement('div');
    d.style.cssText =
      'background:var(--surface-card);border:1px solid var(--border-default);border-radius:10px;padding:15px 16px;display:flex;flex-direction:column;gap:9px';
    d.innerHTML =
      `<div style="display:flex;align-items:center;gap:7px"><span style="width:6px;height:6px;border-radius:50%;flex:0 0 auto;background:${color}"></span>` +
      `<span style="font-size:10.5px;color:var(--text-quaternary);text-transform:uppercase;letter-spacing:0.06em;font-weight:600;line-height:1.3">${label}</span></div>` +
      `<span style="font-size:28px;font-weight:600;font-family:var(--font-mono);letter-spacing:-0.02em;line-height:1;color:${color}">${value}</span>` +
      `<span style="font-size:11.5px;color:var(--text-tertiary);line-height:1.35">${sub}</span>`;
    return d;
  };
  const stats = document.createElement('div');
  stats.style.cssText =
    'display:grid;grid-template-columns:repeat(4,1fr);gap:12px';
  stats.appendChild(
    kpiTile(String(TEACHER_STUDENTS.length), 'Active students', 'worked in a notebook this week')
  );
  stats.appendChild(kpiTile(`${avgFirst}%`, 'Avg first-try rate', 'across all challenges'));
  stats.appendChild(
    kpiTile(String(SUBMISSIONS.length), 'Submissions this week', 'notebook runs completed')
  );
  stats.appendChild(
    kpiTile(
      String(CELL_PERF.filter(p => p.struggle >= 60).length),
      'High-struggle cells',
      'need your attention',
      'var(--yellow-500)'
    )
  );
  host.appendChild(stats);

  // Struggle (left, wide) + Topic mastery (right)
  const grid = document.createElement('div');
  grid.style.cssText =
    'display:grid;grid-template-columns:minmax(0,1.5fr) minmax(0,1fr);gap:12px;align-items:start';
  grid.appendChild(struggleCard());
  grid.appendChild(topicMastery());
  host.appendChild(grid);

  // AI insights — text + "Ask for improvements" input.
  const aiCard = document.createElement('div');
  aiCard.style.cssText =
    'background:var(--surface-card);border:1px solid var(--border-default);border-radius:10px;padding:18px 20px;display:flex;flex-direction:column;gap:12px';
  const aiHead = document.createElement('div');
  aiHead.style.cssText = 'display:flex;align-items:center;gap:8px';
  const aiTitle = document.createElement('span');
  aiTitle.style.cssText =
    'font-size:13.5px;font-weight:600;color:var(--text-primary)';
  aiTitle.textContent = 'AI insights';
  aiHead.appendChild(aiTitle);
  aiHead.appendChild(tag('Generated', 'accent'));
  aiCard.appendChild(aiHead);
  const insHost = document.createElement('div');
  insHost.style.cssText =
    'font-size:13px;line-height:1.65;color:var(--text-secondary)';
  insHost.appendChild(renderMarkdown(DUMMY_INSIGHTS));
  aiCard.appendChild(insHost);
  void teacherInsights(insightsContext())
    .then(text => {
      insHost.innerHTML = '';
      insHost.appendChild(renderMarkdown(text));
    })
    .catch(() => undefined);
  aiCard.appendChild(teacherChat());
  host.appendChild(aiCard);
}

/** Where students struggle — horizontal indigo bars (prototype). */
function struggleCard(): HTMLElement {
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
  const maxStruggle = Math.max(...CELL_PERF.map(p => p.struggle));
  [...CELL_PERF]
    .sort((a, b) => b.struggle - a.struggle)
    .forEach(p => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;flex-direction:column;gap:5px';
      row.title = `${p.cell} · Week ${p.week}\n${p.firstTryPct}% first-try · ${p.avgAttempts} avg tries\n${p.issue}`;
      const lblRow = document.createElement('div');
      lblRow.style.cssText = 'display:flex;align-items:baseline;gap:10px';
      lblRow.innerHTML =
        `<span style="flex:1;min-width:0;font-size:12px;color:var(--text-secondary);line-height:1.35;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.cell} · W${p.week}</span>` +
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
    'Struggle score = wrong first attempts + hint requests + reveals, per cell.';
  c.appendChild(hint);
  return c;
}

/** Topic mastery — "Going well" (green) vs "Needs review" (yellow) bars. */
function topicMastery(): HTMLElement {
  const c = document.createElement('div');
  c.style.cssText =
    'background:var(--surface-card);border:1px solid var(--border-default);border-radius:10px;padding:18px 20px;display:flex;flex-direction:column;gap:16px';
  c.innerHTML =
    '<span style="font-size:13.5px;font-weight:600;color:var(--text-primary)">Topic mastery</span>';

  const sorted = [...CELL_PERF].sort((a, b) => b.firstTryPct - a.firstTryPct);
  const strengths = sorted.slice(0, 3);
  const weaknesses = sorted.slice(-3).reverse();

  const makeList = (
    title: string,
    items: typeof strengths,
    color: string
  ): HTMLElement => {
    const col = document.createElement('div');
    col.style.cssText = 'display:flex;flex-direction:column;gap:11px';
    col.innerHTML = `<span style="font-size:11px;font-weight:600;color:${color};text-transform:uppercase;letter-spacing:0.05em">${title}</span>`;
    items.forEach(p => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;flex-direction:column;gap:5px';
      row.innerHTML =
        `<div style="display:flex;align-items:baseline;gap:10px"><span style="flex:1;min-width:0;font-size:12.5px;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${p.cell}</span>` +
        `<span style="flex:0 0 auto;font-size:11.5px;font-family:var(--font-mono);color:${color}">${p.firstTryPct}%</span></div>` +
        `<div style="height:6px;border-radius:3px;background:var(--gray-800);overflow:hidden"><div style="height:100%;border-radius:3px;background:${color === 'var(--green-400)' ? 'var(--green-500)' : 'var(--yellow-500)'};width:${Math.min(100, p.firstTryPct)}%"></div></div>`;
      col.appendChild(row);
    });
    return col;
  };

  c.appendChild(makeList('Going well', strengths, 'var(--green-400)'));
  const sep = document.createElement('div');
  sep.style.cssText = 'height:1px;background:var(--border-subtle)';
  c.appendChild(sep);
  c.appendChild(makeList('Needs review', weaknesses, 'var(--yellow-500)'));
  return c;
}

const DUMMY_INSIGHTS =
  '## Where students struggle\n\n- **Compare study groups** has the lowest first-try rate (38%). The named-aggregation syntax and *mean vs sum* trip students up — add a worked example to the Week 2 slides.\n- **Compute the exam score** (55%) — the sign of the sleep term causes errors. A short note on reading a formula before running would help.\n- **Correlation analysis** (47%) — `idxmax` vs `idxmin` is a recurring confusion.\n\n**Suggested action:** unlock a short review notebook on group-by and correlation before Week 4, and clarify the teacher note on aggregation.';

function teacherChat(): HTMLElement {
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
      const ans = await teacherAsk(q, insightsContext(), history.slice(0, -1));
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
const tExpand = new Map<string, boolean>();
const tSchedules = new Map<string, string>();
const tFiles = new Map<number, string[]>();

function renderContent(host: HTMLElement): void {
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
    renderContent(host);
  };

  // Current-week picker chips
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
      'width:28px;height:28px;display:flex;align-items:center;justify-content:center;border-radius:7px;font-size:12.5px;font-weight:600;cursor:pointer;font-family:var(--font-mono);' +
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

  COURSE.weeks.forEach(w => host.appendChild(weekAdmin(w, repaint)));

  const addBtn = button('+ Add week', 'secondary');
  addBtn.style.alignSelf = 'flex-start';
  addBtn.addEventListener('click', () => {
    const n = COURSE.weeks.length + 1;
    const w: ICourseWeek = {
      week: n,
      theme: 'New week',
      topics: ['To be planned'],
      slides: { pdf: '', label: 'No slides yet' },
      notebookIds: []
    };
    COURSE.weeks.push(w);
    repaint();
  });
  host.appendChild(addBtn);
}

function weekAdmin(w: ICourseWeek, repaint: () => void): HTMLElement {
  const COURSE = activeData();
  const box = document.createElement('div');
  box.style.cssText =
    'background:var(--bg-panel);border:1px solid var(--border-default);border-radius:10px;overflow:hidden';

  // Header: title · Current badge · unlocked count · Materials · slides button
  const head = document.createElement('div');
  head.style.cssText =
    'display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid var(--border-subtle);flex-wrap:wrap';
  const t = document.createElement('span');
  t.style.cssText =
    'font-size:13px;font-weight:600;white-space:nowrap;color:var(--text-primary)';
  t.textContent = `Week ${w.week} — ${w.theme}`;
  head.appendChild(t);
  if (w.week === COURSE.currentWeek) head.appendChild(tag('Current', 'accent', true));
  const nbs = w.notebookIds.map(id => COURSE.notebooks[id]).filter(Boolean);
  const unlocked = nbs.filter(n => n.status !== 'locked').length;
  const count = document.createElement('span');
  count.style.cssText =
    'font-size:11px;color:var(--text-quaternary);font-family:var(--font-mono);white-space:nowrap';
  count.textContent = `${unlocked} of ${nbs.length} unlocked`;
  head.appendChild(count);
  const spacer = document.createElement('span');
  spacer.style.cssText = 'flex:1;min-width:12px';
  head.appendChild(spacer);

  const actions = document.createElement('div');
  actions.style.cssText =
    'display:flex;align-items:center;gap:8px;flex-wrap:wrap';

  const slidesUploaded = !!w.slides.pdf || w.slides.label.includes('online');
  if (slidesUploaded) {
    const ok = document.createElement('span');
    ok.style.cssText =
      'display:inline-flex;align-items:center;gap:4px;font-size:11.5px;color:var(--green-400);white-space:nowrap';
    ok.innerHTML =
      '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>Slides uploaded';
    actions.appendChild(ok);
  }

  // Materials: label-styled multi-upload → name chips
  const matLabel = document.createElement('label');
  matLabel.style.cssText =
    'display:inline-flex;align-items:center;gap:6px;height:32px;box-sizing:border-box;font-size:12px;font-weight:500;color:var(--text-secondary);cursor:pointer;white-space:nowrap;border:1px solid var(--border-default);border-radius:6px;padding:0 12px;transition:border-color var(--dur-fast) var(--ease-out)';
  matLabel.innerHTML =
    '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>Materials';
  matLabel.addEventListener('mouseenter', () => {
    matLabel.style.color = 'var(--text-primary)';
    matLabel.style.borderColor = 'var(--border-strong)';
  });
  matLabel.addEventListener('mouseleave', () => {
    matLabel.style.color = 'var(--text-secondary)';
    matLabel.style.borderColor = 'var(--border-default)';
  });
  const matInput = document.createElement('input');
  matInput.type = 'file';
  matInput.multiple = true;
  matInput.style.display = 'none';
  matInput.addEventListener('change', () => {
    const names = Array.from(matInput.files ?? []).map(f => f.name);
    if (!names.length) return;
    tFiles.set(w.week, [...(tFiles.get(w.week) ?? []), ...names]);
    matInput.value = '';
    repaint();
  });
  matLabel.appendChild(matInput);
  actions.appendChild(matLabel);

  // Slides upload (functional: PDF → Supabase when connected)
  const slideStatus = document.createElement('span');
  slideStatus.style.cssText =
    'font-size:11.5px;color:var(--text-quaternary);white-space:nowrap';
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.pdf';
  fileInput.style.display = 'none';
  const uploadBtn = button(slidesUploaded ? 'Replace slides' : 'Upload slides', 'secondary');
  uploadBtn.addEventListener('click', () => {
    if (!isConnected()) {
      slideStatus.textContent = 'Connect Supabase to upload slides.';
      slideStatus.style.color = 'var(--yellow-500)';
      return;
    }
    fileInput.click();
  });
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    uploadBtn.style.pointerEvents = 'none';
    slideStatus.textContent = 'Extracting PDF…';
    slideStatus.style.color = 'var(--text-quaternary)';
    try {
      const result = await extractPdfFull(file);
      slideStatus.textContent = `Uploading ${result.pages.length} pages…`;
      await upsertCourseWeekSlides({
        courseId: DEMO_COURSE_ID,
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
      w.slides.label = `Week ${w.week} slides (online)`;
      repaint();
    } catch (err) {
      slideStatus.textContent = `Error: ${(err as Error).message}`;
      slideStatus.style.color = 'var(--red-400)';
    } finally {
      uploadBtn.style.pointerEvents = '';
      fileInput.value = '';
    }
  });
  actions.appendChild(uploadBtn);
  actions.appendChild(fileInput);
  actions.appendChild(slideStatus);
  head.appendChild(actions);
  box.appendChild(head);

  // Materials chips
  const files = tFiles.get(w.week) ?? [];
  if (files.length > 0) {
    const chips = document.createElement('div');
    chips.style.cssText =
      'display:flex;gap:6px;flex-wrap:wrap;padding:10px 16px 4px';
    files.forEach(fn => {
      const chip = document.createElement('span');
      chip.style.cssText =
        'display:inline-flex;align-items:center;gap:5px;font-size:11.5px;color:var(--text-secondary);background:var(--bg-base);border:1px solid var(--border-subtle);border-radius:999px;padding:3px 10px';
      chip.innerHTML =
        '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>' +
        fn;
      chips.appendChild(chip);
    });
    box.appendChild(chips);
  }

  if (nbs.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText =
      'padding:12px 16px;font-size:12px;color:var(--text-quaternary)';
    empty.textContent = 'No notebooks yet — add them in the Tasks tab.';
    box.appendChild(empty);
  }

  nbs.forEach(nb => box.appendChild(nbAdminRow(nb, repaint)));
  return box;
}

/** One notebook row: status · title · sched pill · state · Lock/Unlock · expand. */
function nbAdminRow(
  nb: ReturnType<typeof activeData>['notebooks'][string],
  repaint: () => void
): HTMLElement {
  const locked = nb.status === 'locked';
  const sched = tSchedules.get(nb.id) ?? '';
  const wrap = document.createElement('div');
  wrap.style.cssText =
    'display:flex;flex-direction:column;border-top:1px solid var(--border-subtle)';

  const row = document.createElement('div');
  row.style.cssText =
    'display:flex;align-items:center;gap:12px;padding:9px 16px;cursor:pointer;transition:background-color var(--dur-fast) var(--ease-out)';
  row.addEventListener('mouseenter', () => {
    row.style.background = 'rgba(0,0,0,0.025)';
  });
  row.addEventListener('mouseleave', () => {
    row.style.background = 'transparent';
  });
  row.appendChild(
    statusIcon(nb.status === 'done' ? 'done' : locked ? 'backlog' : 'started', 14)
  );
  const title = document.createElement('span');
  title.style.cssText =
    'font-size:12.5px;font-weight:500;flex:1;min-width:0;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--text-primary)';
  title.textContent = nb.title;
  row.appendChild(title);

  if (sched) {
    const pill = document.createElement('span');
    pill.style.cssText =
      'font-size:11px;font-weight:500;color:var(--accent-text);background:var(--accent-subtle-bg);border-radius:999px;padding:2px 9px;white-space:nowrap';
    pill.textContent = `Releases ${new Date(sched).toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })}`;
    row.appendChild(pill);
  }

  const stateLbl = document.createElement('span');
  stateLbl.style.cssText =
    'font-size:11.5px;font-weight:500;white-space:nowrap;color:' +
    (locked
      ? sched
        ? 'var(--accent-text)'
        : 'var(--text-quaternary)'
      : 'var(--green-400)');
  stateLbl.textContent = locked ? (sched ? 'Scheduled' : 'Locked') : 'Unlocked';
  row.appendChild(stateLbl);

  const toggleBtn = button(locked ? 'Unlock now' : 'Lock', 'secondary');
  toggleBtn.style.height = 'var(--control-sm)';
  toggleBtn.style.fontSize = '12px';
  toggleBtn.addEventListener('click', e => {
    e.stopPropagation();
    nb.status = locked ? 'available' : 'locked';
    if (!locked) tSchedules.delete(nb.id);
    else tSchedules.delete(nb.id);
    repaint();
  });
  row.appendChild(toggleBtn);

  const chev = document.createElement('span');
  chev.style.cssText =
    'font-size:10px;color:var(--text-quaternary);width:12px;text-align:center';
  chev.textContent = tExpand.get(nb.id) ? '▴' : '▾';
  row.appendChild(chev);

  row.addEventListener('click', () => {
    tExpand.set(nb.id, !tExpand.get(nb.id));
    repaint();
  });
  wrap.appendChild(row);

  // Expanded: timed release
  if (tExpand.get(nb.id)) {
    const panel = document.createElement('div');
    panel.style.cssText =
      'display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:2px 16px 14px 42px';
    const capsLbl = document.createElement('span');
    capsLbl.style.cssText =
      'font-size:10.5px;font-weight:600;text-transform:uppercase;letter-spacing:0.06em;color:var(--text-quaternary)';
    capsLbl.textContent = 'Timed release';
    panel.appendChild(capsLbl);
    const dt = document.createElement('input');
    dt.type = 'datetime-local';
    dt.value = sched;
    dt.style.cssText =
      'background:var(--bg-panel);color:var(--text-primary);border:1px solid var(--border-default);border-radius:6px;padding:5px 8px;font-size:12px;font-family:var(--font-sans);outline:none';
    dt.addEventListener('change', () => {
      if (dt.value) {
        tSchedules.set(nb.id, dt.value);
        nb.status = 'locked';
      } else {
        tSchedules.delete(nb.id);
      }
      repaint();
    });
    panel.appendChild(dt);
    if (sched) {
      const clear = document.createElement('span');
      clear.style.cssText =
        'font-size:11.5px;color:var(--text-quaternary);cursor:pointer';
      clear.textContent = 'Clear';
      clear.addEventListener('mouseenter', () => (clear.style.color = 'var(--red-400)'));
      clear.addEventListener('mouseleave', () => (clear.style.color = 'var(--text-quaternary)'));
      clear.addEventListener('click', () => {
        tSchedules.delete(nb.id);
        repaint();
      });
      panel.appendChild(clear);
    }
    const hint = document.createElement('span');
    hint.style.cssText = 'font-size:11px;color:var(--text-quaternary)';
    hint.textContent =
      'Locks the notebook until the chosen time, then releases it automatically.';
    panel.appendChild(hint);
    wrap.appendChild(panel);
  }

  return wrap;
}

// ── Tasks authoring ───────────────────────────────────────────────
function renderTasks(host: HTMLElement, app: NotebookMindApp): void {
  const COURSE = activeData();
  host.style.cssText = 'display:flex;flex-direction:column;gap:10px';
  const openable = Object.values(COURSE.notebooks).filter(n => n.path);

  // Notebook picker row (prototype)
  const picker = document.createElement('div');
  picker.style.cssText =
    'display:flex;align-items:center;gap:10px;flex-wrap:wrap';
  const pickLbl = document.createElement('span');
  pickLbl.style.cssText =
    'font-size:13px;font-weight:500;color:var(--text-secondary)';
  pickLbl.textContent = 'Notebook';
  picker.appendChild(pickLbl);
  const sel = document.createElement('select');
  sel.style.cssText =
    'height:38px;box-sizing:border-box;background:var(--bg-base);color:var(--text-primary);border:1px solid var(--border-strong);border-radius:7px;padding:0 32px 0 12px;font-size:13px;font-family:var(--font-sans);line-height:1.2;outline:none';
  openable.forEach(n => {
    const o = document.createElement('option');
    o.value = n.path as string;
    o.textContent = `Week ${n.week} · ${n.title}`;
    sel.appendChild(o);
  });
  picker.appendChild(sel);
  const editing = document.createElement('span');
  editing.style.cssText = 'font-size:12px;color:var(--text-quaternary)';
  picker.appendChild(editing);
  host.appendChild(picker);

  const listHost = document.createElement('div');
  listHost.style.cssText = 'display:flex;flex-direction:column;gap:10px';
  host.appendChild(listHost);

  function load(path: string, title: string): void {
    editing.textContent = `Author or AI-generate the challenge students practice on each cell — editing ${basename(path)}.`;
    listHost.innerHTML = '';
    listHost.appendChild(spinner('Loading notebook cells…'));
    void loadNotebook(app.services.contents, path, title)
      .then(doc => {
        listHost.innerHTML = '';
        const key = basename(path);
        doc.cells.forEach((src, i) =>
          listHost.appendChild(cellAuthor(key, i, src))
        );
      })
      .catch(() => {
        listHost.innerHTML = '';
        listHost.appendChild(
          infoBox(`Could not load ${basename(path)} from the workspace.`, 'error')
        );
      });
  }

  sel.addEventListener('change', () => {
    const nb = openable.find(n => n.path === sel.value);
    if (nb) {
      load(nb.path as string, nb.title);
    }
  });

  if (openable.length > 0) {
    const first = openable[0];
    load(first.path as string, first.title);
  } else {
    listHost.appendChild(infoBox('No openable notebooks in this course.', 'info'));
  }
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
  toggle.style.height = 'var(--control-md)';
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

function buildForm(key: string, i: number, source: string): HTMLElement {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'border-top:1px solid var(--nm-border-subtle);padding-top:12px';

  let type: IAuthoredChallenge['type'] = 'predict-mc';
  const typeRow = document.createElement('div');
  typeRow.style.cssText = 'display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap';
  const dynamic = document.createElement('div');

  const summary = textInput('What this cell does (short).');
  const instructions = textInput('What the learner must do.');
  const hint1 = textInput('A gentle hint.');
  const hint2 = textInput('A more direct hint.');

  function buildDynamic(): void {
    dynamic.innerHTML = '';
    if (type === 'predict-mc') {
      const opts: HTMLInputElement[] = [];
      let correct = 0;
      for (let k = 0; k < 4; k++) {
        const rowEl = document.createElement('div');
        rowEl.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:6px';
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = `correct-${i}`;
        if (k === 0) {
          radio.checked = true;
        }
        radio.addEventListener('change', () => {
          correct = k;
        });
        const inp = textInput(k === 0 ? 'Correct answer' : `Distractor ${k}`);
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
      const code = textArea(source, 7);
      code.style.fontFamily = 'var(--nm-font-mono)';
      dynamic.appendChild(field('Buggy code (introduce one bug)', code));
      (dynamic as any)._read = (): Partial<IAuthoredChallenge> => ({
        presentedCode: code.value
      });
    } else {
      const note = document.createElement('div');
      note.style.cssText = 'font-size:12.5px;color:var(--nm-fg-muted)';
      note.textContent =
        'Fill-in shows an empty editor; the learner writes the cell, checked against its real output.';
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
          : 'Fill in the cell';
      b.textContent = label;
      const paint = (): void => {
        const on = type === tk;
        b.style.cssText = [
          'padding:6px 12px;border-radius:var(--nm-radius);font-size:12px;font-weight:600;cursor:pointer',
          'font-family:var(--nm-font-sans);border:1px solid',
          on
            ? 'background:var(--nm-accent);color:#fff;border-color:var(--nm-accent)'
            : 'background:#fff;color:var(--nm-fg-muted);border-color:var(--nm-border)'
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
    'font-family:var(--nm-font-sans);font-size:13px;padding:8px 10px;border:1px solid var(--nm-border);border-radius:var(--nm-radius);background:#fff;color:var(--nm-fg)';
  (['easy', 'medium', 'hard', 'impossible'] as Difficulty[]).forEach(d => {
    const o = document.createElement('option');
    o.value = d;
    o.textContent = d;
    if (d === 'medium') {
      o.selected = true;
    }
    diffSel.appendChild(o);
  });

  const status = document.createElement('div');
  status.style.cssText = 'font-size:12px;color:var(--nm-success-text);margin-top:8px;min-height:16px';

  const actions = document.createElement('div');
  actions.style.cssText = 'display:flex;gap:8px;margin-top:8px;flex-wrap:wrap';
  const saveBtn = button('Save task', 'accent');
  const aiBtn = button('✨ AI generate', 'secondary');

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
    status.textContent = '✓ Saved — students will see this task in Learn mode.';
  });

  aiBtn.addEventListener('click', async () => {
    aiBtn.textContent = '✨ Generating…';
    aiBtn.disabled = true;
    status.textContent = '';
    try {
      const ch = await generateChallenge(source, type);
      summary.value = ch.summary ?? summary.value;
      instructions.value = ch.instructions ?? instructions.value;
      if (ch.hints[0]) {
        hint1.value = ch.hints[0];
      }
      if (ch.hints[1]) {
        hint2.value = ch.hints[1];
      }
      diffSel.value = ch.difficulty;
      setAuthoredChallenge(key, i, {
        type: ch.type === 'predict-free' ? 'predict-mc' : ch.type,
        difficulty: ch.difficulty,
        summary: ch.summary ?? '',
        instructions: ch.instructions ?? '',
        hints: ch.hints,
        presentedCode: ch.presentedCode,
        options: ch.options,
        answer: ch.answer
      });
      status.textContent = '✓ AI task generated and saved.';
    } catch {
      status.textContent = '';
      wrap.appendChild(infoBox('AI generation failed.', 'error'));
    } finally {
      aiBtn.textContent = '✨ AI generate';
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
  wrap.appendChild(actions);
  wrap.appendChild(status);
  return wrap;
}

