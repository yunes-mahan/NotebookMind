import { NotebookMindApp } from './nbApp';
import { loadNotebook, parseUploadedNotebook } from './nbSource';
import { isAiReady } from './gemini';
import {
  COURSE,
  coursePercent,
  STATUS_META,
  ICourseNotebook,
  ICourseWeek
} from './courseData';
import { deckForPdf, IDeck, ISlide } from './slidesData';
import { IPageData } from './pdfExtract';
import { isConnected } from './supabase';
import { getSupaWeekSlides } from './supabaseDB';
import { button, infoBox, maxWidth } from './uiKit';

const DEMO_COURSE_ID = '00000000-0000-0000-0000-000000000001';

export function renderHome(host: HTMLElement, app: NotebookMindApp): void {
  const root = maxWidth(host);

  // ── Header: the "Bereich" (subject) ───────────────────────────
  const header = document.createElement('div');
  header.style.cssText =
    'display:flex;justify-content:space-between;align-items:flex-start;gap:14px;margin-bottom:18px';
  const left = document.createElement('div');
  const subj = document.createElement('div');
  subj.style.cssText =
    'font-size:26px;font-weight:800;letter-spacing:-0.02em;color:var(--nm-text);line-height:1.15';
  subj.textContent = `📚 ${COURSE.subject}`;
  const teacher = document.createElement('div');
  teacher.style.cssText =
    'font-size:14px;color:var(--nm-text-secondary);margin-top:5px';
  teacher.textContent = `Taught by ${COURSE.teacher}`;
  left.appendChild(subj);
  left.appendChild(teacher);
  const headerBtns = document.createElement('div');
  headerBtns.style.cssText = 'display:flex;gap:8px;flex-shrink:0;flex-wrap:wrap;justify-content:flex-end';
  const mapBtn = button('🗺 Course map', 'secondary');
  mapBtn.addEventListener('click', () => app.navigate('coursemap'));
  const teacherBtn = button('👩‍🏫 Teacher', 'secondary');
  teacherBtn.addEventListener('click', () => openTeacherLogin(app));
  headerBtns.appendChild(mapBtn);
  headerBtns.appendChild(teacherBtn);
  header.appendChild(left);
  header.appendChild(headerBtns);
  root.appendChild(header);

  if (!isAiReady()) {
    const warn = infoBox(
      '⚠️ <strong>No AI key set.</strong> Challenges use a basic fallback. ' +
        'Restart with <code style="background:#FCD34D;padding:1px 5px;border-radius:4px">GEMINI_API_KEY=… jupyter lab</code> for full features.',
      'warn'
    );
    warn.style.marginBottom = '18px';
    root.appendChild(warn);
  }

  // ── Course progress hero ──────────────────────────────────────
  const pct = coursePercent();
  const week = COURSE.weeks[COURSE.currentWeek - 1];
  const allNb = Object.values(COURSE.notebooks);
  const doneNb = allNb.filter(n => n.status === 'done').length;

  const prog = document.createElement('div');
  prog.style.cssText = [
    'background:var(--nm-bg-elev-1);border:1px solid var(--nm-border);color:var(--nm-fg)',
    'border-radius:var(--nm-radius-xl);padding:22px 24px;margin-bottom:24px;box-shadow:var(--nm-shadow-sm)'
  ].join(';');

  const progTop = document.createElement('div');
  progTop.style.cssText =
    'display:flex;justify-content:space-between;align-items:flex-end;gap:16px;flex-wrap:wrap';
  const ptLeft = document.createElement('div');
  ptLeft.innerHTML =
    `<div style="font-size:40px;font-weight:800;line-height:1;color:var(--nm-fg-strong)">${pct}<span style="font-size:18px;color:var(--nm-fg-subtle);font-weight:600">% complete</span></div>` +
    `<div style="font-size:13px;color:var(--nm-fg-muted);margin-top:6px;font-weight:600">${doneNb} of ${allNb.length} notebooks done</div>`;
  const ptRight = document.createElement('div');
  ptRight.style.cssText = 'text-align:right';
  ptRight.innerHTML =
    `<div style="font-size:11px;font-family:var(--nm-font-mono);text-transform:uppercase;letter-spacing:0.04em;color:var(--nm-fg-subtle)">Week ${COURSE.currentWeek} of ${COURSE.weeks.length}</div>` +
    `<div style="font-size:15px;font-weight:700;color:var(--nm-fg-strong);margin-top:2px">${week.theme}</div>`;
  progTop.appendChild(ptLeft);
  progTop.appendChild(ptRight);
  prog.appendChild(progTop);

  // Week timeline — one segment per week, coloured by status.
  const timeline = document.createElement('div');
  timeline.style.cssText = 'display:flex;gap:8px;margin:18px 0 4px';
  COURSE.weeks.forEach(w => {
    const past = w.week < COURSE.currentWeek;
    const current = w.week === COURSE.currentWeek;
    const color = past
      ? 'var(--nm-accent)'
      : current
      ? 'var(--nm-primary)'
      : 'var(--nm-border-strong)';
    const seg = document.createElement('div');
    seg.style.cssText = 'flex:1;min-width:0';
    const segBar = document.createElement('div');
    segBar.style.cssText = `height:7px;border-radius:6px;background:${color}`;
    const lbl = document.createElement('div');
    lbl.style.cssText = `font-size:11px;font-family:var(--nm-font-mono);margin-top:7px;color:${current ? 'var(--nm-fg-strong)' : 'var(--nm-fg-subtle)'};font-weight:${current ? 700 : 500}`;
    lbl.textContent = `W${w.week}`;
    const th = document.createElement('div');
    th.style.cssText =
      'font-size:11.5px;color:var(--nm-fg-muted);margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
    th.textContent = w.theme;
    seg.appendChild(segBar);
    seg.appendChild(lbl);
    seg.appendChild(th);
    timeline.appendChild(seg);
  });
  prog.appendChild(timeline);

  const chips = document.createElement('div');
  chips.style.cssText = 'display:flex;flex-wrap:wrap;gap:7px;margin-top:14px';
  const chipLead = document.createElement('span');
  chipLead.style.cssText =
    'font-size:12px;color:var(--nm-fg-subtle);font-weight:600;align-self:center';
  chipLead.textContent = 'This week:';
  chips.appendChild(chipLead);
  week.topics.forEach(t => {
    const c = document.createElement('span');
    c.style.cssText =
      'background:var(--nm-accent-soft);color:var(--nm-accent-hover);padding:4px 11px;border-radius:20px;font-size:12px;font-weight:600';
    c.textContent = t;
    chips.appendChild(c);
  });
  prog.appendChild(chips);
  root.appendChild(prog);

  // ── Weeks (responsive grid of cards) ──────────────────────────
  const weeksGrid = document.createElement('div');
  weeksGrid.style.cssText =
    'display:grid;grid-template-columns:repeat(auto-fill,minmax(290px,1fr));gap:14px;margin-bottom:8px;align-items:start';
  COURSE.weeks.forEach(w => weeksGrid.appendChild(weekCard(w)));
  root.appendChild(weeksGrid);

  // ── Manual upload ─────────────────────────────────────────────
  const uploadCard = document.createElement('div');
  uploadCard.style.cssText = [
    'background:#fff;border:2px dashed var(--nm-accent-border);border-radius:var(--nm-radius-lg)',
    'padding:18px;margin-top:8px;text-align:center'
  ].join(';');
  const uTitle = document.createElement('div');
  uTitle.style.cssText =
    'font-size:14px;font-weight:700;color:var(--nm-text);margin-bottom:3px';
  uTitle.textContent = '⬆️ Upload a notebook';
  const uSub = document.createElement('div');
  uSub.style.cssText = 'font-size:12.5px;color:var(--nm-text-secondary);margin-bottom:12px';
  uSub.textContent = 'Add your own .ipynb (released to students over time).';
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.ipynb';
  fileInput.style.display = 'none';
  const uBtn = button('Choose file…', 'secondary');
  uBtn.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    if (!file) {
      return;
    }
    try {
      const doc = await parseUploadedNotebook(file);
      if (doc.cells.length === 0) {
        root.appendChild(infoBox('That notebook has no runnable code cells.', 'error'));
        return;
      }
      app.doc = doc;
      app.explainAllowed = true;
      app.navigate('mode');
    } catch {
      root.appendChild(infoBox('Could not read that .ipynb file.', 'error'));
    }
  });
  uploadCard.appendChild(uTitle);
  uploadCard.appendChild(uSub);
  uploadCard.appendChild(uBtn);
  uploadCard.appendChild(fileInput);
  root.appendChild(uploadCard);

  // ── Helpers ───────────────────────────────────────────────────
  function weekCard(w: ICourseWeek): HTMLElement {
    const card = document.createElement('div');
    card.style.cssText = [
      'background:#fff;border:1px solid var(--nm-border);border-radius:var(--nm-radius-lg)',
      'padding:16px 18px;margin-bottom:14px;box-shadow:var(--nm-shadow-xs)'
    ].join(';');

    const head = document.createElement('div');
    head.style.cssText =
      'display:flex;justify-content:space-between;align-items:center;gap:12px;margin-bottom:12px;flex-wrap:wrap';
    const wt = document.createElement('div');
    const isCurrent = w.week === COURSE.currentWeek;
    wt.style.cssText = 'font-size:15px;font-weight:700;color:var(--nm-text)';
    wt.innerHTML =
      `Week ${w.week} — ${w.theme}` +
      (isCurrent
        ? ' <span style="background:var(--nm-accent-light);color:var(--nm-accent-hover);padding:2px 9px;border-radius:20px;font-size:11px;font-weight:700;margin-left:6px">current</span>'
        : '');

    // Slides button — opens full reader with all papermind features
    const slidesBtn = button(`📄 ${w.slides.label}`, 'ghost');
    slidesBtn.style.padding = '6px 12px';
    slidesBtn.style.fontSize = '12.5px';
    slidesBtn.addEventListener('click', async () => {
      const origText = slidesBtn.textContent ?? '';
      slidesBtn.textContent = '…';
      slidesBtn.style.pointerEvents = 'none';

      try {
        // Try Supabase first (teacher-uploaded real PDF)
        if (isConnected()) {
          const remote = await getSupaWeekSlides(DEMO_COURSE_ID, w.week).catch(() => null);
          if (remote) {
            app.openSlideReader(remote.pages, remote.title, remote.docId);
            return;
          }
        }
        // Fall back to hardcoded slide deck
        const deck = deckForPdf(w.slides.pdf);
        if (deck) {
          app.openSlideReader(deckToPages(deck), deck.title);
        }
      } finally {
        slidesBtn.textContent = origText;
        slidesBtn.style.pointerEvents = '';
      }
    });

    head.appendChild(wt);
    head.appendChild(slidesBtn);
    card.appendChild(head);

    w.notebookIds.forEach(id => {
      const nb = COURSE.notebooks[id];
      if (nb) {
        card.appendChild(notebookRow(nb));
      }
    });
    return card;
  }

  function notebookRow(nb: ICourseNotebook): HTMLElement {
    const meta = STATUS_META[nb.status];
    const openable = nb.status === 'available' && !!nb.path;
    const row = document.createElement('div');
    row.style.cssText = [
      'display:flex;align-items:center;gap:12px;padding:11px 12px;border-radius:var(--nm-radius)',
      'border:1px solid var(--nm-border);margin-bottom:8px;transition:all 0.15s',
      `background:${nb.status === 'available' ? '#fff' : 'var(--nm-bg-subtle)'}`,
      openable ? 'cursor:pointer' : 'cursor:default',
      nb.status === 'locked' ? 'opacity:0.65' : ''
    ].join(';');

    const badge = document.createElement('div');
    badge.style.cssText = [
      'width:30px;height:30px;border-radius:8px;flex-shrink:0;display:flex',
      'align-items:center;justify-content:center;font-size:14px;font-weight:700',
      `background:${meta.color}1A;color:${meta.color}`
    ].join(';');
    badge.textContent = meta.icon;

    const body = document.createElement('div');
    body.style.cssText = 'flex:1;min-width:0';
    const title = document.createElement('div');
    title.style.cssText =
      'font-size:14px;font-weight:600;color:var(--nm-text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
    title.textContent = nb.title;
    const blurb = document.createElement('div');
    blurb.style.cssText =
      'font-size:12px;color:var(--nm-text-secondary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
    blurb.textContent = nb.blurb;
    body.appendChild(title);
    body.appendChild(blurb);

    const right = document.createElement('div');
    right.style.cssText = 'font-size:18px;color:var(--nm-text-faint);flex-shrink:0';
    right.textContent = openable ? '→' : nb.status === 'locked' ? '🔒' : '';

    if (openable) {
      row.addEventListener('mouseenter', () => {
        row.style.borderColor = 'var(--nm-accent-border)';
        row.style.transform = 'translateX(3px)';
      });
      row.addEventListener('mouseleave', () => {
        row.style.borderColor = 'var(--nm-border)';
        row.style.transform = 'translateX(0)';
      });
      row.addEventListener('click', async () => {
        title.textContent = `${nb.title} — loading…`;
        try {
          const doc = await loadNotebook(
            app.services.contents,
            nb.path as string,
            nb.title
          );
          if (doc.cells.length === 0) {
            title.textContent = `${nb.title} (no code cells)`;
            return;
          }
          app.doc = doc;
          // Past weeks can be reviewed in Explain; the current week is Learn-only.
          app.explainAllowed = nb.week < COURSE.currentWeek;
          app.navigate('mode');
        } catch {
          title.textContent = `${nb.title} — failed to load`;
        }
      });
    }

    row.appendChild(badge);
    row.appendChild(body);
    row.appendChild(right);
    return row;
  }
}

function deckToPages(deck: IDeck): IPageData[] {
  return deck.slides.map((slide, i) => ({
    pageNumber: i + 1,
    text: slideToText(slide),
    imageBase64: null,
    width: 1024,
    height: 576
  }));
}

function slideToText(slide: ISlide): string {
  const lines: string[] = [];
  if (slide.eyebrow) lines.push(slide.eyebrow.toUpperCase());
  if (slide.title) {
    lines.push('──────────────────────────────────');
    lines.push(slide.title);
  }
  if (slide.presenter) lines.push('\n' + slide.presenter);
  if (slide.text) lines.push('\n' + slide.text);
  if (slide.bullets?.length) {
    lines.push('');
    slide.bullets.forEach(b => lines.push('  •  ' + b));
  }
  return lines.join('\n');
}

function openTeacherLogin(app: NotebookMindApp): void {
  const overlay = document.createElement('div');
  overlay.style.cssText = [
    'position:fixed;inset:0;z-index:1100;background:rgba(14,14,12,0.55);backdrop-filter:blur(3px)',
    'display:flex;align-items:center;justify-content:center;font-family:var(--nm-font-sans)'
  ].join(';');

  const cardEl = document.createElement('div');
  cardEl.style.cssText = [
    'background:#fff;border:1px solid var(--nm-border);border-radius:var(--nm-radius-xl)',
    'box-shadow:var(--nm-shadow-pop);padding:26px;width:320px;box-sizing:border-box;text-align:center'
  ].join(';');
  const t = document.createElement('div');
  t.style.cssText = 'font-size:18px;font-weight:800;color:var(--nm-fg-strong)';
  t.textContent = '👩‍🏫 Teacher sign-in';
  const sub = document.createElement('div');
  sub.style.cssText = 'font-size:13px;color:var(--nm-fg-muted);margin:6px 0 16px';
  sub.textContent = 'Enter the teacher password to open the dashboard.';
  const input = document.createElement('input');
  input.type = 'password';
  input.placeholder = 'Password';
  input.style.cssText = [
    'width:100%;box-sizing:border-box;font-family:var(--nm-font-sans);font-size:14px',
    'padding:10px 12px;border:1px solid var(--nm-border);border-radius:var(--nm-radius);outline:none;color:var(--nm-fg);text-align:center'
  ].join(';');
  const err = document.createElement('div');
  err.style.cssText = 'font-size:12px;color:var(--nm-danger);min-height:16px;margin-top:8px';

  const dispose = (): void => {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
  };
  const submit = (): void => {
    if (input.value.trim() === '123') {
      dispose();
      app.navigate('teacher');
    } else {
      err.textContent = 'Incorrect password.';
      input.value = '';
      input.focus();
    }
  };
  function onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      dispose();
    }
  }
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      submit();
    }
  });

  const enter = button('Sign in', 'primary');
  enter.style.cssText += ';width:100%;margin-top:14px';
  enter.addEventListener('click', submit);
  const cancel = button('Cancel', 'ghost');
  cancel.style.cssText += ';width:100%;margin-top:8px';
  cancel.addEventListener('click', dispose);

  overlay.addEventListener('click', e => {
    if (e.target === overlay) {
      dispose();
    }
  });
  document.addEventListener('keydown', onKey);

  cardEl.appendChild(t);
  cardEl.appendChild(sub);
  cardEl.appendChild(input);
  cardEl.appendChild(err);
  cardEl.appendChild(enter);
  cardEl.appendChild(cancel);
  overlay.appendChild(cardEl);
  document.body.appendChild(overlay);
  setTimeout(() => input.focus(), 50);
}
