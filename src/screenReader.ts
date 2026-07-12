import { IPageData, IExtractResult, extractPdfFull } from './pdfExtract';
import { isAiReady, askAboutCell } from './gemini';
import { isConnected } from './supabase';
import {
  upsertDocument, getSectionNotes, addPoints,
  getDocumentFlashcards, upsertFlashcardsForSection, updateFlashcard,
  updateDocumentSections, IFlashcard
} from './supabaseDB';
import { pointsEngine } from './points';
import { spinner } from './uiKit';

// ── Types ──────────────────────────────────────────────────────

interface ISection {
  index: number;
  title: string;
  pages: IPageData[];
  text: string;
  understood: boolean;
}

interface IQuizQuestion {
  type: 'multiple_choice' | 'true_false' | 'fill_blank' | 'matching' | 'open_answer';
  question: string;
  options: string[];
  correct_answer: string | string[];
  explanation: string;
}

interface IAnswerRecord {
  question: IQuizQuestion;
  user_answer: string | string[];
  correct: boolean;
  feedback?: string;
}

type CardRating = 'again' | 'good' | 'easy' | 'mastered';

interface IReaderState {
  doc: IExtractResult | null;
  docId: string | null;
  docTitle: string;
  sections: ISection[];
  currentSection: number;
  currentPage: number;
  notes: Record<number, string>;
  flashcards: IFlashcard[];
  quizQuestions: IQuizQuestion[] | null;
  quizAnswers: IAnswerRecord[];
  quizIdx: number;
  quizLoading: boolean;
  quizDone: boolean;
  fcStudying: boolean;
  fcStudyCards: IFlashcard[];
  fcIdx: number;
  fcFlipped: boolean;
  fcGenerating: boolean;
  fcViewMode: 'section' | 'due' | 'all';
  activeTab: 'quiz' | 'flashcards';
  isFullscreen: boolean;
}

const state: IReaderState = {
  doc: null, docId: null, docTitle: '',
  sections: [], currentSection: 0, currentPage: 0,
  notes: {}, flashcards: [],
  quizQuestions: null, quizAnswers: [], quizIdx: 0,
  quizLoading: false, quizDone: false,
  fcStudying: false, fcStudyCards: [], fcIdx: 0, fcFlipped: false, fcGenerating: false,
  fcViewMode: 'section',
  activeTab: 'quiz', isFullscreen: false
};

// ── Spaced repetition ──────────────────────────────────────────

function computeNextInterval(card: IFlashcard, rating: CardRating) {
  let { interval_days, ease_factor, repetitions } = card;
  let review_state: IFlashcard['review_state'] = 'learning';
  if (rating === 'again') { repetitions = 0; interval_days = 1; }
  else if (rating === 'good') { repetitions++; interval_days = 2; }
  else if (rating === 'easy') { repetitions++; interval_days = 4; }
  else if (rating === 'mastered') { repetitions++; interval_days = 9999; review_state = 'mastered'; }
  const due = new Date();
  due.setTime(due.getTime() + interval_days * 24 * 60 * 60 * 1000);
  return { interval_days, ease_factor, repetitions, due_at: due.toISOString(), review_state };
}

function isDue(c: IFlashcard): boolean {
  if (c.review_state === 'mastered') return false;
  return new Date(c.due_at) <= new Date();
}

// ── Section splitting ──────────────────────────────────────────

function splitIntoSections(pages: IPageData[]): ISection[] {
  if (!pages.length) return [];
  const count = Math.min(6, Math.max(2, Math.ceil(pages.length / 4)));
  const perSection = Math.ceil(pages.length / count);
  const sections: ISection[] = [];
  for (let i = 0; i < count; i++) {
    const start = i * perSection;
    const end = Math.min(start + perSection, pages.length);
    if (start >= pages.length) break;
    const sectionPages = pages.slice(start, end);
    const text = sectionPages.map(p => p.text).join('\n').trim();
    const firstLine = text.split('\n')[0]?.trim().substring(0, 50) || `Section ${i + 1}`;
    sections.push({
      index: i,
      title: `Section ${i + 1}${firstLine && firstLine.length > 6 ? ` — ${firstLine}` : ''}`,
      pages: sectionPages,
      text,
      understood: false
    });
  }
  return sections;
}

// ── Public API ────────────────────────────────────────────────

export function loadReaderWithPages(
  pages: IPageData[],
  title: string,
  docId?: string,
  savedNotes?: Record<number, string>
): void {
  const sections = splitIntoSections(pages);
  Object.assign(state, {
    doc: { pages, fullText: pages.map(p => p.text).join('\n'), hasImages: pages.some(p => !!p.imageBase64), isSlideDoc: true },
    docId: docId ?? null, docTitle: title, sections,
    currentSection: 0, currentPage: 0,
    isFullscreen: true, notes: savedNotes ?? {},
    flashcards: [], quizQuestions: null, quizAnswers: [], quizIdx: 0,
    quizLoading: false, quizDone: false,
    fcStudying: false, fcStudyCards: [], fcIdx: 0, fcFlipped: false, fcGenerating: false,
    fcViewMode: 'section', activeTab: 'quiz'
  });
  // Load flashcards from Supabase if connected
  if (docId && isConnected()) {
    getDocumentFlashcards(docId).then(cards => { state.flashcards = cards; }).catch(() => null);
  }
}

let _host: HTMLElement | null = null;
let _onToggle: ((isFull: boolean) => void) | null = null;

export function renderReader(
  host: HTMLElement,
  onToggleFullscreen: (isFull: boolean) => void
): void {
  _host = host;
  _onToggle = onToggleFullscreen;
  _render();
}

function _render(): void {
  if (!_host) return;
  const host = _host;
  const onExit = _onToggle; // repurposed: exit the reader (back to library)
  host.innerHTML = '';
  host.style.cssText = 'display:flex;flex-direction:column;height:100%;overflow:hidden;background:var(--bg-app)';

  // Prototype header: back link over an 18px title, shortcuts ghost right.
  const header = document.createElement('div');
  header.style.cssText =
    'display:flex;align-items:flex-end;gap:12px;padding:14px 24px 12px;flex-shrink:0';

  const headCol = document.createElement('div');
  headCol.style.cssText =
    'display:flex;flex-direction:column;gap:6px;flex:1;min-width:0';
  const backEl = document.createElement('span');
  backEl.style.cssText =
    'display:inline-flex;align-items:center;gap:5px;font-size:12.5px;color:var(--text-tertiary);cursor:pointer;align-self:flex-start;transition:color var(--dur-fast) var(--ease-out)';
  backEl.innerHTML =
    '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>Back to Slides &amp; Papers';
  backEl.addEventListener('mouseenter', () => {
    backEl.style.color = 'var(--text-primary)';
  });
  backEl.addEventListener('mouseleave', () => {
    backEl.style.color = 'var(--text-tertiary)';
  });
  if (onExit) backEl.addEventListener('click', () => onExit(false));
  const titleEl = document.createElement('h1');
  titleEl.style.cssText =
    'margin:0;font-size:18px;font-weight:600;letter-spacing:-0.016em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--text-primary)';
  titleEl.textContent = state.docTitle || 'Slides & Papers';
  headCol.appendChild(backEl);
  headCol.appendChild(titleEl);
  header.appendChild(headCol);

  if (state.doc) {
    const kbBtn = _btn('Keyboard shortcuts', 'ghost');
    kbBtn.addEventListener('click', () => _showShortcuts());
    header.appendChild(kbBtn);
  }
  host.appendChild(header);

  // Content
  const content = document.createElement('div');
  content.style.cssText = 'flex:1;overflow:hidden;display:flex;flex-direction:column;min-height:0';
  host.appendChild(content);

  if (!state.doc) {
    _renderUpload(content);
    return;
  }
  _renderFull(content);
  _installKeyboard();
}

// ── Upload prompt ──────────────────────────────────────────────

function _renderUpload(content: HTMLElement): void {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'flex:1;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:24px;text-align:center;gap:14px';

  const zone = document.createElement('div');
  zone.style.cssText = [
    'border:2.5px dashed var(--nm-border-strong);border-radius:16px',
    'padding:32px 24px;width:100%;max-width:360px;box-sizing:border-box',
    'background:var(--nm-bg-elev-2);cursor:pointer;transition:all 160ms ease'
  ].join(';');
  zone.innerHTML = '<div style="font-size:40px;margin-bottom:10px">📑</div>' +
    '<div style="font-size:15px;font-weight:700;color:var(--nm-fg-strong);margin-bottom:6px">Upload slides or paper</div>' +
    '<div style="font-size:13px;color:var(--nm-fg-muted);line-height:1.55">Drop a PDF here, or click to browse.</div>';

  const fileInput = document.createElement('input');
  fileInput.type = 'file';
  fileInput.accept = '.pdf';
  fileInput.style.display = 'none';

  const handleFile = async (file: File) => {
    if (!file.name.endsWith('.pdf')) return;
    content.innerHTML = '';
    content.style.cssText = 'flex:1;display:flex;align-items:center;justify-content:center';
    const sp = document.createElement('div');
    sp.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:10px';
    sp.appendChild(spinner('Extracting PDF…'));
    content.appendChild(sp);
    try {
      const result = await extractPdfFull(file);
      const title = file.name.replace(/\.pdf$/i, '');
      const sections = splitIntoSections(result.pages);
      state.doc = result;
      state.docTitle = title;
      state.sections = sections;
      state.currentSection = 0;
      state.currentPage = 0;
      state.notes = {};
      state.flashcards = [];
      state.quizQuestions = null;
      state.quizAnswers = [];
      state.quizDone = false;
      state.isFullscreen = true;
      if (isConnected()) {
        const docId = await upsertDocument({
          title, sourceText: result.fullText,
          parts: sections.map((s, i) => ({ index: i, title: s.title, text: s.text })),
          totalSections: sections.length
        });
        state.docId = docId;
        if (docId) {
          state.notes = await getSectionNotes(docId).catch(() => ({}));
          state.flashcards = await getDocumentFlashcards(docId).catch(() => []);
        }
      }
      if (_onToggle) _onToggle(true);
      _render();
    } catch (err) {
      content.innerHTML = '';
      content.style.cssText = 'flex:1;display:flex;align-items:center;justify-content:center;padding:24px;color:var(--nm-danger);font-size:13px';
      content.textContent = `Error: ${(err as Error).message}`;
    }
  };

  zone.addEventListener('mouseenter', () => { zone.style.borderColor = 'var(--nm-primary)'; zone.style.background = 'var(--nm-accent-soft)'; });
  zone.addEventListener('mouseleave', () => { zone.style.borderColor = 'var(--nm-border-strong)'; zone.style.background = 'var(--nm-bg-elev-2)'; });
  zone.addEventListener('click', () => fileInput.click());
  zone.addEventListener('dragover', e => { e.preventDefault(); zone.style.borderColor = 'var(--nm-primary)'; });
  zone.addEventListener('dragleave', () => { zone.style.borderColor = 'var(--nm-border-strong)'; });
  zone.addEventListener('drop', e => { e.preventDefault(); const f = e.dataTransfer?.files[0]; if (f) handleFile(f); });
  fileInput.addEventListener('change', () => { if (fileInput.files?.[0]) handleFile(fileInput.files[0]); });

  wrap.appendChild(zone);
  wrap.appendChild(fileInput);
  content.appendChild(wrap);
}

// ── Full view ──────────────────────────────────────────────────

function _renderFull(content: HTMLElement): void {
  content.innerHTML = '';
  content.style.cssText =
    'flex:1;display:grid;grid-template-columns:minmax(150px,220px) minmax(320px,1fr) minmax(240px,320px);gap:0;min-height:0;border-top:1px solid var(--border-subtle);overflow:hidden';

  // ── LEFT: sections ────────────────────────────────────────────
  const sidebar = document.createElement('div');
  sidebar.style.cssText =
    'border-right:1px solid var(--border-subtle);overflow-y:auto;padding:14px 10px;display:flex;flex-direction:column;gap:2px;min-height:0';

  const understood = state.sections.filter(s => s.understood).length;
  const progRow = document.createElement('div');
  progRow.style.cssText =
    'padding:0 8px 10px;display:flex;flex-direction:column;gap:6px';
  progRow.innerHTML = `<span style="font-size:11px;font-weight:600;color:var(--text-quaternary);text-transform:uppercase;letter-spacing:0.06em">${understood} of ${state.sections.length} understood</span>`;
  const progBar = document.createElement('div');
  progBar.style.cssText =
    'height:4px;border-radius:2px;background:var(--gray-800);overflow:hidden';
  const progFill = document.createElement('div');
  progFill.style.cssText = `height:100%;border-radius:2px;background:var(--green-500);transition:width 0.3s ease-out;width:${state.sections.length ? ((understood / state.sections.length) * 100).toFixed(0) : 0}%`;
  progBar.appendChild(progFill);
  progRow.appendChild(progBar);
  sidebar.appendChild(progRow);

  state.sections.forEach((s, i) => {
    const isActive = i === state.currentSection;
    const item = document.createElement('div');
    item.style.cssText = [
      'display:flex;align-items:center;gap:10px;padding:8px;border-radius:7px;cursor:pointer',
      'transition:background-color var(--dur-fast) var(--ease-out)',
      isActive
        ? 'background:rgba(0,0,0,0.05);color:var(--text-primary)'
        : 'color:var(--text-secondary)'
    ].join(';');
    item.addEventListener('click', () => {
      state.currentSection = i;
      state.currentPage = 0;
      _render();
    });
    if (!isActive) {
      item.addEventListener('mouseenter', () => {
        item.style.background = 'rgba(0,0,0,0.03)';
      });
      item.addEventListener('mouseleave', () => {
        item.style.background = 'transparent';
      });
    }

    const mark = document.createElement('span');
    mark.style.cssText =
      'flex:0 0 auto;width:18px;height:18px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:600;font-family:var(--font-mono);' +
      (s.understood
        ? 'background:var(--green-500);color:#fff'
        : 'border:1px solid var(--border-strong);color:var(--text-quaternary)');
    if (s.understood) {
      mark.innerHTML =
        '<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
    } else {
      mark.textContent = String(i + 1);
    }

    const label = document.createElement('span');
    label.style.cssText =
      'font-size:12.5px;font-weight:500;line-height:1.35;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical';
    label.textContent = s.title;

    item.appendChild(mark);
    item.appendChild(label);
    sidebar.appendChild(item);
  });

  // ── CENTER: page ──────────────────────────────────────────────
  const center = document.createElement('div');
  center.style.cssText =
    'overflow-y:auto;padding:22px 26px;display:flex;flex-direction:column;gap:16px;min-width:0;min-height:0';
  const sec = state.sections[state.currentSection];
  const page = sec?.pages[state.currentPage] ?? sec?.pages[0];

  // Slide card
  const slide = document.createElement('div');
  if (page?.imageBase64) {
    slide.style.cssText =
      'background:var(--surface-card);border:1px solid var(--border-default);border-radius:10px;box-shadow:0 2px 12px rgba(0,0,0,0.07);overflow:hidden';
    const img = document.createElement('img');
    img.src = `data:image/jpeg;base64,${page.imageBase64}`;
    img.style.cssText = 'display:block;width:100%;height:auto';
    slide.appendChild(img);
  } else {
    slide.style.cssText =
      'background:var(--surface-card);border:1px solid var(--border-default);border-radius:10px;box-shadow:0 2px 12px rgba(0,0,0,0.07);padding:34px 40px;display:flex;flex-direction:column;gap:18px;min-height:0';
    const eyebrow = document.createElement('span');
    eyebrow.style.cssText =
      'font-size:11px;font-weight:600;color:var(--accent-text);text-transform:uppercase;letter-spacing:0.08em';
    eyebrow.textContent = sec?.title ?? '';
    const body = document.createElement('div');
    body.style.cssText =
      'font-size:clamp(13px, 1.4vw, 15px);color:var(--text-secondary);line-height:1.6;white-space:pre-wrap;font-family:var(--font-sans)';
    body.textContent = page?.text || '(empty)';
    slide.appendChild(eyebrow);
    slide.appendChild(body);
  }
  center.appendChild(slide);

  // Nav row + understood toggle
  const navRow = document.createElement('div');
  navRow.style.cssText =
    'display:flex;align-items:center;gap:10px;flex-wrap:wrap';

  const prevBtn = _btn('← Prev', 'secondary');
  const atStart = state.currentSection === 0 && state.currentPage === 0;
  prevBtn.disabled = atStart;
  if (atStart) prevBtn.style.opacity = '0.45';
  prevBtn.addEventListener('click', () => {
    if (state.currentPage > 0) state.currentPage--;
    else if (state.currentSection > 0) {
      state.currentSection--;
      state.currentPage = state.sections[state.currentSection].pages.length - 1;
    }
    _render();
  });
  navRow.appendChild(prevBtn);

  const pageCount = document.createElement('span');
  pageCount.style.cssText =
    'font-size:12px;color:var(--text-quaternary);font-family:var(--font-mono);white-space:nowrap';
  pageCount.textContent = sec
    ? `page ${state.currentPage + 1} of ${sec.pages.length}`
    : '';
  navRow.appendChild(pageCount);

  const nextBtn = _btn('Next →', 'secondary');
  const atEnd =
    !sec ||
    (state.currentPage >= sec.pages.length - 1 &&
      state.currentSection >= state.sections.length - 1);
  nextBtn.disabled = atEnd;
  if (atEnd) nextBtn.style.opacity = '0.45';
  nextBtn.addEventListener('click', () => {
    if (sec && state.currentPage < sec.pages.length - 1) state.currentPage++;
    else if (state.currentSection < state.sections.length - 1) {
      state.currentSection++;
      state.currentPage = 0;
    }
    _render();
  });
  navRow.appendChild(nextBtn);

  const navSpacer = document.createElement('span');
  navSpacer.style.flex = '1';
  navRow.appendChild(navSpacer);

  // Understood toggle pill
  const uOn = !!sec?.understood;
  const uBtn = document.createElement('div');
  uBtn.style.cssText = [
    'display:flex;align-items:center;gap:8px;padding:6px 12px;border-radius:7px;cursor:pointer;white-space:nowrap',
    'transition:border-color var(--dur-fast) var(--ease-out)',
    `border:1px solid ${uOn ? 'rgba(23,138,84,0.45)' : 'var(--border-default)'}`,
    uOn ? 'background:var(--green-bg)' : ''
  ].join(';');
  const uDot = document.createElement('span');
  uDot.style.cssText =
    'width:15px;height:15px;border-radius:50%;display:flex;align-items:center;justify-content:center;' +
    (uOn ? 'background:var(--green-500)' : 'border:1.5px solid var(--border-strong)');
  if (uOn) {
    uDot.innerHTML =
      '<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg>';
  }
  const uText = document.createElement('span');
  uText.style.cssText =
    'font-size:12.5px;font-weight:500;color:var(--text-primary)';
  uText.textContent = uOn ? 'Section understood' : 'Mark section understood';
  uBtn.appendChild(uDot);
  uBtn.appendChild(uText);
  uBtn.title = 'U';
  uBtn.addEventListener('mouseenter', () => {
    uBtn.style.borderColor = uOn ? 'rgba(23,138,84,0.45)' : 'var(--border-strong)';
  });
  uBtn.addEventListener('click', () => _toggleUnderstood());
  navRow.appendChild(uBtn);
  center.appendChild(navRow);

  // ── RIGHT: study panel ────────────────────────────────────────
  const panel = document.createElement('div');
  panel.style.cssText =
    'border-left:1px solid var(--border-subtle);background:var(--bg-app);overflow-y:auto;display:flex;flex-direction:column;min-height:0';

  const tabHead = document.createElement('div');
  tabHead.style.cssText =
    'display:flex;gap:2px;padding:10px 12px;border-bottom:1px solid var(--border-subtle);flex-shrink:0';
  const tabs: Array<{ id: IReaderState['activeTab']; label: string }> = [
    { id: 'quiz', label: 'Quiz' },
    { id: 'flashcards', label: 'Flashcards' }
  ];
  tabs.forEach(t => {
    const b = document.createElement('span');
    const on = state.activeTab === t.id;
    b.textContent = t.label;
    b.style.cssText = [
      'flex:1;text-align:center;padding:6px 0;border-radius:6px;font-size:12px;font-weight:500;cursor:pointer',
      'transition:background-color var(--dur-fast) var(--ease-out)',
      on
        ? 'background:var(--accent-subtle-bg);color:var(--accent-text)'
        : 'color:var(--text-tertiary)'
    ].join(';');
    if (!on) {
      b.addEventListener('mouseenter', () => {
        b.style.color = 'var(--text-primary)';
      });
      b.addEventListener('mouseleave', () => {
        b.style.color = 'var(--text-tertiary)';
      });
    }
    b.addEventListener('click', () => {
      state.activeTab = t.id;
      _render();
    });
    tabHead.appendChild(b);
  });

  const tabContent = document.createElement('div');
  tabContent.style.cssText =
    'padding:14px;display:flex;flex-direction:column;gap:12px';
  if (state.activeTab === 'quiz') _renderQuizTab(tabContent);
  else _renderFlashcardsTab(tabContent);

  panel.appendChild(tabHead);
  panel.appendChild(tabContent);

  content.appendChild(sidebar);
  content.appendChild(center);
  content.appendChild(panel);
}

// ── Quiz tab ───────────────────────────────────────────────────

function _renderQuizTab(host: HTMLElement): void {
  const sec = state.sections[state.currentSection];

  if (state.quizLoading) {
    const sp = spinner('Generating quiz…');
    host.appendChild(sp);
    return;
  }

  if (state.quizDone && state.quizAnswers.length > 0) {
    _renderQuizReport(host);
    return;
  }

  if (state.quizQuestions && state.quizIdx < state.quizQuestions.length) {
    _renderQuizQuestion(host);
    return;
  }

  // Idle: centered prompt (prototype)
  const idle = document.createElement('div');
  idle.style.cssText =
    'display:flex;flex-direction:column;align-items:center;gap:10px;padding:26px 12px;text-align:center';
  idle.innerHTML =
    '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--text-quaternary)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>' +
    `<span style="font-size:12.5px;color:var(--text-tertiary);line-height:1.5">Test yourself on “${sec?.title ?? 'this section'}” with 5 AI-generated questions.</span>`;
  host.appendChild(idle);

  const genBtn = _btn('Generate quiz', 'primary');
  genBtn.disabled = !isAiReady() || !sec?.text;
  idle.appendChild(genBtn);
  genBtn.addEventListener('click', async () => {
    state.quizLoading = true;
    state.quizQuestions = null;
    state.quizAnswers = [];
    state.quizIdx = 0;
    state.quizDone = false;
    host.innerHTML = '';
    host.appendChild(spinner('Generating quiz…'));
    try {
      const text = sec.text.substring(0, 2000);
      const prompt = `Generate exactly 5 quiz questions about this text. Return ONLY a valid JSON array with one question of each type: multiple_choice, true_false, fill_blank, matching, open_answer.
Format: [{"type":"multiple_choice","question":"...","options":["A","B","C","D"],"correct_answer":"A","explanation":"..."},{"type":"true_false","question":"...","options":["True","False"],"correct_answer":"True","explanation":"..."},{"type":"fill_blank","question":"The ___ is ...","options":[],"correct_answer":"single word","explanation":"..."},{"type":"matching","question":"Match the terms","options":["Term1: Def1","Term2: Def2","Term3: Def3"],"correct_answer":["Def1","Def2","Def3"],"explanation":"..."},{"type":"open_answer","question":"Explain in your own words...","options":[],"correct_answer":"model answer here","explanation":"..."}]`;
      const raw = await askAboutCell(text, prompt, []);
      const match = raw.match(/\[[\s\S]*\]/);
      if (!match) throw new Error('No JSON array in response');
      const questions = JSON.parse(match[0]) as IQuizQuestion[];
      state.quizQuestions = questions.slice(0, 5);
      state.quizLoading = false;
      if (isConnected()) {
        await addPoints(2, 'reader_quiz_start', state.docTitle).catch(() => null);
        pointsEngine.addPoints(2, 'reader_quiz_start');
      }
    } catch {
      state.quizLoading = false;
      state.quizQuestions = null;
    }
    host.innerHTML = '';
    _renderQuizTab(host);
  });

  if (!isAiReady()) {
    const warn = document.createElement('span');
    warn.style.cssText = 'font-size:11.5px;color:var(--text-quaternary)';
    warn.textContent = 'Set GEMINI_API_KEY to enable the quiz.';
    idle.appendChild(warn);
  }
}

function _renderQuizQuestion(host: HTMLElement): void {
  const qs = state.quizQuestions!;
  const q = qs[state.quizIdx];
  const total = qs.length;

  const typeLabel: Record<string, string> = {
    multiple_choice: 'Multiple choice', true_false: 'True or false',
    fill_blank: 'Fill in the blank', matching: 'Matching', open_answer: 'Open answer'
  };

  const meta = document.createElement('div');
  meta.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:6px';
  meta.innerHTML =
    `<span style="font-size:11px;color:var(--text-quaternary);font-family:var(--font-mono)">Question ${state.quizIdx + 1} / ${total}</span>` +
    '<span style="flex:1"></span>' +
    `<span style="font-size:11px;font-weight:600;color:var(--accent-text);text-transform:uppercase;letter-spacing:0.05em">${typeLabel[q.type] || q.type}</span>`;
  host.appendChild(meta);

  const qEl = document.createElement('div');
  qEl.style.cssText =
    'font-size:13px;font-weight:500;color:var(--text-primary);margin-bottom:12px;line-height:1.5';
  qEl.textContent = q.question;
  host.appendChild(qEl);

  const feedback = document.createElement('div');
  const submitArea = document.createElement('div');

  const doSubmit = (answer: string | string[]) => {
    let correct = false;
    if (q.type === 'matching') {
      const a = answer as string[];
      const c = q.correct_answer as string[];
      correct = Array.isArray(a) && a.every((v, i) => v.trim().toLowerCase() === (c[i] || '').trim().toLowerCase());
    } else if (q.type === 'open_answer') {
      correct = true; // AI-evaluated shown in feedback
    } else if (q.type === 'fill_blank') {
      correct = (answer as string).trim().toLowerCase() === (q.correct_answer as string).toLowerCase().trim();
    } else {
      correct = answer === q.correct_answer;
    }
    state.quizAnswers.push({ question: q, user_answer: answer, correct, feedback: q.explanation });

    feedback.innerHTML = '';
    feedback.style.cssText = `margin-top:10px;padding:8px 11px;border-radius:6px;font-size:12.5px;line-height:1.5;${
      correct
        ? 'background:var(--green-bg);color:var(--green-400);border:1px solid rgba(23,138,84,0.35)'
        : 'background:var(--red-bg);color:var(--red-400);border:1px solid rgba(192,52,52,0.32)'
    }`;
    feedback.textContent = `${correct ? 'Correct!' : 'Not quite.'} ${q.explanation}`;

    submitArea.innerHTML = '';
    const nextBtn = _btn(
      state.quizIdx < qs.length - 1 ? 'Next question' : 'See score',
      'primary'
    );
    nextBtn.style.cssText += ';margin-top:10px';
    nextBtn.addEventListener('click', async () => {
      if (state.quizIdx < qs.length - 1) {
        state.quizIdx++;
        host.innerHTML = '';
        _renderQuizQuestion(host);
      } else {
        state.quizDone = true;
        const score = state.quizAnswers.filter(a => a.correct).length;
        const xp = score * 2 + (score === qs.length ? 10 : 0);
        if (isConnected()) {
          await addPoints(xp, 'reader_quiz_complete', state.docTitle).catch(() => null);
        }
        pointsEngine.addPoints(xp, 'reader_quiz');
        host.innerHTML = '';
        _renderQuizReport(host);
      }
    });
    submitArea.appendChild(nextBtn);
    _renderAnswerOptions(host, q, doSubmit);
  };

  _renderAnswerOptions(host, q, doSubmit);
  host.appendChild(feedback);
  host.appendChild(submitArea);
}

function _renderAnswerOptions(host: HTMLElement, q: IQuizQuestion, onSubmit: (a: string | string[]) => void): void {
  // Remove existing answer area
  const existing = host.querySelector('.answer-area');
  if (existing) existing.remove();

  const area = document.createElement('div');
  area.className = 'answer-area';

  const OPT_BASE =
    'padding:8px 11px;border-radius:7px;font-size:12.5px;cursor:pointer;background:var(--bg-base);transition:border-color var(--dur-fast) var(--ease-out);border:1px solid var(--border-subtle);color:var(--text-primary)';

  if (q.type === 'multiple_choice' || q.type === 'true_false') {
    const opts = q.type === 'true_false' ? ['True', 'False'] : q.options;
    if (q.type === 'true_false') area.style.cssText = 'display:flex;gap:8px';
    opts.forEach(opt => {
      const btn = document.createElement('div');
      btn.textContent = opt;
      btn.style.cssText =
        OPT_BASE +
        (q.type === 'true_false'
          ? ';flex:1;text-align:center'
          : ';margin-bottom:6px');
      btn.addEventListener('mouseenter', () => {
        if (!btn.dataset.done) btn.style.borderColor = 'var(--border-strong)';
      });
      btn.addEventListener('mouseleave', () => {
        if (!btn.dataset.done) btn.style.borderColor = 'var(--border-subtle)';
      });
      btn.addEventListener('click', () => {
        if (btn.dataset.done) return;
        area.querySelectorAll('div').forEach(b => {
          (b as HTMLElement).dataset.done = '1';
          (b as HTMLElement).style.cursor = 'default';
        });
        // Color the correct answer green, a wrong pick red.
        const answer = String(q.correct_answer);
        area.querySelectorAll('div').forEach(b => {
          const el = b as HTMLElement;
          if (el.textContent === answer) el.style.borderColor = 'var(--green-400)';
        });
        if (opt !== answer) btn.style.borderColor = 'var(--red-500)';
        onSubmit(opt);
      });
      area.appendChild(btn);
    });
  } else if (q.type === 'fill_blank') {
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Type your answer…';
    input.style.cssText =
      'width:100%;box-sizing:border-box;height:34px;padding:0 11px;background:var(--bg-base);border:1px solid var(--border-strong);border-radius:7px;font-size:12.5px;font-family:var(--font-sans);outline:none;color:var(--text-primary);margin-bottom:8px';
    input.addEventListener('focus', () => {
      input.style.borderColor = 'var(--accent)';
    });
    input.addEventListener('blur', () => {
      input.style.borderColor = 'var(--border-strong)';
    });
    const submitBtn = _btn('Check', 'primary');
    submitBtn.addEventListener('click', () => {
      if (input.value.trim()) {
        input.disabled = true;
        submitBtn.style.display = 'none';
        onSubmit(input.value.trim());
      }
    });
    input.addEventListener('keydown', e => {
      if (e.key === 'Enter' && input.value.trim()) submitBtn.click();
    });
    area.appendChild(input);
    area.appendChild(submitBtn);
  } else if (q.type === 'open_answer') {
    const ta = document.createElement('textarea');
    ta.placeholder = 'Answer in your own words…';
    ta.rows = 3;
    ta.style.cssText =
      'width:100%;box-sizing:border-box;resize:vertical;background:var(--bg-base);color:var(--text-primary);border:1px solid var(--border-strong);border-radius:7px;padding:9px 11px;font-family:var(--font-sans);font-size:12.5px;line-height:1.5;outline:none;margin-bottom:8px';
    ta.addEventListener('focus', () => {
      ta.style.borderColor = 'var(--accent)';
    });
    ta.addEventListener('blur', () => {
      ta.style.borderColor = 'var(--border-strong)';
    });
    const submitBtn = _btn('Check', 'primary');
    submitBtn.addEventListener('click', () => {
      if (ta.value.trim()) {
        ta.disabled = true;
        submitBtn.style.display = 'none';
        onSubmit(ta.value.trim());
      }
    });
    area.appendChild(ta);
    area.appendChild(submitBtn);
  } else if (q.type === 'matching') {
    const terms = q.options.map(o => o.split(':')[0]?.trim() ?? o);
    const defs = (q.correct_answer as string[]).slice();
    const shuffled = [...defs].sort(() => Math.random() - 0.5);
    const selects: HTMLSelectElement[] = [];
    terms.forEach(term => {
      const row = document.createElement('div');
      row.style.cssText =
        'display:flex;align-items:center;gap:8px;margin-bottom:8px';
      const lbl = document.createElement('span');
      lbl.style.cssText =
        'flex:0 0 92px;font-size:12px;font-weight:600;color:var(--text-primary);font-family:var(--font-mono);overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
      lbl.textContent = term;
      const sel = document.createElement('select');
      sel.style.cssText =
        'flex:1;min-width:0;background:var(--bg-base);color:var(--text-secondary);border:1px solid var(--border-strong);border-radius:6px;padding:6px 8px;font-size:12px;font-family:var(--font-sans);outline:none';
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = '— pick the definition —';
      sel.appendChild(placeholder);
      shuffled.forEach(d => {
        const o = document.createElement('option');
        o.value = d;
        o.textContent = d.length > 40 ? d.substring(0, 40) + '…' : d;
        sel.appendChild(o);
      });
      selects.push(sel);
      row.appendChild(lbl);
      row.appendChild(sel);
      area.appendChild(row);
    });
    const submitBtn = _btn('Check', 'primary');
    submitBtn.addEventListener('click', () => {
      const answers = selects.map(s => s.value);
      if (answers.every(a => a)) {
        selects.forEach(s => (s.disabled = true));
        submitBtn.style.display = 'none';
        onSubmit(answers);
      }
    });
    area.appendChild(submitBtn);
  }

  host.appendChild(area);
}

function _renderQuizReport(host: HTMLElement): void {
  const score = state.quizAnswers.filter(a => a.correct).length;
  const total = state.quizAnswers.length;

  const done = document.createElement('div');
  done.style.cssText =
    'display:flex;flex-direction:column;align-items:center;gap:10px;padding:22px 12px;text-align:center';
  const msg =
    score === total
      ? 'Perfect score — this section is yours.'
      : score >= Math.ceil(total * 0.6)
      ? 'Solid. Review the misses, then try a fresh quiz.'
      : 'Worth re-reading the section before retrying.';
  done.innerHTML =
    `<span style="font-size:26px;font-weight:600;color:var(--accent-text);font-family:var(--font-mono)">${score} / ${total}</span>` +
    `<span style="font-size:12.5px;color:var(--text-tertiary);line-height:1.5">${msg}<br/>+${score * 2 + (score === total ? 10 : 0)} XP earned</span>`;

  const retryBtn = _btn('Try a new quiz', 'secondary');
  retryBtn.addEventListener('click', () => {
    state.quizQuestions = null;
    state.quizAnswers = [];
    state.quizIdx = 0;
    state.quizDone = false;
    host.innerHTML = '';
    _renderQuizTab(host);
  });
  done.appendChild(retryBtn);
  host.appendChild(done);
}

// ── Flashcards tab ─────────────────────────────────────────────

function _renderFlashcardsTab(host: HTMLElement): void {
  if (state.fcGenerating) {
    host.appendChild(spinner('Generating flashcards…'));
    return;
  }

  const secCards = state.flashcards.filter(c => c.section_index === state.currentSection);
  const dueCards = state.flashcards.filter(isDue);
  const allCards = state.flashcards;

  const viewCards = state.fcViewMode === 'section' ? secCards
    : state.fcViewMode === 'due' ? dueCards : allCards;

  // Filter segmented (prototype: inset track, white active thumb)
  if (!state.fcStudying) {
    const track = document.createElement('div');
    track.style.cssText =
      'display:flex;gap:2px;background:var(--bg-base);border:1px solid var(--border-subtle);border-radius:8px;padding:3px;margin-bottom:12px';
    (
      [
        ['section', `This section (${secCards.length})`],
        ['due', `Due (${dueCards.length})`],
        ['all', `All (${allCards.length})`]
      ] as const
    ).forEach(([mode, label]) => {
      const b = document.createElement('span');
      b.textContent = label;
      const on = state.fcViewMode === mode;
      b.style.cssText =
        'flex:1;text-align:center;padding:5px 0;border-radius:5px;font-size:11.5px;font-weight:500;cursor:pointer;white-space:nowrap;' +
        (on
          ? 'background:var(--bg-panel);color:var(--text-primary);box-shadow:0 1px 2px rgba(0,0,0,0.14), 0 0 0 1px var(--border-default)'
          : 'color:var(--text-tertiary)');
      b.addEventListener('click', () => {
        state.fcViewMode = mode;
        host.innerHTML = '';
        _renderFlashcardsTab(host);
      });
      track.appendChild(b);
    });
    host.appendChild(track);
  }

  if (state.fcStudying && state.fcStudyCards.length > 0) {
    _renderStudyMode(host);
    return;
  }

  if (viewCards.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText =
      'display:flex;flex-direction:column;align-items:center;gap:10px;padding:22px 12px;text-align:center';
    const msg =
      state.fcViewMode === 'due'
        ? allCards.length
          ? 'Nothing due right now — your cards are resting.'
          : 'No cards yet — generate some from a section first.'
        : `No flashcards for this ${state.fcViewMode === 'all' ? 'document' : 'section'} yet. Generate them from the key terms.`;
    empty.innerHTML =
      '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--text-quaternary)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="16" height="12" rx="2"></rect><path d="M22 4v12"></path></svg>' +
      `<span style="font-size:12.5px;color:var(--text-tertiary);line-height:1.5">${msg}</span>`;
    const genBtn = _btn('Generate cards', 'primary');
    genBtn.disabled = !isAiReady();
    genBtn.addEventListener('click', () => _generateFlashcards(host));
    empty.appendChild(genBtn);
    if (!isAiReady()) {
      const w = document.createElement('span');
      w.style.cssText = 'font-size:11.5px;color:var(--text-quaternary)';
      w.textContent = 'Set GEMINI_API_KEY to generate flashcards.';
      empty.appendChild(w);
    }
    host.appendChild(empty);
    return;
  }

  // Card list rows (prototype)
  const listWrap = document.createElement('div');
  listWrap.style.cssText = 'display:flex;flex-direction:column;gap:6px';
  viewCards.forEach(c => {
    const lvl =
      c.review_state === 'mastered'
        ? 'mastered'
        : c.repetitions > 0
        ? `lvl ${Math.min(c.repetitions, 4)}`
        : 'new';
    const lvlStyle =
      c.review_state === 'mastered'
        ? 'background:var(--green-bg);color:var(--green-500)'
        : c.repetitions > 0
        ? 'background:var(--accent-subtle-bg);color:var(--accent-text)'
        : 'background:var(--gray-800);color:var(--text-quaternary)';
    const item = document.createElement('div');
    item.style.cssText =
      'display:flex;align-items:center;gap:10px;padding:9px 11px;background:var(--bg-panel);border:1px solid var(--border-subtle);border-radius:7px';
    item.innerHTML =
      `<span style="font-size:12.5px;font-weight:600;font-family:var(--font-mono);flex:0 0 auto;color:var(--text-primary);max-width:45%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${c.front}</span>` +
      `<span style="font-size:11.5px;color:var(--text-quaternary);flex:1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${c.back}</span>` +
      `<span style="flex:0 0 auto;font-size:10px;font-weight:600;text-transform:uppercase;letter-spacing:0.05em;padding:2px 7px;border-radius:999px;${lvlStyle}">${lvl}</span>`;
    listWrap.appendChild(item);
  });
  host.appendChild(listWrap);

  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:8px;margin-top:4px';
  const studyBtn = _btn(`Study ${viewCards.length} cards`, 'primary');
  studyBtn.addEventListener('click', () => {
    state.fcStudyCards = [...viewCards].sort(() => Math.random() - 0.5);
    state.fcIdx = 0;
    state.fcFlipped = false;
    state.fcStudying = true;
    host.innerHTML = '';
    _renderFlashcardsTab(host);
  });
  const regenBtn = _btn('Generate more', 'ghost');
  regenBtn.disabled = !isAiReady();
  regenBtn.addEventListener('click', () => _generateFlashcards(host));
  btnRow.appendChild(studyBtn);
  btnRow.appendChild(regenBtn);
  host.appendChild(btnRow);
}

function _renderStudyMode(host: HTMLElement): void {
  const card = state.fcStudyCards[state.fcIdx];
  const total = state.fcStudyCards.length;

  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;flex-direction:column;gap:10px';

  const progress = document.createElement('span');
  progress.style.cssText =
    'font-size:11px;color:var(--text-quaternary);font-family:var(--font-mono)';
  progress.textContent = `Card ${state.fcIdx + 1} / ${total}`;
  wrap.appendChild(progress);

  const cardEl = document.createElement('div');
  cardEl.style.cssText = [
    'min-height:130px;background:var(--surface-card);border:1px solid var(--border-strong);border-radius:10px',
    'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px;padding:18px',
    'cursor:pointer;text-align:center;box-shadow:0 2px 10px rgba(0,0,0,0.06);transition:border-color var(--dur-fast) var(--ease-out)'
  ].join(';');
  cardEl.addEventListener('mouseenter', () => {
    cardEl.style.borderColor = 'var(--accent)';
  });
  cardEl.addEventListener('mouseleave', () => {
    cardEl.style.borderColor = 'var(--border-strong)';
  });

  const sideLbl = document.createElement('span');
  sideLbl.style.cssText =
    'font-size:10px;font-weight:600;color:var(--text-quaternary);text-transform:uppercase;letter-spacing:0.08em';
  sideLbl.textContent = state.fcFlipped ? 'Answer' : 'Term';

  const cardText = document.createElement('span');
  cardText.style.cssText = state.fcFlipped
    ? 'font-size:13px;color:var(--text-secondary);line-height:1.55'
    : 'font-size:17px;font-weight:600;font-family:var(--font-mono);color:var(--text-primary)';
  cardText.textContent = state.fcFlipped ? card.back : card.front;

  cardEl.appendChild(sideLbl);
  cardEl.appendChild(cardText);
  if (!state.fcFlipped) {
    const flipHint = document.createElement('span');
    flipHint.style.cssText = 'font-size:11px;color:var(--text-quaternary)';
    flipHint.textContent = 'Click to flip';
    cardEl.appendChild(flipHint);
  }
  cardEl.addEventListener('click', () => {
    state.fcFlipped = !state.fcFlipped;
    host.innerHTML = '';
    _renderFlashcardsTab(host);
  });
  wrap.appendChild(cardEl);

  if (state.fcFlipped) {
    const ratingRow = document.createElement('div');
    ratingRow.style.cssText =
      'display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:6px';
    const ratings: Array<[CardRating, string, string]> = [
      ['again', 'Again', 'var(--red-400)'],
      ['good', 'Good', 'var(--text-secondary)'],
      ['easy', 'Easy', 'var(--brand-300)'],
      ['mastered', 'Mastered', 'var(--green-400)']
    ];
    ratings.forEach(([rating, label, color]) => {
      const rb = document.createElement('div');
      rb.style.cssText = `text-align:center;padding:7px 0;border-radius:7px;font-size:11.5px;font-weight:600;cursor:pointer;border:1px solid var(--border-strong);color:${color};transition:background-color var(--dur-fast) var(--ease-out)`;
      rb.textContent = label;
      rb.addEventListener('mouseenter', () => {
        rb.style.background = 'var(--alpha-6)';
      });
      rb.addEventListener('mouseleave', () => {
        rb.style.background = 'transparent';
      });
      rb.addEventListener('click', () => _rateCard(card, rating, host));
      ratingRow.appendChild(rb);
    });
    wrap.appendChild(ratingRow);
  }

  const exitBtn = _btn('Exit study', 'ghost');
  exitBtn.addEventListener('click', () => {
    state.fcStudying = false;
    state.fcFlipped = false;
    host.innerHTML = '';
    _renderFlashcardsTab(host);
  });
  wrap.appendChild(exitBtn);
  host.appendChild(wrap);
}

async function _rateCard(card: IFlashcard, rating: CardRating, host: HTMLElement): Promise<void> {
  const updates = computeNextInterval(card, rating);
  const updated = { ...card, ...updates };
  state.flashcards = state.flashcards.map(c => c.id === card.id ? updated : c);
  if (card.id && isConnected()) {
    await updateFlashcard(card.id, updates).catch(() => null);
    const pts = rating === 'easy' || rating === 'mastered' ? 3 : 1;
    await addPoints(pts, `flashcard_${rating}`, state.docTitle).catch(() => null);
    pointsEngine.addPoints(pts, `fc_${rating}`);
  }
  state.fcFlipped = false;
  if (state.fcIdx < state.fcStudyCards.length - 1) {
    state.fcIdx++;
    host.innerHTML = '';
    _renderFlashcardsTab(host);
  } else {
    state.fcStudying = false;
    host.innerHTML = '';
    // Session complete (prototype)
    const done = document.createElement('div');
    done.style.cssText =
      'display:flex;flex-direction:column;align-items:center;gap:10px;padding:22px 12px;text-align:center';
    done.innerHTML =
      '<span style="font-size:14px;font-weight:600;color:var(--text-primary)">Session finished</span>' +
      `<span style="font-size:12.5px;color:var(--text-tertiary)">${state.fcStudyCards.length} reviews · spaced repetition schedules the next round.</span>`;
    const backBtn = _btn('Back to cards', 'secondary');
    backBtn.addEventListener('click', () => {
      host.innerHTML = '';
      _renderFlashcardsTab(host);
    });
    done.appendChild(backBtn);
    host.appendChild(done);
  }
}

async function _generateFlashcards(host: HTMLElement): Promise<void> {
  const sec = state.sections[state.currentSection];
  if (!sec || !isAiReady()) return;
  state.fcGenerating = true;
  host.innerHTML = '';
  host.appendChild(spinner('Generating flashcards…'));

  const startIdx = Math.max(0, state.currentSection - 1);
  const endIdx = Math.min(state.sections.length - 1, state.currentSection + 1);
  const ctx = state.sections.slice(startIdx, endIdx + 1).map(s => s.text).join('\n').substring(0, 2000);

  const cardTypes = ['term_definition', 'concept_example', 'fill_blank', 'key_claim', 'relationship'];
  const prompt = `Create 5 flashcards from this content. Return ONLY a JSON array:
[{"front":"term or question","back":"definition or answer","card_type":"${cardTypes.join('|')}"},...]
Use a different card_type for each card. Cover key concepts, definitions, and relationships.`;

  try {
    const raw = await askAboutCell(ctx, prompt, []);
    const match = raw.match(/\[[\s\S]*\]/);
    if (!match) throw new Error('No JSON array');
    const cards = JSON.parse(match[0]) as Array<{ front: string; back: string; card_type: string }>;

    if (isConnected() && state.docId) {
      const inserted = await upsertFlashcardsForSection(state.docId, state.currentSection, sec.title, cards);
      // Remove old section cards and add new ones
      state.flashcards = state.flashcards.filter(c => c.section_index !== state.currentSection);
      state.flashcards.push(...inserted);
      await addPoints(15, 'reader_flashcards', state.docTitle).catch(() => null);
    } else {
      const now = new Date().toISOString();
      const local = cards.map((c, i) => ({
        id: `local-${Date.now()}-${i}`,
        section_index: state.currentSection,
        section_title: sec.title,
        front: c.front,
        back: c.back,
        card_type: c.card_type || 'term_definition',
        due_at: now,
        interval_days: 0,
        ease_factor: 2.5,
        repetitions: 0,
        review_state: 'new' as const
      }));
      state.flashcards = state.flashcards.filter(c => c.section_index !== state.currentSection);
      state.flashcards.push(...local);
    }
    pointsEngine.addPoints(15, 'reader_flashcards');
  } catch {
    // ignore
  }
  state.fcGenerating = false;
  host.innerHTML = '';
  _renderFlashcardsTab(host);
}

// ── Helpers ────────────────────────────────────────────────────

function _toggleUnderstood(): void {
  const sec = state.sections[state.currentSection];
  if (!sec) return;
  sec.understood = !sec.understood;
  if (isConnected() && state.docId) {
    updateDocumentSections(state.docId, state.sections.map(s => ({ index: s.index, understood: s.understood }))).catch(() => null);
  }
  _render();
}

/** Small (28px) DS button — reader panels use the sm size throughout. */
function _btn(
  label: string,
  variant: 'primary' | 'accent' | 'secondary' | 'ghost'
): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = label;
  const base =
    'display:inline-flex;align-items:center;justify-content:center;gap:6px;height:var(--control-sm);padding:0 10px;box-sizing:border-box;font-family:var(--font-sans);font-size:12px;font-weight:500;line-height:1;letter-spacing:-0.01em;border-radius:var(--radius-control);border:1px solid transparent;cursor:pointer;user-select:none;white-space:nowrap;transition:background-color var(--dur-fast) var(--ease-out),border-color var(--dur-fast) var(--ease-out)';
  const styles: Record<string, string> = {
    primary:
      'background:var(--accent);color:var(--text-onbrand);box-shadow:var(--shadow-brand)',
    accent:
      'background:var(--accent);color:var(--text-onbrand);box-shadow:var(--shadow-brand)',
    secondary:
      'background:var(--alpha-6);color:var(--text-primary);border-color:var(--border-default)',
    ghost: 'background:transparent;color:var(--text-secondary)'
  };
  b.style.cssText = `${base};${styles[variant]}`;
  b.addEventListener('mouseenter', () => {
    if (b.disabled) return;
    if (variant === 'primary' || variant === 'accent') {
      b.style.background = 'var(--accent-hover)';
    } else if (variant === 'secondary') {
      b.style.background = 'var(--alpha-10)';
      b.style.borderColor = 'var(--border-strong)';
    } else {
      b.style.background = 'var(--alpha-6)';
      b.style.color = 'var(--text-primary)';
    }
  });
  b.addEventListener('mouseleave', () => {
    if (variant === 'primary' || variant === 'accent') {
      b.style.background = 'var(--accent)';
    } else if (variant === 'secondary') {
      b.style.background = 'var(--alpha-6)';
      b.style.borderColor = 'var(--border-default)';
    } else {
      b.style.background = 'transparent';
      b.style.color = 'var(--text-secondary)';
    }
  });
  return b;
}

// ── Keyboard shortcuts ─────────────────────────────────────────

function _installKeyboard(): void {
  const handler = (e: KeyboardEvent) => {
    const tag = (document.activeElement?.tagName || '').toLowerCase();
    if (['input', 'textarea', 'select'].includes(tag)) return;
    if (!state.doc) return;
    if (e.key === 'ArrowRight') {
      e.preventDefault();
      const sec = state.sections[state.currentSection];
      if (sec && state.currentPage < sec.pages.length - 1) state.currentPage++;
      else if (state.currentSection < state.sections.length - 1) { state.currentSection++; state.currentPage = 0; }
      _render();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      if (state.currentPage > 0) state.currentPage--;
      else if (state.currentSection > 0) { state.currentSection--; state.currentPage = state.sections[state.currentSection].pages.length - 1; }
      _render();
    } else if (e.key === 'u' || e.key === 'U') {
      e.preventDefault();
      _toggleUnderstood();
    } else if (e.key === 'q' || e.key === 'Q') {
      e.preventDefault();
      state.activeTab = 'quiz';
      _render();
    } else if (e.key === 'f' || e.key === 'F') {
      e.preventDefault();
      state.activeTab = 'flashcards';
      _render();
    } else if (e.key === '?') {
      e.preventDefault();
      _showShortcuts();
    } else if (e.key === 'Escape') {
      state.isFullscreen = false;
      if (_onToggle) _onToggle(false);
      _render();
    }
    // Flashcard rating during study
    if (state.fcStudying && state.fcFlipped) {
      if (e.key === '1') { const c = state.fcStudyCards[state.fcIdx]; if (c) { const p = document.querySelector('.nm-fc-panel') as HTMLElement | null; _rateCard(c, 'again', p ?? document.body); }}
      else if (e.key === '2') { const c = state.fcStudyCards[state.fcIdx]; if (c) { const p = document.querySelector('.nm-fc-panel') as HTMLElement | null; _rateCard(c, 'good', p ?? document.body); }}
      else if (e.key === '3') { const c = state.fcStudyCards[state.fcIdx]; if (c) { const p = document.querySelector('.nm-fc-panel') as HTMLElement | null; _rateCard(c, 'easy', p ?? document.body); }}
    }
    if (state.fcStudying && !state.fcFlipped && (e.key === ' ' || e.key === 'Enter')) {
      e.preventDefault();
      state.fcFlipped = true;
      _render();
    }
  };
  document.removeEventListener('keydown', _kbHandler as EventListener);
  _kbHandler = handler;
  document.addEventListener('keydown', handler);
}

let _kbHandler: ((e: KeyboardEvent) => void) | null = null;

function _showShortcuts(): void {
  const overlay = document.createElement('div');
  overlay.style.cssText =
    'position:fixed;inset:0;z-index:2000;background:var(--surface-overlay);display:flex;align-items:center;justify-content:center';
  const box = document.createElement('div');
  box.style.cssText =
    'width:320px;background:var(--bg-elevated);border:1px solid var(--border-strong);border-radius:12px;padding:22px;display:flex;flex-direction:column;gap:12px;box-shadow:0 16px 48px rgba(0,0,0,0.14);animation:nm-rise 0.15s ease-out both';
  const rows = [
    ['← →', 'Previous / next page'],
    ['U', "Toggle 'understood' for this section"],
    ['Q', 'Quiz tab'],
    ['F', 'Flashcards tab'],
    ['Space', 'Flip flashcard'],
    ['1 / 2 / 3', 'Rate card: Again / Good / Easy'],
    ['Esc', 'Close this / back to library']
  ];
  box.innerHTML =
    '<span style="font-size:14px;font-weight:600;color:var(--text-primary)">Keyboard shortcuts</span>' +
    rows
      .map(
        ([k, v]) =>
          `<div style="display:flex;align-items:center;gap:10px"><span style="flex:0 0 64px;font-size:11.5px;font-family:var(--font-mono);color:var(--text-primary);background:var(--bg-panel);border:1px solid var(--border-strong);border-radius:5px;padding:2px 8px;text-align:center">${k}</span><span style="font-size:12.5px;color:var(--text-tertiary)">${v}</span></div>`
      )
      .join('');
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.remove();
  });
}
