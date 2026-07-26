import { NotebookMindApp } from './nbApp';
import { loadNotebook, parseUploadedNotebook, INbDoc } from './nbSource';
import { askStoragePreference } from './storageChoice';
import { localPut, localList } from './localStore';
import { savePersonalNotebook, listPersonalMaterials } from './supabaseDB';
import { isAiReady } from './gemini';
import { ICourseNotebook, ICourseWeek } from './courseData';
import { deckForPdf } from './slidesData';
import { deckToPages } from './screenLibrary';
import { isConnected } from './supabase';
import { getSupaWeekSlides } from './supabaseDB';
import { pointsEngine } from './points';
import {
  activeCourse,
  hasCourses,
  joinCourse,
  createOwnCourse,
  courseProgressOf,
  notebookDisplayStatus,
  isNotebookOpenable,
  getMyStats,
  getCourseDoc
} from './courseStore';
import {
  button,
  maxWidth,
  pageHeader,
  tag,
  statusIcon,
  progressRing,
  celebrate
} from './uiKit';

// Session-local: the AI-key warning can be dismissed like in the prototype.
let warnDismissed = false;

export function renderHome(host: HTMLElement, app: NotebookMindApp): void {
  const uc = activeCourse();
  const C = uc.data;

  const root = maxWidth(host, 860);
  root.style.cssText +=
    ';display:flex;flex-direction:column;gap:20px;padding-bottom:32px';

  // ── No courses at all (never joined, or left them all) ────────
  if (!hasCourses()) {
    root.appendChild(noCoursesState());
    return;
  }

  // ── Page header (course switching lives in the sidebar) ───────
  const headerActions: HTMLElement[] = [];
  if (uc.isOwn) {
    const teach = button('Teacher dashboard', 'secondary');
    teach.addEventListener('click', () => app.navigate('teacher'));
    headerActions.push(teach);
  }
  root.appendChild(
    pageHeader(C.subject, {
      subtitle: uc.isOwn
        ? `Taught by you · invite code ${uc.code}`
        : `Taught by ${C.teacher}`,
      actions: headerActions
    })
  );

  // ── AI-key warning (dismissible, demo course only) ────────────
  if (uc.isDemo && !isAiReady() && !warnDismissed) {
    root.appendChild(warnBanner());
  }

  // ── Empty course (freshly joined / created) ───────────────────
  if (C.weeks.length === 0) {
    root.appendChild(emptyCourseState());
    return;
  }

  root.appendChild(progressCard());

  const weeksWrap = document.createElement('div');
  weeksWrap.style.cssText = 'display:flex;flex-direction:column;gap:12px';
  C.weeks.forEach(w => weeksWrap.appendChild(weekBox(w)));
  root.appendChild(weeksWrap);

  root.appendChild(personalNotebooks());
  root.appendChild(uploadRow());

  // ───────────────────────────── helpers ─────────────────────────────

  /** Open a set of code cells as a Learn session (personal notebook). */
  function openCells(title: string, cells: string[]): void {
    if (cells.length === 0) {
      return;
    }
    const doc: INbDoc = { name: title, key: title, cells };
    app.doc = doc;
    app.explainAllowed = true;
    app.navigate('session');
  }

  /** "Your notebooks" — personal uploads persisted on device or in the account. */
  function personalNotebooks(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-direction:column;gap:8px';
    const list = document.createElement('div');
    list.style.cssText = 'display:flex;flex-direction:column;gap:8px';

    const row = (title: string, cells: string[], where: 'local' | 'web'): HTMLElement => {
      const r = document.createElement('div');
      r.style.cssText =
        'display:flex;align-items:center;gap:12px;padding:11px 16px;background:var(--surface-card);border:1px solid var(--border-default);border-radius:9px;cursor:pointer;transition:border-color var(--dur-fast) var(--ease-out)';
      r.addEventListener('mouseenter', () => (r.style.borderColor = 'var(--border-strong)'));
      r.addEventListener('mouseleave', () => (r.style.borderColor = 'var(--border-default)'));
      r.innerHTML =
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--accent-text)" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>' +
        `<span style="font-size:13px;font-weight:500;flex:1;color:var(--text-primary)">${title}</span>` +
        `<span style="font-size:10.5px;color:var(--text-quaternary);text-transform:uppercase;letter-spacing:0.05em">${
          where === 'web' ? 'Web' : 'On device'
        }</span>` +
        `<span style="font-size:11.5px;color:var(--text-quaternary)">${cells.length} cells</span>`;
      r.addEventListener('click', () => openCells(title, cells));
      return r;
    };

    const refresh = async (): Promise<void> => {
      list.innerHTML = '';
      const rows: HTMLElement[] = [];
      if (isConnected()) {
        const web = await listPersonalMaterials().catch(() => []);
        web
          .filter(m => m.docType === 'notebook')
          .forEach(m =>
            rows.push(
              row(
                m.title,
                (m.parts ?? []).map((p: any) => p.text ?? ''),
                'web'
              )
            )
          );
      }
      const local = await localList<{ title: string; cells: string[] }>(
        'notebooks'
      ).catch(() => []);
      local.forEach(u => rows.push(row(u.title, u.cells, 'local')));

      if (rows.length === 0) {
        wrap.style.display = 'none';
        return;
      }
      wrap.style.display = 'flex';
      const lbl = document.createElement('span');
      lbl.style.cssText =
        'font-size:13px;font-weight:600;color:var(--text-secondary)';
      lbl.textContent = 'Your notebooks';
      wrap.innerHTML = '';
      wrap.appendChild(lbl);
      rows.forEach(r => list.appendChild(r));
      wrap.appendChild(list);
    };
    wrap.style.display = 'none';
    void refresh();
    return wrap;
  }

  function noCoursesState(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.style.cssText =
      'display:flex;flex-direction:column;align-items:center;gap:14px;padding:64px 24px;text-align:center';
    wrap.innerHTML =
      '<div style="width:48px;height:48px;border-radius:12px;background:var(--accent-subtle-bg);display:flex;align-items:center;justify-content:center">' +
      '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--accent-text)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>' +
      '</div>' +
      '<span style="font-size:17px;font-weight:600;color:var(--text-primary)">You’re not in any course yet</span>' +
      '<span style="font-size:13px;color:var(--text-tertiary);line-height:1.55;max-width:420px">Join a course with an invite code (try DEMO2025 for the demo) — or create your own and become its admin.</span>';
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:8px;margin-top:4px';
    const join = button('Join a course', 'primary');
    join.addEventListener('click', () => openCourseModal(app, 'join'));
    const create = button('Create a course', 'secondary');
    create.addEventListener('click', () => openCourseModal(app, 'create'));
    row.appendChild(join);
    row.appendChild(create);
    wrap.appendChild(row);
    return wrap;
  }

  function warnBanner(): HTMLElement {
    const warn = document.createElement('div');
    warn.style.cssText =
      'display:flex;align-items:center;gap:10px;padding:10px 12px;border:1px solid rgba(178,125,32,0.30);background:var(--yellow-bg);border-radius:8px';
    warn.innerHTML =
      '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="var(--yellow-500)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" style="flex:0 0 auto"><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>' +
      '<span style="flex:1;font-size:13px;color:var(--text-secondary)">No AI key configured — explanations, quizzes and insights run on built-in demo output.</span>';
    const close = document.createElement('span');
    close.textContent = '✕';
    close.style.cssText =
      'cursor:pointer;color:var(--text-tertiary);font-size:14px;line-height:1;padding:2px 4px;border-radius:4px';
    close.addEventListener('mouseenter', () => {
      close.style.color = 'var(--text-primary)';
      close.style.background = 'rgba(0,0,0,0.045)';
    });
    close.addEventListener('mouseleave', () => {
      close.style.color = 'var(--text-tertiary)';
      close.style.background = 'transparent';
    });
    close.addEventListener('click', () => {
      warnDismissed = true;
      warn.remove();
    });
    warn.appendChild(close);
    return warn;
  }

  function emptyCourseState(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.style.cssText =
      'display:flex;flex-direction:column;align-items:center;gap:12px;padding:48px 24px;background:var(--bg-panel);border:1px dashed var(--border-strong);border-radius:10px;text-align:center';
    if (uc.isOwn) {
      wrap.innerHTML =
        '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text-quaternary)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"></path><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"></path></svg>' +
        '<span style="font-size:14px;font-weight:600;color:var(--text-primary)">Your course is ready — now add content</span>' +
        '<span style="font-size:12.5px;color:var(--text-tertiary);line-height:1.55;max-width:420px">Publish weeks and notebooks in the Teacher dashboard. Students join with your invite code:</span>' +
        `<span style="font-size:15px;font-weight:600;font-family:var(--font-mono);letter-spacing:0.08em;color:var(--accent-text);background:var(--accent-subtle-bg);border-radius:7px;padding:6px 14px">${uc.code}</span>`;
      const open = button('Open Teacher dashboard', 'primary');
      open.addEventListener('click', () => app.navigate('teacher'));
      wrap.appendChild(open);
    } else {
      wrap.innerHTML =
        '<svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text-quaternary)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><polyline points="12 6 12 12 16 14"></polyline></svg>' +
        '<span style="font-size:14px;font-weight:600;color:var(--text-primary)">Nothing here yet</span>' +
        '<span style="font-size:12.5px;color:var(--text-tertiary);line-height:1.55;max-width:420px">Your teacher hasn’t published any weeks for this course. Check back once the course starts.</span>';
    }
    return wrap;
  }

  function progressCard(): HTMLElement {
    const prog = courseProgressOf(C);
    const pct = prog.pct;
    const week = C.weeks[C.currentWeek - 1] ?? C.weeks[0];
    const doneNb = prog.done;
    const totalNb = prog.total;

    const cardEl = document.createElement('div');
    cardEl.style.cssText =
      'background:var(--surface-card);border:1px solid var(--border-default);border-radius:12px;overflow:hidden;box-shadow:0 1px 2px rgba(0,0,0,0.05)';

    const top = document.createElement('div');
    top.style.cssText = 'display:flex;align-items:stretch;flex-wrap:wrap';

    const ringSide = document.createElement('div');
    ringSide.style.cssText =
      'display:flex;align-items:center;gap:16px;padding:20px 24px;flex:1;min-width:240px';
    ringSide.appendChild(progressRing(pct, 56, 5));
    const ringText = document.createElement('div');
    ringText.style.cssText = 'display:flex;flex-direction:column;gap:3px';
    ringText.innerHTML =
      `<span style="font-size:22px;font-weight:600;letter-spacing:-0.02em;line-height:1;color:var(--text-primary)">${pct}<span style="font-size:15px;color:var(--text-tertiary)">%</span> <span style="font-size:14px;font-weight:500;color:var(--text-secondary)">complete</span></span>` +
      `<span style="font-size:12.5px;color:var(--text-tertiary)">${doneNb} of ${totalNb} notebooks done</span>`;
    ringSide.appendChild(ringText);
    top.appendChild(ringSide);

    const strip = document.createElement('div');
    strip.style.cssText =
      'display:flex;align-items:stretch;border-left:1px solid var(--border-subtle)';
    const stat = (value: string, label: string, accent = false, first = false) => {
      const d = document.createElement('div');
      d.style.cssText =
        'display:flex;flex-direction:column;gap:3px;justify-content:center;padding:16px 20px;min-width:96px' +
        (first ? '' : ';border-left:1px solid var(--border-subtle)');
      d.innerHTML =
        `<span style="font-size:19px;font-weight:600;font-family:var(--font-mono);letter-spacing:-0.01em;color:${accent ? 'var(--accent-text)' : 'var(--text-primary)'}">${value}</span>` +
        `<span style="font-size:10px;color:var(--text-quaternary);text-transform:uppercase;letter-spacing:0.06em;font-weight:600;white-space:nowrap">${label}</span>`;
      return d;
    };
    // Solved / first-try: persisted per-user totals when connected (survive a
    // reload), falling back to this session's counters in offline/demo mode.
    const st = getMyStats();
    const connected = isConnected();
    const solved = connected ? st.cellsAttempted : app.cellsAttempted;
    const firstTryBase = connected ? st.cellsFirstTry : app.cellsFirstTry;
    const firstTryPct = solved ? Math.round((firstTryBase / solved) * 100) : 0;
    strip.appendChild(stat(String(pointsEngine.total), 'Total XP', true, true));
    strip.appendChild(stat(String(solved), 'Solved'));
    strip.appendChild(stat(solved ? `${firstTryPct}%` : '0%', 'First try'));
    top.appendChild(strip);
    cardEl.appendChild(top);

    const band = document.createElement('div');
    band.style.cssText =
      'display:flex;flex-direction:column;gap:16px;padding:16px 24px 18px;border-top:1px solid var(--border-subtle);background:var(--bg-base)';

    const weekRow = document.createElement('div');
    weekRow.style.cssText =
      'display:flex;align-items:center;gap:8px;flex-wrap:wrap';
    weekRow.innerHTML =
      `<span style="display:inline-flex;align-items:center;gap:6px;font-size:11px;font-weight:600;color:var(--accent-text);text-transform:uppercase;letter-spacing:0.06em"><span style="width:6px;height:6px;border-radius:50%;background:var(--accent);box-shadow:0 0 6px var(--brand-glow)"></span>Week ${C.currentWeek}</span>` +
      `<span style="font-size:12.5px;font-weight:600;color:var(--text-primary)">${week.theme}</span>` +
      '<span style="flex:1"></span>';
    week.topics.forEach(t => {
      const pill = document.createElement('span');
      pill.style.cssText =
        'font-size:11px;padding:2px 9px;border-radius:999px;background:var(--accent-subtle-bg);color:var(--accent-text);font-weight:500';
      pill.textContent = t;
      weekRow.appendChild(pill);
    });
    band.appendChild(weekRow);

    const tlWrap = document.createElement('div');
    tlWrap.style.cssText = 'display:flex;flex-direction:column;gap:6px';
    const tl = document.createElement('div');
    tl.style.cssText = 'display:flex;gap:5px';
    C.weeks.forEach(w => {
      const past = w.week < C.currentWeek;
      const current = w.week === C.currentWeek;
      const seg = document.createElement('div');
      seg.style.cssText =
        'flex:1;height:5px;border-radius:3px;background:' +
        (past
          ? 'var(--brand-800)'
          : current
          ? 'var(--brand-500);box-shadow:0 0 8px var(--brand-glow)'
          : 'var(--gray-700)');
      seg.title = `Week ${w.week} — ${w.theme}`;
      tl.appendChild(seg);
    });
    const tlLabels = document.createElement('div');
    tlLabels.style.cssText = 'display:flex;justify-content:space-between';
    tlLabels.innerHTML =
      '<span style="font-size:10.5px;color:var(--text-quaternary);text-transform:uppercase;letter-spacing:0.06em">Week 1</span>' +
      `<span style="font-size:10.5px;color:var(--text-quaternary);text-transform:uppercase;letter-spacing:0.06em">Week ${C.weeks.length}</span>`;
    tlWrap.appendChild(tl);
    tlWrap.appendChild(tlLabels);
    band.appendChild(tlWrap);

    cardEl.appendChild(band);
    return cardEl;
  }

  function weekBox(w: ICourseWeek): HTMLElement {
    const isCurrent = w.week === C.currentWeek;
    const box = document.createElement('div');
    box.style.cssText =
      'background:var(--bg-panel);border-radius:10px;overflow:hidden;border:1px solid ' +
      (isCurrent ? 'rgba(94,106,210,0.4)' : 'var(--border-default)');

    const head = document.createElement('div');
    head.style.cssText =
      'display:flex;align-items:center;gap:10px;padding:12px 16px;border-bottom:1px solid var(--border-subtle)';
    const title = document.createElement('span');
    title.style.cssText =
      'font-size:13.5px;font-weight:600;letter-spacing:-0.012em;color:var(--text-primary)';
    title.textContent = `Week ${w.week} — ${w.theme}`;
    head.appendChild(title);
    if (isCurrent) head.appendChild(tag('Current week', 'accent', true));
    const spacer = document.createElement('span');
    spacer.style.flex = '1';
    head.appendChild(spacer);

    const hasOnline = isConnected() && !!uc.backendId && w.slides.pdf === 'online';
    if (deckForPdf(w.slides.pdf) || hasOnline) {
      const slidesBtn = button('Week slides', 'ghost');
      slidesBtn.style.height = 'var(--control-sm)';
      slidesBtn.style.fontSize = '12px';
      slidesBtn.addEventListener('click', async () => {
        const orig = slidesBtn.textContent ?? '';
        slidesBtn.textContent = '…';
        slidesBtn.style.pointerEvents = 'none';
        try {
          if (isConnected() && uc.backendId) {
            const remote = await getSupaWeekSlides(uc.backendId, w.week).catch(
              () => null
            );
            if (remote) {
              app.openSlideReader(remote.pages, remote.title, remote.docId);
              return;
            }
          }
          const deck = deckForPdf(w.slides.pdf);
          if (deck) app.openSlideReader(deckToPages(deck), deck.title);
        } finally {
          slidesBtn.textContent = orig;
          slidesBtn.style.pointerEvents = '';
        }
      });
      head.appendChild(slidesBtn);
    }
    box.appendChild(head);

    const rows = document.createElement('div');
    rows.style.cssText = 'display:flex;flex-direction:column';
    w.notebookIds.forEach((id, i) => {
      const nb = C.notebooks[id];
      if (nb) rows.appendChild(notebookRow(nb, i === 0));
    });
    if (w.notebookIds.length === 0) {
      const empty = document.createElement('div');
      empty.style.cssText =
        'padding:12px 16px;font-size:12px;color:var(--text-quaternary)';
      empty.textContent = 'No notebooks in this week yet.';
      rows.appendChild(empty);
    }
    box.appendChild(rows);
    return box;
  }

  function notebookRow(nb: ICourseNotebook, first: boolean): HTMLElement {
    const shown = notebookDisplayStatus(nb);
    const done = shown === 'done';
    const openable = isNotebookOpenable(nb);
    const locked = shown === 'locked';

    const row = document.createElement('div');
    row.style.cssText = [
      'display:flex;align-items:center;gap:12px;padding:10px 16px',
      first ? '' : 'border-top:1px solid var(--border-subtle)',
      'transition:background-color var(--dur-fast) var(--ease-out)',
      openable || done ? 'cursor:pointer' : 'opacity:0.55'
    ].join(';');

    row.appendChild(
      statusIcon(
        done ? 'done' : shown === 'available' ? 'started' : 'backlog',
        15
      )
    );

    const body = document.createElement('div');
    body.style.cssText =
      'display:flex;flex-direction:column;gap:2px;min-width:0;flex:1';
    body.innerHTML =
      `<span style="font-size:13px;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:${locked ? 'var(--text-quaternary)' : 'var(--text-primary)'}">${nb.title}</span>` +
      `<span style="font-size:12px;color:var(--text-quaternary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${nb.blurb}</span>`;
    const titleEl = body.firstElementChild as HTMLElement;
    row.appendChild(body);

    const label = document.createElement('span');
    label.style.cssText =
      'font-size:11.5px;font-weight:500;flex:0 0 auto;color:' +
      (done
        ? 'var(--brand-300)'
        : shown === 'available'
        ? 'var(--yellow-500)'
        : 'var(--text-quaternary)');
    label.textContent =
      done ? 'Done' : shown === 'available' ? 'Available' : 'Locked';
    row.appendChild(label);

    if (openable) {
      row.addEventListener('mouseenter', () => {
        row.style.background = 'rgba(0,0,0,0.03)';
      });
      row.addEventListener('mouseleave', () => {
        row.style.background = 'transparent';
      });
      row.addEventListener('click', async () => {
        titleEl.textContent = `${nb.title} — loading…`;
        try {
          // DB-backed course notebooks carry their content with them; local
          // workspace notebooks are read from the filesystem by path.
          const stored = getCourseDoc(nb.path as string);
          const doc =
            stored ??
            (await loadNotebook(
              app.services.contents,
              nb.path as string,
              nb.title
            ));
          if (doc.cells.length === 0) {
            titleEl.textContent = `${nb.title} (no code cells)`;
            return;
          }
          app.doc = doc;
          app.explainAllowed = nb.week < C.currentWeek;
          app.navigate('session');
        } catch {
          titleEl.textContent = `${nb.title} — failed to load`;
        }
      });
    }

    return row;
  }

  function uploadRow(): HTMLElement {
    const label = document.createElement('label');
    label.style.cssText =
      'display:flex;align-items:center;gap:12px;padding:16px;border:1px dashed var(--border-strong);border-radius:10px;cursor:pointer;background:transparent;transition:border-color var(--dur-fast) var(--ease-out), background-color var(--dur-fast) var(--ease-out)';
    label.addEventListener('mouseenter', () => {
      label.style.borderColor = 'var(--accent)';
      label.style.background = 'rgba(94,106,210,0.05)';
    });
    label.addEventListener('mouseleave', () => {
      label.style.borderColor = 'var(--border-strong)';
      label.style.background = 'transparent';
    });

    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = '.ipynb';
    fileInput.style.display = 'none';

    label.innerHTML =
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>' +
      '<div style="display:flex;flex-direction:column;gap:2px">' +
      '<span style="font-size:13px;font-weight:500;color:var(--text-secondary)">Bring your own notebook</span>' +
      '<span style="font-size:12px;color:var(--text-quaternary)">Upload a .ipynb file — Runcell turns it into a learning session</span>' +
      '</div>';
    label.appendChild(fileInput);

    fileInput.addEventListener('change', async () => {
      const file = fileInput.files?.[0];
      if (!file) return;
      try {
        const doc = await parseUploadedNotebook(file);
        if (doc.cells.length === 0) {
          alert('No runnable code cells found in that notebook.');
          return;
        }
        const title = file.name.replace(/\.ipynb$/i, '');
        // Personal upload → ask where to keep it so it survives a reload.
        const pref = await askStoragePreference('notebook');
        if (pref === 'web' && isConnected()) {
          await savePersonalNotebook({ title, cells: doc.cells }).catch(() => null);
        } else if (pref === 'local') {
          await localPut('notebooks', {
            id: `local-${Date.now()}`,
            title,
            cells: doc.cells
          }).catch(() => null);
        }
        app.doc = doc;
        app.explainAllowed = true;
        app.navigate('session');
      } catch {
        alert('That file could not be parsed as a notebook.');
      }
    });

    return label;
  }
}

// ── Join / create course modal (prototype dialog style) ─────────────
export function openCourseModal(
  app: NotebookMindApp,
  initialMode: 'join' | 'create' = 'join'
): void {
  const overlay = document.createElement('div');
  overlay.style.cssText =
    'position:fixed;inset:0;z-index:1100;background:var(--surface-overlay);display:flex;align-items:center;justify-content:center;font-family:var(--font-sans)';

  const cardEl = document.createElement('div');
  cardEl.style.cssText = [
    'width:360px;background:var(--bg-elevated);border:1px solid var(--border-strong);border-radius:12px',
    'padding:24px;display:flex;flex-direction:column;gap:14px;box-sizing:border-box',
    'box-shadow:0 16px 48px rgba(0,0,0,0.14);animation:nm-rise 0.2s ease-out both'
  ].join(';');

  cardEl.innerHTML =
    '<div style="display:flex;flex-direction:column;gap:4px">' +
    '<span style="font-size:15px;font-weight:600;color:var(--text-primary)">Add a course</span>' +
    '<span style="font-size:12.5px;color:var(--text-tertiary)">Join with an invite code, or create your own course as a teacher.</span>' +
    '</div>';

  // Mode tabs (prototype segmented). Anyone can join or create.
  let mode: 'join' | 'create' = initialMode;
  const track = document.createElement('div');
  track.style.cssText =
    'display:flex;gap:2px;background:var(--bg-base);border:1px solid var(--border-subtle);border-radius:8px;padding:3px';
  const tabBtn = (label: string): HTMLElement => {
    const b = document.createElement('span');
    b.textContent = label;
    b.style.cssText =
      'flex:1;text-align:center;padding:6px 0;border-radius:5px;font-size:12.5px;font-weight:500;cursor:pointer;white-space:nowrap;transition:background-color 0.1s ease-out';
    return b;
  };
  const joinTab = tabBtn('Join a course');
  const createTab = tabBtn('Create a course');
  track.appendChild(joinTab);
  track.appendChild(createTab);
  cardEl.appendChild(track);

  const body = document.createElement('div');
  body.style.cssText = 'display:flex;flex-direction:column;gap:12px';
  cardEl.appendChild(body);

  const paintTabs = (): void => {
    const on = (b: HTMLElement, active: boolean): void => {
      b.style.background = active ? 'var(--bg-panel)' : 'transparent';
      b.style.boxShadow = active
        ? '0 1px 2px rgba(0,0,0,0.14), 0 0 0 1px var(--border-default)'
        : 'none';
      b.style.color = active ? 'var(--text-primary)' : 'var(--text-tertiary)';
    };
    on(joinTab, mode === 'join');
    on(createTab, mode === 'create');
  };

  const fieldEl = (
    labelText: string,
    placeholder: string,
    mono = false
  ): { wrap: HTMLElement; input: HTMLInputElement } => {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-direction:column;gap:6px';
    wrap.innerHTML = `<span style="font-size:12px;font-weight:500;color:var(--text-secondary)">${labelText}</span>`;
    const input = document.createElement('input');
    input.placeholder = placeholder;
    input.style.cssText =
      `width:100%;box-sizing:border-box;height:var(--control-md);padding:0 10px;background:var(--surface-input);color:var(--text-primary);border:1px solid var(--border-default);border-radius:var(--radius-control);font-size:14px;font-family:${mono ? 'var(--font-mono)' : 'var(--font-sans)'};letter-spacing:${mono ? '0.08em' : '-0.01em'};outline:none;transition:border-color var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out)`;
    input.addEventListener('focus', () => {
      input.style.borderColor = 'var(--accent)';
      input.style.boxShadow = 'var(--ring)';
    });
    input.addEventListener('blur', () => {
      input.style.borderColor = 'var(--border-default)';
      input.style.boxShadow = 'none';
    });
    wrap.appendChild(input);
    return { wrap, input };
  };

  const err = document.createElement('span');
  err.style.cssText = 'font-size:12px;color:var(--red-400);min-height:15px';

  const dispose = (): void => overlay.remove();

  const renderBody = (): void => {
    paintTabs();
    body.innerHTML = '';
    err.textContent = '';
    if (mode === 'join') {
      const f = fieldEl('Invite code', 'e.g. DEMO2025', true);
      f.input.style.textTransform = 'uppercase';
      body.appendChild(f.wrap);
      const hint = document.createElement('span');
      hint.style.cssText = 'font-size:11.5px;color:var(--text-quaternary)';
      hint.textContent = 'Ask your teacher for the code. Try DEMO2025 for the demo course.';
      body.appendChild(hint);
      body.appendChild(err);
      const go = button('Join course', 'primary');
      go.style.width = '100%';
      const submit = async (): Promise<void> => {
        if (f.input.value.trim().length < 4) {
          err.textContent = 'Enter a valid invite code (at least 4 characters).';
          return;
        }
        go.disabled = true;
        go.textContent = 'Joining…';
        err.textContent = '';
        const res = await joinCourse(f.input.value);
        if (!res) {
          err.textContent = 'No course found with that invite code.';
          go.disabled = false;
          go.textContent = 'Join course';
          return;
        }
        dispose();
        celebrate(`Joined ${res.data.subject}`);
        app.navigate('home');
      };
      go.addEventListener('click', () => void submit());
      f.input.addEventListener('keydown', e => {
        if (e.key === 'Enter') void submit();
      });
      body.appendChild(go);
      setTimeout(() => f.input.focus(), 50);
    } else {
      const f = fieldEl('Course name', 'e.g. Statistics 101');
      body.appendChild(f.wrap);
      const hint = document.createElement('span');
      hint.style.cssText = 'font-size:11.5px;color:var(--text-quaternary)';
      hint.textContent =
        'You become the teacher: publish weeks in the Teacher dashboard and share the invite code with students.';
      body.appendChild(hint);
      body.appendChild(err);
      const go = button('Create course', 'primary');
      go.style.width = '100%';
      const submit = async (): Promise<void> => {
        const name = f.input.value.trim();
        if (name.length < 3) {
          err.textContent = 'Give the course a name (at least 3 characters).';
          return;
        }
        go.disabled = true;
        go.textContent = 'Creating…';
        const res = await createOwnCourse(name);
        dispose();
        celebrate(`Created ${res.data.subject}`);
        app.navigate('home');
      };
      go.addEventListener('click', () => void submit());
      f.input.addEventListener('keydown', e => {
        if (e.key === 'Enter') void submit();
      });
      body.appendChild(go);
      setTimeout(() => f.input.focus(), 50);
    }
  };

  joinTab.addEventListener('click', () => {
    mode = 'join';
    renderBody();
  });
  createTab.addEventListener('click', () => {
    mode = 'create';
    renderBody();
  });

  overlay.addEventListener('click', e => {
    if (e.target === overlay) dispose();
  });

  renderBody();
  overlay.appendChild(cardEl);
  document.body.appendChild(overlay);
}
