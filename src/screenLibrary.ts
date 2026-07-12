import { NotebookMindApp } from './nbApp';
import { activeCourse } from './courseStore';
import { deckForPdf, IDeck, ISlide } from './slidesData';
import { IPageData, extractPdfFull } from './pdfExtract';
import { isConnected } from './supabase';
import { getSupaWeekSlides } from './supabaseDB';
import { pageHeader, tag, maxWidth } from './uiKit';

const DEMO_COURSE_ID = '00000000-0000-0000-0000-000000000001';

// Session-local list of PDFs the user uploaded (reopenable from the library).
const uploadedDocs: Array<{ title: string; pages: IPageData[] }> = [];

/** "Slides & Papers" — prototype library layout. */
export function renderLibrary(host: HTMLElement, app: NotebookMindApp): void {
  const uc = activeCourse();
  const COURSE = uc.data;
  const root = maxWidth(host, 860);
  root.style.cssText += ';display:flex;flex-direction:column;gap:24px;padding-bottom:32px';

  root.appendChild(
    pageHeader('Slides & Papers', {
      subtitle: 'Lecture decks for every week, plus anything you upload yourself.'
    })
  );

  // ── Course decks grid ─────────────────────────────────────────
  const grid = document.createElement('div');
  grid.style.cssText =
    'display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:12px';

  if (COURSE.weeks.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText =
      'display:flex;flex-direction:column;align-items:center;gap:10px;padding:36px 24px;background:var(--bg-panel);border:1px dashed var(--border-strong);border-radius:10px;text-align:center';
    empty.innerHTML =
      '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--text-quaternary)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="13" rx="2"></rect><path d="M8 21h8"></path><path d="M12 16v5"></path></svg>' +
      `<span style="font-size:12.5px;color:var(--text-tertiary);line-height:1.55;max-width:380px">No lecture decks in ${COURSE.subject} yet${uc.isOwn ? ' — upload week slides in the Teacher dashboard.' : ' — your teacher hasn\u2019t published slides.'}</span>`;
    grid.style.display = 'block';
    grid.appendChild(empty);
  }
  COURSE.weeks.forEach(w => {
    const isCurrent = w.week === COURSE.currentWeek;
    const deck = deckForPdf(w.slides.pdf);
    const cardEl = document.createElement('div');
    cardEl.style.cssText =
      'background:var(--surface-card);border:1px solid ' +
      (isCurrent ? 'rgba(94,106,210,0.45)' : 'var(--border-default)') +
      ';border-radius:10px;overflow:hidden;cursor:pointer;transition:border-color 0.12s ease-out, transform 0.12s ease-out';
    cardEl.addEventListener('mouseenter', () => {
      cardEl.style.borderColor = 'var(--border-strong)';
      cardEl.style.transform = 'translateY(-1px)';
    });
    cardEl.addEventListener('mouseleave', () => {
      cardEl.style.borderColor = isCurrent
        ? 'rgba(94,106,210,0.45)'
        : 'var(--border-default)';
      cardEl.style.transform = 'translateY(0)';
    });

    // Preview: accent-subtle area with a white icon tile
    const preview = document.createElement('div');
    preview.style.cssText =
      'aspect-ratio:16/9;background:var(--accent-subtle-bg);border-bottom:1px solid var(--border-subtle);display:flex;align-items:center;justify-content:center';
    preview.innerHTML =
      '<div style="width:46px;height:46px;border-radius:12px;background:var(--surface-card);border:1px solid var(--border-default);display:flex;align-items:center;justify-content:center;box-shadow:0 1px 3px rgba(0,0,0,0.06)">' +
      '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--accent)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="16 18 22 12 16 6"></polyline><polyline points="8 6 2 12 8 18"></polyline></svg>' +
      '</div>';
    cardEl.appendChild(preview);

    const body = document.createElement('div');
    body.style.cssText =
      'padding:11px 14px;display:flex;flex-direction:column;gap:5px';
    const metaRow = document.createElement('div');
    metaRow.style.cssText = 'display:flex;align-items:center;gap:8px';
    const weekLbl = document.createElement('span');
    weekLbl.style.cssText =
      'font-size:10.5px;font-weight:600;letter-spacing:0.06em;text-transform:uppercase;color:var(--text-quaternary);white-space:nowrap';
    weekLbl.textContent = `Week ${w.week}`;
    metaRow.appendChild(weekLbl);
    if (isCurrent) metaRow.appendChild(tag('Current', 'accent', true));
    body.appendChild(metaRow);
    const title = document.createElement('span');
    title.style.cssText =
      'font-size:13.5px;font-weight:600;letter-spacing:-0.012em;color:var(--text-primary)';
    title.textContent = w.theme;
    body.appendChild(title);
    const meta = document.createElement('span');
    meta.style.cssText = 'font-size:11.5px;color:var(--text-quaternary)';
    meta.textContent = deck ? `${deck.slides.length} slides` : w.slides.label;
    body.appendChild(meta);
    cardEl.appendChild(body);

    cardEl.addEventListener('click', async () => {
      cardEl.style.pointerEvents = 'none';
      try {
        if (isConnected()) {
          const remote = await getSupaWeekSlides(DEMO_COURSE_ID, w.week).catch(
            () => null
          );
          if (remote) {
            app.openSlideReader(remote.pages, remote.title, remote.docId);
            return;
          }
        }
        if (deck) {
          app.openSlideReader(deckToPages(deck), deck.title);
        }
      } finally {
        cardEl.style.pointerEvents = '';
      }
    });

    grid.appendChild(cardEl);
  });
  root.appendChild(grid);

  // ── Your uploads ──────────────────────────────────────────────
  const upWrap = document.createElement('div');
  upWrap.style.cssText = 'display:flex;flex-direction:column;gap:10px';
  const upLbl = document.createElement('span');
  upLbl.style.cssText = 'font-size:13px;font-weight:600;color:var(--text-secondary)';
  upLbl.textContent = 'Your uploads';
  upWrap.appendChild(upLbl);

  uploadedDocs.forEach(u => {
    const row = document.createElement('div');
    row.style.cssText =
      'display:flex;align-items:center;gap:12px;padding:12px 16px;background:var(--surface-card);border:1px solid var(--border-default);border-radius:9px;cursor:pointer;transition:border-color var(--dur-fast) var(--ease-out)';
    row.addEventListener('mouseenter', () => {
      row.style.borderColor = 'var(--border-strong)';
    });
    row.addEventListener('mouseleave', () => {
      row.style.borderColor = 'var(--border-default)';
    });
    row.innerHTML =
      '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="var(--red-400)" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"></path><polyline points="14 2 14 8 20 8"></polyline></svg>' +
      `<span style="font-size:13px;font-weight:500;flex:1;color:var(--text-primary)">${u.title}</span>` +
      `<span style="font-size:11.5px;color:var(--text-quaternary)">PDF · ${u.pages.length} pages</span>`;
    row.addEventListener('click', () => app.openSlideReader(u.pages, u.title));
    upWrap.appendChild(row);
  });

  // Dropzone
  const drop = document.createElement('div');
  drop.style.cssText =
    'display:flex;border:1px dashed var(--border-strong);border-radius:10px;background:transparent;transition:border-color var(--dur-fast) var(--ease-out), background-color var(--dur-fast) var(--ease-out)';
  const label = document.createElement('label');
  label.style.cssText =
    'display:flex;flex-direction:column;align-items:center;gap:8px;cursor:pointer;padding:26px;width:100%;box-sizing:border-box;text-align:center';
  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.pdf';
  fileInput.style.display = 'none';
  label.innerHTML =
    '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-tertiary)" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="17 8 12 3 7 8"></polyline><line x1="12" y1="3" x2="12" y2="15"></line></svg>' +
    '<span class="nm-drop-title" style="font-size:13px;font-weight:500;color:var(--text-secondary)">Drop a PDF here, or browse</span>' +
    '<span style="font-size:11.5px;color:var(--text-quaternary)">Papers, readings, extra slides — they open in the Reader with notes, quiz and flashcards</span>';
  label.appendChild(fileInput);
  drop.appendChild(label);

  const statusEl = label.querySelector('.nm-drop-title') as HTMLElement;

  const handle = async (file: File): Promise<void> => {
    if (!file.name.toLowerCase().endsWith('.pdf')) return;
    statusEl.textContent = 'Extracting PDF…';
    drop.style.pointerEvents = 'none';
    try {
      const res = await extractPdfFull(file);
      const title = file.name.replace(/\.pdf$/i, '');
      uploadedDocs.push({ title, pages: res.pages });
      app.openSlideReader(res.pages, title);
    } catch {
      statusEl.textContent = 'Could not read that PDF. Try another file.';
      drop.style.pointerEvents = '';
    }
  };

  drop.addEventListener('dragover', e => {
    e.preventDefault();
    drop.style.borderColor = 'var(--accent)';
    drop.style.background = 'rgba(94,106,210,0.06)';
  });
  drop.addEventListener('dragleave', () => {
    drop.style.borderColor = 'var(--border-strong)';
    drop.style.background = 'transparent';
  });
  drop.addEventListener('drop', e => {
    e.preventDefault();
    drop.style.borderColor = 'var(--border-strong)';
    drop.style.background = 'transparent';
    const f = e.dataTransfer?.files[0];
    if (f) void handle(f);
  });
  fileInput.addEventListener('change', () => {
    const f = fileInput.files?.[0];
    if (f) void handle(f);
  });

  upWrap.appendChild(drop);
  root.appendChild(upWrap);
}

export function deckToPages(deck: IDeck): IPageData[] {
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
