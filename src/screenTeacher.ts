import { NotebookMindApp } from './nbApp';
import { COURSE, STATUS_META, NbStatus, ICourseWeek } from './courseData';
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
import { button, infoBox, spinner, avatar, maxWidth } from './uiKit';
import { extractPdfFull } from './pdfExtract';
import { upsertCourseWeekSlides } from './supabaseDB';
import { isConnected } from './supabase';

const DEMO_COURSE_ID = '00000000-0000-0000-0000-000000000001';

type Tab = 'overview' | 'content' | 'tasks' | 'submissions';

function basename(p: string): string {
  return p.split('/').pop() ?? p;
}

export function renderTeacher(host: HTMLElement, app: NotebookMindApp): void {
  const root = maxWidth(host);
  let tab: Tab = 'overview';

  // ── Header ────────────────────────────────────────────────────
  const head = document.createElement('div');
  head.style.cssText =
    'display:flex;justify-content:space-between;align-items:flex-start;gap:12px;margin-bottom:6px';
  const left = document.createElement('div');
  const title = document.createElement('div');
  title.style.cssText =
    'font-size:24px;font-weight:700;letter-spacing:-0.02em;color:var(--nm-fg-strong)';
  title.textContent = '👩‍🏫 Teacher dashboard';
  const subj = document.createElement('div');
  subj.style.cssText = 'font-size:13px;color:var(--nm-fg-muted);margin-top:4px';
  subj.textContent = `${COURSE.subject} · ${COURSE.teacher}`;
  left.appendChild(title);
  left.appendChild(subj);
  const exit = button('Exit', 'ghost');
  exit.addEventListener('click', () => app.navigate('home'));
  head.appendChild(left);
  head.appendChild(exit);
  root.appendChild(head);

  // ── Tabs ──────────────────────────────────────────────────────
  const tabs: { id: Tab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'content', label: 'Weeks & content' },
    { id: 'tasks', label: 'Tasks' },
    { id: 'submissions', label: 'Submissions' }
  ];
  const tabBar = document.createElement('div');
  tabBar.style.cssText =
    'display:flex;gap:4px;border-bottom:1px solid var(--nm-border);margin:14px 0 20px;flex-wrap:wrap';
  const body = document.createElement('div');

  function paintTabs(): void {
    tabBar.innerHTML = '';
    tabs.forEach(t => {
      const b = document.createElement('button');
      b.textContent = t.label;
      const on = tab === t.id;
      b.style.cssText = [
        'padding:9px 13px;border:none;background:transparent;cursor:pointer',
        'font-size:13px;font-weight:600;font-family:var(--nm-font-sans)',
        `color:${on ? 'var(--nm-fg-strong)' : 'var(--nm-fg-muted)'}`,
        `border-bottom:2px solid ${on ? 'var(--nm-fg-strong)' : 'transparent'};margin-bottom:-1px`
      ].join(';');
      b.addEventListener('click', () => {
        tab = t.id;
        render();
      });
      tabBar.appendChild(b);
    });
  }

  function render(): void {
    paintTabs();
    body.innerHTML = '';
    if (tab === 'overview') {
      renderOverview(body);
    } else if (tab === 'content') {
      renderContent(body);
    } else if (tab === 'tasks') {
      renderTasks(body, app);
    } else {
      renderSubmissions(body);
    }
  }

  root.appendChild(tabBar);
  root.appendChild(body);
  render();
}

// ── Shared bits ───────────────────────────────────────────────────
function statCard(value: string, label: string): HTMLElement {
  const c = document.createElement('div');
  c.style.cssText =
    'background:var(--nm-bg-elev-1);border:1px solid var(--nm-border);border-radius:var(--nm-radius-lg);padding:16px 18px;box-shadow:var(--nm-shadow-xs)';
  const v = document.createElement('div');
  v.style.cssText = 'font-size:28px;font-weight:800;color:var(--nm-fg-strong);line-height:1';
  v.textContent = value;
  const l = document.createElement('div');
  l.style.cssText = 'font-size:12.5px;color:var(--nm-fg-muted);margin-top:6px;font-weight:600';
  l.textContent = label;
  c.appendChild(v);
  c.appendChild(l);
  return c;
}

function card(): HTMLElement {
  const el = document.createElement('div');
  el.style.cssText =
    'background:var(--nm-bg-elev-1);border:1px solid var(--nm-border);border-radius:var(--nm-radius-lg);padding:16px 18px;box-shadow:var(--nm-shadow-xs);margin-bottom:14px';
  return el;
}

function sectionTitle(text: string): HTMLElement {
  const el = document.createElement('div');
  el.style.cssText =
    'font-size:13px;font-weight:700;color:var(--nm-fg-muted);text-transform:uppercase;letter-spacing:0.04em;font-family:var(--nm-font-mono);margin:6px 0 12px';
  el.textContent = text;
  return el;
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
  const avgFirst = Math.round(
    TEACHER_STUDENTS.reduce((s, r) => s + r.firstTryPct, 0) / TEACHER_STUDENTS.length
  );
  const stats = document.createElement('div');
  stats.style.cssText =
    'display:grid;grid-template-columns:repeat(4,1fr);gap:14px;margin-bottom:22px';
  stats.appendChild(statCard(String(TEACHER_STUDENTS.length), 'Active students'));
  stats.appendChild(statCard(`${avgFirst}%`, 'Avg first-try'));
  stats.appendChild(statCard(String(SUBMISSIONS.length), 'Recent submissions'));
  stats.appendChild(
    statCard(
      String(CELL_PERF.filter(p => p.struggle >= 60).length),
      'High-struggle cells'
    )
  );
  host.appendChild(stats);

  // Where students struggle — short, wide vertical bars with hover details.
  const struggleCard = card();
  struggleCard.appendChild(sectionTitle('Where students struggle'));
  struggleCard.appendChild(struggleChart());
  host.appendChild(struggleCard);

  // AI insights — shown immediately (upgraded by AI if available) + a chat.
  const aiCard = card();
  aiCard.appendChild(sectionTitle('AI insights'));
  const insHost = document.createElement('div');
  insHost.appendChild(renderMarkdown(DUMMY_INSIGHTS));
  aiCard.appendChild(insHost);
  void teacherInsights(insightsContext())
    .then(text => {
      insHost.innerHTML = '';
      insHost.appendChild(renderMarkdown(text));
    })
    .catch(() => undefined);
  const chatTitle = document.createElement('div');
  chatTitle.style.cssText =
    'font-size:12px;font-weight:700;color:var(--nm-fg-muted);text-transform:uppercase;letter-spacing:0.04em;font-family:var(--nm-font-mono);margin:16px 0 8px';
  chatTitle.textContent = 'Ask for improvements';
  aiCard.appendChild(chatTitle);
  aiCard.appendChild(teacherChat());
  host.appendChild(aiCard);

  // Students
  const studentsCard = card();
  studentsCard.appendChild(sectionTitle('Students'));
  TEACHER_STUDENTS.forEach(s => {
    const row = document.createElement('div');
    row.style.cssText =
      'display:grid;grid-template-columns:32px 1fr 70px 90px 90px;gap:10px;align-items:center;padding:8px 0;border-bottom:1px solid var(--nm-border-subtle)';
    row.appendChild(avatar(s.name, 28));
    const name = document.createElement('div');
    name.style.cssText = 'font-size:13px;font-weight:600;color:var(--nm-fg)';
    name.textContent = s.name;
    row.appendChild(name);
    row.appendChild(miniMetric(`${s.xp}`, 'XP'));
    row.appendChild(miniMetric(`${s.firstTryPct}%`, '1st try'));
    const la = document.createElement('div');
    la.style.cssText = 'font-size:12px;color:var(--nm-fg-subtle);text-align:right';
    la.textContent = s.lastActive;
    row.appendChild(la);
    studentsCard.appendChild(row);
  });
  host.appendChild(studentsCard);
}

function miniMetric(value: string, label: string): HTMLElement {
  const d = document.createElement('div');
  d.style.cssText = 'text-align:right';
  d.innerHTML = `<div style="font-size:13px;font-weight:700;color:var(--nm-fg)">${value}</div><div style="font-size:10px;color:var(--nm-fg-subtle)">${label}</div>`;
  return d;
}

const DUMMY_INSIGHTS =
  '## Where students struggle\n\n- **Compare study groups** has the lowest first-try rate (38%). The named-aggregation syntax and *mean vs sum* trip students up — add a worked example to the Week 2 slides.\n- **Compute the exam score** (55%) — the sign of the sleep term causes errors. A short note on reading a formula before running would help.\n- **Correlation analysis** (47%) — `idxmax` vs `idxmin` is a recurring confusion.\n\n**Suggested action:** unlock a short review notebook on group-by and correlation before Week 4, and clarify the teacher note on aggregation.';

function lerpHex(a: string, b: string, t: number): string {
  const x = Math.max(0, Math.min(1, t));
  const pa = [1, 3, 5].map(i => parseInt(a.slice(i, i + 2), 16));
  const pb = [1, 3, 5].map(i => parseInt(b.slice(i, i + 2), 16));
  const c = pa.map((v, k) => Math.round(v + (pb[k] - v) * x));
  return `rgb(${c[0]},${c[1]},${c[2]})`;
}

function struggleChart(): HTMLElement {
  const maxH = 80; // short bars
  const wrap = document.createElement('div');
  const chart = document.createElement('div');
  chart.style.cssText = 'display:flex;align-items:flex-end;gap:12px;overflow-x:auto;padding:4px 2px 0';

  [...CELL_PERF]
    .sort((a, b) => a.week - b.week)
    .forEach(p => {
      // Continuous green → orange scale by struggle (app colours).
      const color = lerpHex('#1F8A5B', '#FE7030', p.struggle / 100);
      const col = document.createElement('div');
      col.style.cssText =
        'flex:1;min-width:62px;display:flex;flex-direction:column;align-items:center;cursor:default';
      col.title = `${p.cell} · Week ${p.week}\nStruggle ${p.struggle}/100\n${p.firstTryPct}% first-try · ${p.avgAttempts} avg tries\n⚠ ${p.issue}`;

      const val = document.createElement('div');
      val.style.cssText =
        'font-size:11px;font-weight:700;font-family:var(--nm-font-mono);color:var(--nm-fg-muted);margin-bottom:4px';
      val.textContent = String(p.struggle);

      const barWrap = document.createElement('div');
      barWrap.style.cssText = `height:${maxH}px;width:100%;display:flex;align-items:flex-end;justify-content:center`;
      const bar = document.createElement('div');
      const hgt = Math.max(6, Math.round((p.struggle / 100) * maxH));
      bar.style.cssText = `width:42px;max-width:70%;height:${hgt}px;background:${color};border-radius:6px 6px 0 0;transition:filter 160ms var(--nm-ease)`;
      barWrap.appendChild(bar);

      const lbl = document.createElement('div');
      lbl.style.cssText =
        'font-size:11px;color:var(--nm-fg-muted);margin-top:7px;text-align:center;line-height:1.25;max-width:78px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
      lbl.textContent = p.cell;
      const wk = document.createElement('div');
      wk.style.cssText =
        'font-size:10px;font-family:var(--nm-font-mono);color:var(--nm-fg-subtle)';
      wk.textContent = `W${p.week}`;

      col.addEventListener('mouseenter', () => {
        bar.style.filter = 'brightness(0.88)';
      });
      col.addEventListener('mouseleave', () => {
        bar.style.filter = 'none';
      });

      col.appendChild(val);
      col.appendChild(barWrap);
      col.appendChild(lbl);
      col.appendChild(wk);
      chart.appendChild(col);
    });

  const hint = document.createElement('div');
  hint.style.cssText =
    'font-size:11.5px;color:var(--nm-fg-subtle);margin-top:10px';
  hint.textContent =
    'Bar height & colour = struggle score (green = fine → orange = struggling). Hover for details.';
  wrap.appendChild(chart);
  wrap.appendChild(hint);
  return wrap;
}

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

// ── Weeks & content ───────────────────────────────────────────────
function renderContent(host: HTMLElement): void {
  const intro = infoBox(
    'Set the current week, lock or unlock notebooks, and add weeks. The student start screen updates from here.',
    'info'
  );
  intro.style.marginBottom = '16px';
  host.appendChild(intro);

  const top = card();
  const curWrap = document.createElement('div');
  curWrap.style.cssText = 'display:flex;align-items:center;gap:10px;flex-wrap:wrap';
  const lbl = document.createElement('div');
  lbl.style.cssText = 'font-size:13px;font-weight:600;color:var(--nm-fg)';
  lbl.textContent = 'Current week';
  const sel = document.createElement('select');
  sel.style.cssText =
    'font-family:var(--nm-font-sans);font-size:13px;padding:7px 10px;border:1px solid var(--nm-border);border-radius:var(--nm-radius);background:#fff;color:var(--nm-fg)';
  COURSE.weeks.forEach(w => {
    const o = document.createElement('option');
    o.value = String(w.week);
    o.textContent = `Week ${w.week} — ${w.theme}`;
    if (w.week === COURSE.currentWeek) {
      o.selected = true;
    }
    sel.appendChild(o);
  });
  sel.addEventListener('change', () => {
    COURSE.currentWeek = parseInt(sel.value, 10);
  });
  curWrap.appendChild(lbl);
  curWrap.appendChild(sel);
  top.appendChild(curWrap);
  host.appendChild(top);

  COURSE.weeks.forEach(w => host.appendChild(weekAdmin(w)));

  const addBtn = button('+ Add week', 'secondary');
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
    host.insertBefore(weekAdmin(w), addBtn);
  });
  host.appendChild(addBtn);
}

function weekAdmin(w: ICourseWeek): HTMLElement {
  const c = card();
  const t = document.createElement('div');
  t.style.cssText = 'font-size:14px;font-weight:700;color:var(--nm-fg-strong);margin-bottom:10px';
  t.textContent = `Week ${w.week} — ${w.theme}`;
  c.appendChild(t);

  if (w.notebookIds.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText = 'font-size:12.5px;color:var(--nm-fg-subtle)';
    empty.textContent = 'No notebooks yet.';
    c.appendChild(empty);
  }

  w.notebookIds.forEach(id => {
    const nb = COURSE.notebooks[id];
    if (!nb) {
      return;
    }
    const row = document.createElement('div');
    row.style.cssText =
      'display:flex;align-items:center;justify-content:space-between;gap:10px;padding:8px 0;border-bottom:1px solid var(--nm-border-subtle)';
    const name = document.createElement('div');
    name.style.cssText = 'font-size:13px;color:var(--nm-fg);font-weight:500';
    name.textContent = nb.title;
    const sel = document.createElement('select');
    sel.style.cssText =
      'font-family:var(--nm-font-sans);font-size:12px;padding:5px 8px;border:1px solid var(--nm-border);border-radius:var(--nm-radius);background:#fff;color:var(--nm-fg)';
    (['done', 'available', 'locked'] as NbStatus[]).forEach(st => {
      const o = document.createElement('option');
      o.value = st;
      o.textContent = STATUS_META[st].label;
      if (nb.status === st) {
        o.selected = true;
      }
      sel.appendChild(o);
    });
    sel.addEventListener('change', () => {
      nb.status = sel.value as NbStatus;
    });
    row.appendChild(name);
    row.appendChild(sel);
    c.appendChild(row);
  });

  // ── Upload slides to Supabase ──────────────────────────────
  const slideSection = document.createElement('div');
  slideSection.style.cssText = 'margin-top:14px;padding-top:12px;border-top:1px solid var(--nm-border-subtle)';
  const slideLabel = document.createElement('div');
  slideLabel.style.cssText = 'font-size:12px;font-weight:700;color:var(--nm-fg-muted);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.04em;font-family:var(--nm-font-mono)';
  slideLabel.textContent = '📄 Upload slides (PDF → Supabase)';
  slideSection.appendChild(slideLabel);

  const slideStatus = document.createElement('div');
  slideStatus.style.cssText = 'font-size:12px;color:var(--nm-fg-subtle);min-height:16px;margin-top:6px';

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.pdf';
  fileInput.style.display = 'none';

  const uploadBtn = button('Choose PDF…', 'secondary');
  uploadBtn.style.fontSize = '12px';
  uploadBtn.style.padding = '6px 12px';

  uploadBtn.addEventListener('click', () => {
    if (!isConnected()) {
      slideStatus.textContent = '⚠️ Log in first to upload slides to Supabase.';
      slideStatus.style.color = 'var(--nm-danger)';
      return;
    }
    fileInput.click();
  });

  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) {
      return;
    }
    uploadBtn.style.pointerEvents = 'none';
    slideStatus.textContent = '⏳ Extracting PDF…';
    slideStatus.style.color = 'var(--nm-fg-muted)';
    try {
      const result = await extractPdfFull(file);
      slideStatus.textContent = `⏳ Uploading ${result.pages.length} pages to Supabase…`;
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
      slideStatus.textContent = `✓ Uploaded — students will see this in the course home.`;
      slideStatus.style.color = 'var(--nm-success-text)';
      w.slides.label = `Week ${w.week} slides (online)`;
    } catch (err) {
      slideStatus.textContent = `Error: ${(err as Error).message}`;
      slideStatus.style.color = 'var(--nm-danger)';
    } finally {
      uploadBtn.style.pointerEvents = '';
      fileInput.value = '';
    }
  });

  slideSection.appendChild(uploadBtn);
  slideSection.appendChild(fileInput);
  slideSection.appendChild(slideStatus);
  c.appendChild(slideSection);

  return c;
}

// ── Tasks authoring ───────────────────────────────────────────────
function renderTasks(host: HTMLElement, app: NotebookMindApp): void {
  const intro = infoBox(
    'Pick a notebook, then author or AI-generate challenges per cell. Saved tasks replace the built-in ones in Learn mode.',
    'info'
  );
  intro.style.marginBottom = '16px';
  host.appendChild(intro);

  const openable = Object.values(COURSE.notebooks).filter(n => n.path);

  // Notebook picker — makes it clear which sheet is being edited.
  const picker = card();
  picker.appendChild(sectionTitle('Notebook to edit'));
  const sel = document.createElement('select');
  sel.style.cssText =
    'width:100%;box-sizing:border-box;font-family:var(--nm-font-sans);font-size:14px;padding:9px 11px;border:1px solid var(--nm-border);border-radius:var(--nm-radius);background:#fff;color:var(--nm-fg)';
  openable.forEach(n => {
    const o = document.createElement('option');
    o.value = n.path as string;
    o.textContent = `${n.title}  ·  ${basename(n.path as string)}  ·  Week ${n.week}`;
    sel.appendChild(o);
  });
  const editing = document.createElement('div');
  editing.style.cssText =
    'font-size:12.5px;color:var(--nm-fg-muted);margin-top:8px;font-weight:600';
  picker.appendChild(sel);
  picker.appendChild(editing);
  host.appendChild(picker);

  const listHost = document.createElement('div');
  host.appendChild(listHost);

  function load(path: string, title: string): void {
    editing.textContent = `Editing: ${title} (${basename(path)})`;
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
  const c = card();
  const t = document.createElement('div');
  t.style.cssText =
    'display:flex;justify-content:space-between;align-items:center;gap:10px;font-size:14px;font-weight:700;color:var(--nm-fg-strong);margin-bottom:8px';
  const tl = document.createElement('span');
  tl.textContent = `Cell ${i + 1} · ${cellTitle(key, source, i)}`;
  const toggle = button('Author task', 'secondary');
  toggle.style.padding = '6px 12px';
  toggle.style.fontSize = '12px';
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
      toggle.textContent = 'Hide';
    } else {
      formHost.style.display = 'none';
      toggle.textContent = 'Author task';
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

// ── Submissions ───────────────────────────────────────────────────
function renderSubmissions(host: HTMLElement): void {
  const c = card();
  c.appendChild(sectionTitle('Recent submissions'));
  const header = document.createElement('div');
  header.style.cssText =
    'display:grid;grid-template-columns:32px 1fr 1fr 90px 80px;gap:10px;padding:6px 0;font-size:11px;font-weight:700;color:var(--nm-fg-subtle);text-transform:uppercase;letter-spacing:0.04em;font-family:var(--nm-font-mono)';
  ['', 'Student', 'Notebook', 'When', 'XP'].forEach(htxt => {
    const d = document.createElement('div');
    d.textContent = htxt;
    header.appendChild(d);
  });
  c.appendChild(header);

  SUBMISSIONS.forEach(s => {
    const row = document.createElement('div');
    row.style.cssText =
      'display:grid;grid-template-columns:32px 1fr 1fr 90px 80px;gap:10px;align-items:center;padding:9px 0;border-bottom:1px solid var(--nm-border-subtle)';
    row.appendChild(avatar(s.student, 28));
    row.appendChild(cellText(s.student, true));
    row.appendChild(cellText(s.notebook, false));
    row.appendChild(cellText(s.when, false, 'var(--nm-fg-subtle)'));
    row.appendChild(cellText(`${s.xp} XP`, true));
    c.appendChild(row);
  });
  host.appendChild(c);
}

function cellText(text: string, strong: boolean, color?: string): HTMLElement {
  const d = document.createElement('div');
  d.style.cssText = `font-size:13px;color:${color ?? 'var(--nm-fg)'};font-weight:${strong ? 600 : 400};white-space:nowrap;overflow:hidden;text-overflow:ellipsis`;
  d.textContent = text;
  return d;
}
