import { IPageData, IExtractResult, extractPdfFull } from './pdfExtract';
import { isAiReady, askAboutCell } from './gemini';
import { isConnected } from './supabase';
import {
  upsertDocument, upsertSectionNote, getSectionNotes, addPoints,
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
  activeTab: 'notes' | 'quiz' | 'flashcards';
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
  activeTab: 'notes', isFullscreen: false
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
    fcViewMode: 'section', activeTab: 'notes'
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
  if (!_host || !_onToggle) return;
  const host = _host;
  const onToggleFullscreen = _onToggle;
  host.innerHTML = '';
  host.style.cssText = 'display:flex;flex-direction:column;height:100%;overflow:hidden;background:var(--nm-bg)';

  // Top bar
  const topBar = document.createElement('div');
  topBar.style.cssText = [
    'display:flex;align-items:center;justify-content:space-between',
    'padding:8px 14px;border-bottom:1px solid var(--nm-border)',
    'background:#fff;flex-shrink:0;gap:8px'
  ].join(';');

  const titleEl = document.createElement('div');
  titleEl.style.cssText = 'font-size:13px;font-weight:700;color:var(--nm-fg-strong);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;min-width:0';
  titleEl.textContent = state.doc ? `📄 ${state.docTitle}` : '📄 Slides & Papers';

  const rightBtns = document.createElement('div');
  rightBtns.style.cssText = 'display:flex;align-items:center;gap:6px;flex-shrink:0';

  if (state.doc) {
    const kbBtn = _topBtn('?', 'Keyboard shortcuts');
    kbBtn.addEventListener('click', () => _showShortcuts());
    rightBtns.appendChild(kbBtn);
  }

  const fsBtn = _topBtn(state.isFullscreen ? '⊙ Exit full' : '⊡ Full view', 'Toggle fullscreen reader');
  fsBtn.addEventListener('click', () => {
    state.isFullscreen = !state.isFullscreen;
    onToggleFullscreen(state.isFullscreen);
    _render();
  });
  rightBtns.appendChild(fsBtn);

  topBar.appendChild(titleEl);
  topBar.appendChild(rightBtns);
  host.appendChild(topBar);

  // Content
  const content = document.createElement('div');
  content.style.cssText = 'flex:1;overflow:hidden;display:flex;flex-direction:column;min-height:0';
  host.appendChild(content);

  if (!state.doc) {
    _renderUpload(content);
  } else if (!state.isFullscreen) {
    _renderCompact(content);
  } else {
    _renderFull(content);
    _installKeyboard();
  }
}

function _topBtn(label: string, title: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = label;
  b.title = title;
  b.style.cssText = 'background:none;border:1px solid var(--nm-border);border-radius:7px;padding:4px 9px;font-size:12px;cursor:pointer;color:var(--nm-fg-muted);white-space:nowrap';
  return b;
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

  zone.addEventListener('mouseenter', () => { zone.style.borderColor = 'var(--nm-primary)'; zone.style.background = '#fff7f4'; });
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

// ── Compact view (split mode) ──────────────────────────────────

function _renderCompact(content: HTMLElement): void {
  const sec = state.sections[state.currentSection];
  if (!sec) return;
  const page = sec.pages[state.currentPage] ?? sec.pages[0];

  content.style.cssText = 'flex:1;display:flex;flex-direction:column;overflow:hidden;min-height:0';

  // Section tabs (compact strip)
  if (state.sections.length > 1) {
    const strip = document.createElement('div');
    strip.style.cssText = 'display:flex;overflow-x:auto;background:#f4f3ef;border-bottom:1px solid var(--nm-border);flex-shrink:0;padding:0 4px';
    state.sections.forEach((s, i) => {
      const tab = document.createElement('button');
      tab.style.cssText = [
        'padding:6px 10px;font-size:11px;border:none;background:none;cursor:pointer;white-space:nowrap',
        `font-weight:${i === state.currentSection ? '700' : '400'}`,
        `color:${i === state.currentSection ? 'var(--nm-primary)' : 'var(--nm-fg-muted)'}`,
        `border-bottom:2px solid ${i === state.currentSection ? 'var(--nm-primary)' : 'transparent'}`
      ].join(';');
      tab.textContent = s.understood ? `✓ S${i + 1}` : `S${i + 1}`;
      tab.addEventListener('click', () => { state.currentSection = i; state.currentPage = 0; _render(); });
      strip.appendChild(tab);
    });
    content.appendChild(strip);
  }

  // Page view
  const pageView = document.createElement('div');
  pageView.style.cssText = 'flex:1;overflow-y:auto;padding:10px;display:flex;justify-content:center;align-items:flex-start;background:#f4f3ef;min-height:0';
  if (page?.imageBase64) {
    const img = document.createElement('img');
    img.src = `data:image/jpeg;base64,${page.imageBase64}`;
    img.style.cssText = 'max-width:100%;height:auto;border-radius:8px;box-shadow:0 4px 18px rgba(0,0,0,0.15)';
    pageView.appendChild(img);
  } else {
    const textBox = document.createElement('div');
    textBox.style.cssText = 'font-size:13px;line-height:1.6;color:var(--nm-fg);max-width:100%;white-space:pre-wrap;font-family:var(--nm-font-sans);background:#fff;padding:14px;border-radius:8px;width:100%;box-sizing:border-box';
    textBox.textContent = page?.text || '(empty)';
    pageView.appendChild(textBox);
  }

  // Nav
  const nav = document.createElement('div');
  nav.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:8px;padding:7px 12px;border-top:1px solid var(--nm-border);background:#fff;flex-shrink:0';
  const prevP = _navBtn('‹');
  prevP.disabled = state.currentPage === 0 && state.currentSection === 0;
  const pageLabel = document.createElement('div');
  pageLabel.style.cssText = 'font-size:12px;color:var(--nm-fg-muted);min-width:90px;text-align:center';
  pageLabel.textContent = `S${state.currentSection + 1} · P${state.currentPage + 1}/${sec.pages.length}`;
  const nextP = _navBtn('›');
  nextP.disabled = state.currentPage >= sec.pages.length - 1 && state.currentSection >= state.sections.length - 1;

  prevP.addEventListener('click', () => {
    if (state.currentPage > 0) state.currentPage--;
    else if (state.currentSection > 0) { state.currentSection--; state.currentPage = state.sections[state.currentSection].pages.length - 1; }
    _render();
  });
  nextP.addEventListener('click', () => {
    if (state.currentPage < sec.pages.length - 1) state.currentPage++;
    else if (state.currentSection < state.sections.length - 1) { state.currentSection++; state.currentPage = 0; }
    _render();
  });

  nav.appendChild(prevP);
  nav.appendChild(pageLabel);
  nav.appendChild(nextP);

  // Quick note
  const noteWrap = document.createElement('div');
  noteWrap.style.cssText = 'padding:6px 10px;border-top:1px solid var(--nm-border);background:#fff;flex-shrink:0';
  const ta = document.createElement('textarea');
  ta.placeholder = '✏️ Note for this section…';
  ta.value = state.notes[state.currentSection] ?? '';
  ta.style.cssText = 'width:100%;box-sizing:border-box;border:1.5px solid var(--nm-border);border-radius:8px;padding:6px 9px;font-size:12px;font-family:inherit;resize:none;outline:none;color:var(--nm-fg);background:#fafaf7;height:44px';
  ta.addEventListener('focus', () => { ta.style.borderColor = 'var(--nm-primary)'; });
  ta.addEventListener('blur', () => {
    ta.style.borderColor = 'var(--nm-border)';
    _saveNote(state.currentSection, ta.value.trim());
  });
  noteWrap.appendChild(ta);

  content.appendChild(pageView);
  content.appendChild(nav);
  content.appendChild(noteWrap);
}

// ── Full view ──────────────────────────────────────────────────

function _renderFull(content: HTMLElement): void {
  content.innerHTML = '';
  content.style.cssText = 'flex:1;display:flex;overflow:hidden;min-height:0;background:var(--nm-bg)';

  // LEFT: section sidebar
  const sidebar = document.createElement('div');
  sidebar.style.cssText = [
    'width:190px;flex-shrink:0;overflow-y:auto;background:#f4f3ef',
    'border-right:1px solid var(--nm-border);display:flex;flex-direction:column'
  ].join(';');

  const sideHead = document.createElement('div');
  sideHead.style.cssText = 'font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:0.06em;color:var(--nm-fg-subtle);padding:10px 12px 6px;font-family:var(--nm-font-mono)';
  sideHead.textContent = 'Sections';
  sidebar.appendChild(sideHead);

  const understood = state.sections.filter(s => s.understood).length;
  const progBar = document.createElement('div');
  progBar.style.cssText = 'margin:0 12px 8px;background:var(--nm-border);border-radius:4px;height:4px;overflow:hidden';
  const progFill = document.createElement('div');
  progFill.style.cssText = `height:100%;background:var(--nm-accent);border-radius:4px;width:${state.sections.length ? (understood / state.sections.length * 100).toFixed(0) : 0}%;transition:width 0.3s`;
  progBar.appendChild(progFill);
  sidebar.appendChild(progBar);

  state.sections.forEach((s, i) => {
    const item = document.createElement('div');
    const isActive = i === state.currentSection;
    item.style.cssText = [
      'display:flex;align-items:center;gap:8px;padding:9px 12px;cursor:pointer;transition:background 120ms',
      `background:${isActive ? '#fff' : 'transparent'}`,
      `border-left:3px solid ${isActive ? 'var(--nm-primary)' : 'transparent'}`
    ].join(';');
    item.addEventListener('click', () => { state.currentSection = i; state.currentPage = 0; _render(); });
    item.addEventListener('mouseenter', () => { if (!isActive) item.style.background = 'rgba(255,255,255,0.6)'; });
    item.addEventListener('mouseleave', () => { if (!isActive) item.style.background = 'transparent'; });

    // Ring indicator
    const ring = _progressRing(20, s.understood ? 100 : 0, s.understood ? 'var(--nm-accent)' : 'var(--nm-border)');
    ring.style.flexShrink = '0';

    const label = document.createElement('div');
    label.style.cssText = `font-size:11.5px;font-weight:${isActive ? '700' : '500'};color:${isActive ? 'var(--nm-fg-strong)' : 'var(--nm-fg-muted)'};line-height:1.3;overflow:hidden;text-overflow:ellipsis;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical`;
    label.textContent = s.title;

    item.appendChild(ring);
    item.appendChild(label);
    sidebar.appendChild(item);
  });

  // CENTER: page viewer
  const center = document.createElement('div');
  center.style.cssText = 'flex:1;display:flex;flex-direction:column;overflow:hidden;min-width:0';
  const sec = state.sections[state.currentSection];
  const page = sec?.pages[state.currentPage] ?? sec?.pages[0];

  // Section header
  const secHeader = document.createElement('div');
  secHeader.style.cssText = 'display:flex;align-items:center;justify-content:space-between;padding:10px 16px;border-bottom:1px solid var(--nm-border);background:#fff;flex-shrink:0;gap:8px';
  const secTitle = document.createElement('div');
  secTitle.style.cssText = 'font-size:14px;font-weight:700;color:var(--nm-fg-strong);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap';
  secTitle.textContent = sec?.title ?? '';

  const understoodBtn = document.createElement('button');
  understoodBtn.style.cssText = [
    'padding:5px 12px;border-radius:20px;font-size:12px;font-weight:700;cursor:pointer;border:1.5px solid;flex-shrink:0',
    sec?.understood
      ? 'background:var(--nm-accent);color:#fff;border-color:var(--nm-accent)'
      : 'background:#fff;color:var(--nm-fg-muted);border-color:var(--nm-border)'
  ].join(';');
  understoodBtn.textContent = sec?.understood ? '✓ Understood' : 'Mark understood';
  understoodBtn.title = 'U';
  understoodBtn.addEventListener('click', () => _toggleUnderstood());

  secHeader.appendChild(secTitle);
  secHeader.appendChild(understoodBtn);
  center.appendChild(secHeader);

  // Page display
  const pageArea = document.createElement('div');
  pageArea.style.cssText = 'flex:1;overflow-y:auto;padding:18px;display:flex;justify-content:center;align-items:flex-start;background:#e8e6e0;min-height:0';

  if (page?.imageBase64) {
    const img = document.createElement('img');
    img.src = `data:image/jpeg;base64,${page.imageBase64}`;
    img.style.cssText = 'max-width:100%;max-height:100%;height:auto;border-radius:10px;box-shadow:0 8px 32px rgba(0,0,0,0.22)';
    pageArea.appendChild(img);
  } else {
    const textBox = document.createElement('div');
    textBox.style.cssText = 'font-size:14px;line-height:1.7;color:var(--nm-fg);max-width:680px;white-space:pre-wrap;font-family:var(--nm-font-sans);background:#fff;padding:26px 30px;border-radius:10px;box-shadow:0 4px 18px rgba(0,0,0,0.10);width:100%;box-sizing:border-box';
    textBox.textContent = page?.text || '(empty)';
    pageArea.appendChild(textBox);
  }
  center.appendChild(pageArea);

  // Page nav within section
  const navRow = document.createElement('div');
  navRow.style.cssText = 'display:flex;align-items:center;justify-content:center;gap:10px;padding:9px;border-top:1px solid var(--nm-border);background:#fff;flex-shrink:0;flex-wrap:wrap';

  if (state.currentSection > 0 || state.currentPage > 0) {
    const prevBtn = _btn('← Prev', 'ghost');
    prevBtn.addEventListener('click', () => {
      if (state.currentPage > 0) state.currentPage--;
      else if (state.currentSection > 0) { state.currentSection--; state.currentPage = state.sections[state.currentSection].pages.length - 1; }
      _render();
    });
    navRow.appendChild(prevBtn);
  }

  const pageCount = document.createElement('div');
  pageCount.style.cssText = 'font-size:12px;color:var(--nm-fg-muted);min-width:120px;text-align:center';
  pageCount.textContent = sec ? `Page ${state.currentPage + 1} / ${sec.pages.length}` : '';
  navRow.appendChild(pageCount);

  const hasNext = sec && (state.currentPage < sec.pages.length - 1 || state.currentSection < state.sections.length - 1);
  if (hasNext) {
    const nextBtn = _btn('Next →', 'ghost');
    nextBtn.addEventListener('click', () => {
      if (sec && state.currentPage < sec.pages.length - 1) state.currentPage++;
      else if (state.currentSection < state.sections.length - 1) { state.currentSection++; state.currentPage = 0; }
      _render();
    });
    navRow.appendChild(nextBtn);
  }

  center.appendChild(navRow);

  // RIGHT: feature panel
  const panel = document.createElement('div');
  panel.style.cssText = 'width:310px;flex-shrink:0;display:flex;flex-direction:column;border-left:1px solid var(--nm-border);background:#fff;overflow:hidden';

  // Tab bar
  const tabs: Array<{ key: IReaderState['activeTab']; label: string }> = [
    { key: 'notes', label: '✏️ Notes' },
    { key: 'quiz', label: '🧠 Quiz' },
    { key: 'flashcards', label: '🃏 Cards' }
  ];
  const tabBar = document.createElement('div');
  tabBar.style.cssText = 'display:flex;border-bottom:1px solid var(--nm-border);flex-shrink:0';

  const tabContent = document.createElement('div');
  tabContent.style.cssText = 'flex:1;overflow-y:auto;padding:14px';

  const paintTabs = () => {
    tabBar.innerHTML = '';
    tabs.forEach(t => {
      const b = document.createElement('button');
      b.textContent = t.label;
      const on = t.key === state.activeTab;
      b.style.cssText = [
        'flex:1;padding:10px 4px;border:none;background:none;cursor:pointer',
        'font-size:12px;font-weight:600;font-family:inherit;transition:all 120ms ease',
        `border-bottom:2.5px solid ${on ? 'var(--nm-primary)' : 'transparent'}`,
        `color:${on ? 'var(--nm-primary)' : 'var(--nm-fg-muted)'}`
      ].join(';');
      b.addEventListener('click', () => { state.activeTab = t.key; paintTabs(); renderTabContent(); });
      tabBar.appendChild(b);
    });
  };

  const renderTabContent = () => {
    tabContent.innerHTML = '';
    if (state.activeTab === 'notes') _renderNotesTab(tabContent);
    else if (state.activeTab === 'quiz') _renderQuizTab(tabContent);
    else if (state.activeTab === 'flashcards') _renderFlashcardsTab(tabContent);
  };

  paintTabs();
  panel.appendChild(tabBar);
  panel.appendChild(tabContent);
  renderTabContent();

  content.appendChild(sidebar);
  content.appendChild(center);
  content.appendChild(panel);
}

// ── Notes tab ──────────────────────────────────────────────────

function _renderNotesTab(host: HTMLElement): void {
  const sec = state.sections[state.currentSection];
  if (!sec) return;

  const h = _label(`Notes — ${sec.title}`);
  host.appendChild(h);

  if (sec.text) {
    const quote = document.createElement('div');
    quote.style.cssText = 'font-size:11.5px;color:var(--nm-fg-muted);line-height:1.5;background:#f4f3ef;border-radius:7px;padding:7px 10px;margin-bottom:10px;max-height:70px;overflow:hidden;position:relative';
    quote.textContent = sec.text.substring(0, 180) + (sec.text.length > 180 ? '…' : '');
    host.appendChild(quote);
  }

  const ta = document.createElement('textarea');
  ta.placeholder = 'Write your AHA moments, questions, or summary here…';
  ta.value = state.notes[state.currentSection] ?? '';
  ta.style.cssText = [
    'width:100%;box-sizing:border-box;height:150px;resize:vertical',
    'border:1.5px solid var(--nm-border);border-radius:9px;padding:10px 12px',
    'font-size:13px;font-family:inherit;color:var(--nm-fg);line-height:1.55;outline:none;background:#fafaf7'
  ].join(';');
  ta.addEventListener('focus', () => { ta.style.borderColor = 'var(--nm-primary)'; });
  ta.addEventListener('blur', async () => {
    ta.style.borderColor = 'var(--nm-border)';
    const val = ta.value.trim();
    if (val !== (state.notes[state.currentSection] ?? '')) {
      await _saveNote(state.currentSection, val);
      if (val && isConnected()) {
        await addPoints(5, 'reader_note', state.docTitle).catch(() => null);
        pointsEngine.addPoints(5, 'reader_note');
      }
    }
  });
  host.appendChild(ta);

  const hint = document.createElement('div');
  hint.style.cssText = 'font-size:11px;color:var(--nm-fg-subtle);margin-top:6px';
  hint.textContent = '💡 Auto-saves. +5 XP per note. Press U to mark section understood.';
  host.appendChild(hint);

  // Understood toggle inside notes
  const sec2 = state.sections[state.currentSection];
  const uBtn = document.createElement('button');
  uBtn.style.cssText = [
    'margin-top:12px;width:100%;padding:9px;border-radius:9px;font-size:13px;font-weight:700;cursor:pointer;border:1.5px solid;transition:all 160ms',
    sec2.understood
      ? 'background:var(--nm-accent);color:#fff;border-color:var(--nm-accent)'
      : 'background:#fff;color:var(--nm-fg-muted);border-color:var(--nm-border)'
  ].join(';');
  uBtn.textContent = sec2.understood ? '✓ Section understood' : 'Mark as understood';
  uBtn.addEventListener('click', () => _toggleUnderstood());
  host.appendChild(uBtn);

  // Other noted sections
  const notedOther = Object.entries(state.notes).filter(([k, v]) => v.trim() && Number(k) !== state.currentSection);
  if (notedOther.length > 0) {
    const sep = document.createElement('div');
    sep.style.cssText = 'margin-top:16px;padding-top:12px;border-top:1px solid var(--nm-border)';
    const sepLbl = document.createElement('div');
    sepLbl.style.cssText = 'font-size:11px;font-weight:700;color:var(--nm-fg-muted);margin-bottom:8px;text-transform:uppercase;letter-spacing:0.04em';
    sepLbl.textContent = `Other notes (${notedOther.length})`;
    sep.appendChild(sepLbl);
    notedOther.forEach(([idx, txt]) => {
      const item = document.createElement('div');
      item.style.cssText = 'font-size:11.5px;color:var(--nm-fg-muted);margin-bottom:7px;cursor:pointer;line-height:1.4';
      item.innerHTML = `<span style="font-weight:700;color:var(--nm-fg)">S${Number(idx) + 1}</span> — ${txt.substring(0, 60)}${txt.length > 60 ? '…' : ''}`;
      item.addEventListener('click', () => { state.currentSection = Number(idx); state.currentPage = 0; _render(); });
      sep.appendChild(item);
    });
    host.appendChild(sep);
  }
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

  // Generate button
  const h = _label('Quiz this section');
  host.appendChild(h);

  const hint = document.createElement('div');
  hint.style.cssText = 'font-size:12.5px;color:var(--nm-fg-muted);margin-bottom:12px;line-height:1.5';
  hint.textContent = '5 questions: multiple choice, true/false, fill-in, matching, open answer.';
  host.appendChild(hint);

  const genBtn = _btn('✨ Generate quiz', 'accent');
  genBtn.style.width = '100%';
  genBtn.disabled = !isAiReady() || !sec?.text;
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
  host.appendChild(genBtn);

  if (!isAiReady()) {
    const warn = document.createElement('div');
    warn.style.cssText = 'font-size:11.5px;color:var(--nm-fg-muted);margin-top:8px';
    warn.textContent = '⚠️ Set GEMINI_API_KEY to enable quiz.';
    host.appendChild(warn);
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
  meta.style.cssText = 'font-size:11px;font-family:var(--nm-font-mono);color:var(--nm-fg-subtle);margin-bottom:6px;text-transform:uppercase;letter-spacing:0.04em';
  meta.textContent = `${state.quizIdx + 1} / ${total} · ${typeLabel[q.type] || q.type}`;
  host.appendChild(meta);

  const qEl = document.createElement('div');
  qEl.style.cssText = 'font-size:14px;font-weight:600;color:var(--nm-fg-strong);margin-bottom:14px;line-height:1.45';
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
    feedback.style.cssText = `margin-top:12px;padding:10px 12px;border-radius:9px;border-left:4px solid ${correct ? 'var(--nm-accent)' : 'var(--nm-danger)'};background:${correct ? '#f0fdf4' : '#fff1f1'};font-size:13px;line-height:1.5;color:var(--nm-fg)`;
    feedback.innerHTML = `<strong style="color:${correct ? 'var(--nm-accent)' : 'var(--nm-danger)'}">${correct ? '✓ Correct' : '✗ Not quite'}</strong> — ${q.explanation}`;

    submitArea.innerHTML = '';
    const nextBtn = _btn(state.quizIdx < qs.length - 1 ? 'Next →' : 'See results', 'primary');
    nextBtn.style.cssText += ';width:100%;margin-top:10px';
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

  if (q.type === 'multiple_choice' || q.type === 'true_false') {
    const opts = q.type === 'true_false' ? ['True', 'False'] : q.options;
    opts.forEach(opt => {
      const btn = document.createElement('button');
      btn.textContent = opt;
      btn.style.cssText = 'display:block;width:100%;text-align:left;padding:10px 12px;margin-bottom:7px;border:1.5px solid var(--nm-border);border-radius:9px;background:#fff;cursor:pointer;font-size:13px;font-family:inherit;transition:all 120ms';
      btn.addEventListener('mouseenter', () => { btn.style.borderColor = 'var(--nm-primary)'; btn.style.background = '#fff7f4'; });
      btn.addEventListener('mouseleave', () => { btn.style.borderColor = 'var(--nm-border)'; btn.style.background = '#fff'; });
      btn.addEventListener('click', () => {
        area.querySelectorAll('button').forEach((b: Element) => (b as HTMLButtonElement).disabled = true);
        onSubmit(opt);
      });
      area.appendChild(btn);
    });
  } else if (q.type === 'fill_blank') {
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Type your answer…';
    input.style.cssText = 'width:100%;box-sizing:border-box;padding:9px 12px;border:1.5px solid var(--nm-border);border-radius:9px;font-size:13px;font-family:inherit;outline:none;color:var(--nm-fg);margin-bottom:8px';
    input.addEventListener('focus', () => { input.style.borderColor = 'var(--nm-primary)'; });
    const submitBtn = _btn('Submit', 'primary');
    submitBtn.style.cssText += ';width:100%';
    submitBtn.addEventListener('click', () => { if (input.value.trim()) { input.disabled = true; submitBtn.disabled = true; onSubmit(input.value.trim()); } });
    input.addEventListener('keydown', e => { if (e.key === 'Enter' && input.value.trim()) submitBtn.click(); });
    area.appendChild(input);
    area.appendChild(submitBtn);
  } else if (q.type === 'open_answer') {
    const ta = document.createElement('textarea');
    ta.placeholder = '2–4 sentences…';
    ta.rows = 4;
    ta.style.cssText = 'width:100%;box-sizing:border-box;padding:9px 12px;border:1.5px solid var(--nm-border);border-radius:9px;font-size:13px;font-family:inherit;outline:none;resize:none;color:var(--nm-fg);margin-bottom:8px';
    const submitBtn = _btn('Submit', 'primary');
    submitBtn.style.cssText += ';width:100%';
    submitBtn.addEventListener('click', () => { if (ta.value.trim()) { ta.disabled = true; submitBtn.disabled = true; onSubmit(ta.value.trim()); } });
    area.appendChild(ta);
    area.appendChild(submitBtn);
  } else if (q.type === 'matching') {
    // Show terms with dropdowns to pick definitions
    const terms = q.options.map(o => o.split(':')[0]?.trim() ?? o);
    const defs = (q.correct_answer as string[]).slice();
    // Shuffle defs for choices
    const shuffled = [...defs].sort(() => Math.random() - 0.5);
    const selects: HTMLSelectElement[] = [];
    terms.forEach((term, i) => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:8px;margin-bottom:8px';
      const lbl = document.createElement('div');
      lbl.style.cssText = 'font-size:13px;font-weight:600;color:var(--nm-fg);min-width:80px';
      lbl.textContent = term;
      const sel = document.createElement('select');
      sel.style.cssText = 'flex:1;padding:7px 9px;border:1.5px solid var(--nm-border);border-radius:8px;font-size:12.5px;font-family:inherit;background:#fff;color:var(--nm-fg)';
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.textContent = 'Select…';
      sel.appendChild(placeholder);
      shuffled.forEach(d => {
        const o = document.createElement('option');
        o.value = d;
        o.textContent = d.length > 30 ? d.substring(0, 30) + '…' : d;
        sel.appendChild(o);
      });
      selects.push(sel);
      row.appendChild(lbl);
      row.appendChild(sel);
      area.appendChild(row);
    });
    const submitBtn = _btn('Submit matching', 'primary');
    submitBtn.style.cssText += ';width:100%;margin-top:4px';
    submitBtn.addEventListener('click', () => {
      const answers = selects.map(s => s.value);
      if (answers.every(a => a)) { selects.forEach(s => s.disabled = true); submitBtn.disabled = true; onSubmit(answers); }
    });
    area.appendChild(submitBtn);
  }

  host.appendChild(area);
}

function _renderQuizReport(host: HTMLElement): void {
  const score = state.quizAnswers.filter(a => a.correct).length;
  const total = state.quizAnswers.length;
  const pct = total ? Math.round((score / total) * 100) : 0;

  const scoreEl = document.createElement('div');
  scoreEl.style.cssText = 'text-align:center;padding:16px 0 12px';
  scoreEl.innerHTML = `<div style="font-size:36px;font-weight:800;color:${pct >= 60 ? 'var(--nm-accent)' : 'var(--nm-danger)'};">${pct}%</div><div style="font-size:13px;color:var(--nm-fg-muted);margin-top:4px">${score} / ${total} correct</div><div style="font-size:12px;color:var(--nm-fg-subtle);margin-top:2px">+${score * 2 + (score === total ? 10 : 0)} XP earned</div>`;
  host.appendChild(scoreEl);

  state.quizAnswers.forEach((rec, i) => {
    const item = document.createElement('div');
    item.style.cssText = `margin-bottom:10px;padding:10px 12px;border-radius:9px;border-left:4px solid ${rec.correct ? 'var(--nm-accent)' : 'var(--nm-danger)'};background:${rec.correct ? '#f0fdf4' : '#fff1f1'};font-size:12.5px;line-height:1.45`;
    item.innerHTML = `<div style="font-weight:700;color:var(--nm-fg-strong);margin-bottom:3px">Q${i + 1}: ${rec.question.question.substring(0, 80)}${rec.question.question.length > 80 ? '…' : ''}</div><div style="color:${rec.correct ? 'var(--nm-accent)' : 'var(--nm-danger)'};">${rec.correct ? '✓ Correct' : '✗ Wrong'}</div>`;
    host.appendChild(item);
  });

  const retryBtn = _btn('🔄 New quiz', 'ghost');
  retryBtn.style.cssText += ';width:100%;margin-top:8px';
  retryBtn.addEventListener('click', () => {
    state.quizQuestions = null;
    state.quizAnswers = [];
    state.quizIdx = 0;
    state.quizDone = false;
    host.innerHTML = '';
    _renderQuizTab(host);
  });
  host.appendChild(retryBtn);
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

  // View mode toggle
  if (!state.fcStudying) {
    const toggleRow = document.createElement('div');
    toggleRow.style.cssText = 'display:flex;border:1.5px solid var(--nm-border);border-radius:9px;overflow:hidden;margin-bottom:12px';
    ([['section', `Section (${secCards.length})`], ['due', `Due (${dueCards.length})`], ['all', `All (${allCards.length})`]] as const).forEach(([mode, label]) => {
      const b = document.createElement('button');
      b.textContent = label;
      const on = state.fcViewMode === mode;
      b.style.cssText = `flex:1;padding:7px 4px;font-size:11.5px;font-weight:${on ? '700' : '500'};border:none;cursor:pointer;font-family:inherit;background:${on ? 'var(--nm-primary)' : '#fff'};color:${on ? '#fff' : 'var(--nm-fg-muted)'};transition:all 120ms`;
      b.addEventListener('click', () => { state.fcViewMode = mode; host.innerHTML = ''; _renderFlashcardsTab(host); });
      toggleRow.appendChild(b);
    });
    host.appendChild(toggleRow);
  }

  if (state.fcStudying && state.fcStudyCards.length > 0) {
    _renderStudyMode(host);
    return;
  }

  if (viewCards.length === 0) {
    // Generate button
    const h = _label('No flashcards yet');
    host.appendChild(h);
    const genBtn = _btn('✨ Generate flashcards', 'accent');
    genBtn.style.cssText += ';width:100%';
    genBtn.disabled = !isAiReady();
    genBtn.addEventListener('click', () => _generateFlashcards(host));
    host.appendChild(genBtn);
    if (!isAiReady()) {
      const w = document.createElement('div');
      w.style.cssText = 'font-size:11.5px;color:var(--nm-fg-muted);margin-top:8px';
      w.textContent = '⚠️ Set GEMINI_API_KEY to generate flashcards.';
      host.appendChild(w);
    }
    return;
  }

  // Show card list + study button
  const studyBtn = _btn(`▶ Study ${viewCards.length} cards`, 'accent');
  studyBtn.style.cssText += ';width:100%;margin-bottom:12px';
  studyBtn.addEventListener('click', () => {
    state.fcStudyCards = [...viewCards].sort(() => Math.random() - 0.5);
    state.fcIdx = 0;
    state.fcFlipped = false;
    state.fcStudying = true;
    host.innerHTML = '';
    _renderFlashcardsTab(host);
  });
  host.appendChild(studyBtn);

  viewCards.slice(0, 5).forEach(c => {
    const item = document.createElement('div');
    item.style.cssText = 'border:1px solid var(--nm-border);border-radius:9px;padding:10px 12px;margin-bottom:8px;font-size:13px';
    const badge = document.createElement('span');
    badge.style.cssText = `font-size:10px;font-weight:700;padding:2px 7px;border-radius:10px;margin-bottom:5px;display:inline-block;background:${_cardTypeBg(c.card_type)};color:${_cardTypeColor(c.card_type)}`;
    badge.textContent = c.card_type.replace('_', ' ');
    const front = document.createElement('div');
    front.style.cssText = 'font-weight:600;color:var(--nm-fg-strong);margin-top:3px';
    front.textContent = c.front;
    item.appendChild(badge);
    item.appendChild(front);
    host.appendChild(item);
  });

  if (viewCards.length > 5) {
    const more = document.createElement('div');
    more.style.cssText = 'font-size:12px;color:var(--nm-fg-subtle);text-align:center;margin-top:4px';
    more.textContent = `+${viewCards.length - 5} more cards`;
    host.appendChild(more);
  }

  const regenBtn = _btn('↺ Regenerate', 'ghost');
  regenBtn.style.cssText += ';width:100%;margin-top:10px;font-size:12px';
  regenBtn.disabled = !isAiReady();
  regenBtn.addEventListener('click', () => _generateFlashcards(host));
  host.appendChild(regenBtn);
}

function _renderStudyMode(host: HTMLElement): void {
  const card = state.fcStudyCards[state.fcIdx];
  const total = state.fcStudyCards.length;

  const progress = document.createElement('div');
  progress.style.cssText = 'font-size:11px;color:var(--nm-fg-subtle);text-align:center;margin-bottom:10px;font-family:var(--nm-font-mono)';
  progress.textContent = `${state.fcIdx + 1} / ${total}`;
  host.appendChild(progress);

  const cardEl = document.createElement('div');
  cardEl.style.cssText = [
    'background:var(--nm-bg-elev-2);border:1.5px solid var(--nm-border);border-radius:14px',
    'padding:24px 18px;text-align:center;cursor:pointer;min-height:130px',
    'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:8px',
    'transition:all 160ms ease;box-shadow:0 2px 12px rgba(0,0,0,0.07);margin-bottom:14px'
  ].join(';');

  const sideLbl = document.createElement('div');
  sideLbl.style.cssText = 'font-size:10px;font-weight:700;color:var(--nm-fg-subtle);text-transform:uppercase;letter-spacing:0.06em';
  sideLbl.textContent = state.fcFlipped ? 'ANSWER' : 'TERM / QUESTION';

  const typeBadge = document.createElement('div');
  typeBadge.style.cssText = `font-size:10px;font-weight:700;padding:2px 8px;border-radius:10px;background:${_cardTypeBg(card.card_type)};color:${_cardTypeColor(card.card_type)}`;
  typeBadge.textContent = card.card_type.replace('_', ' ');

  const cardText = document.createElement('div');
  cardText.style.cssText = 'font-size:15px;font-weight:600;color:var(--nm-fg-strong);line-height:1.5;max-width:260px';
  cardText.textContent = state.fcFlipped ? card.back : card.front;

  const flipHint = document.createElement('div');
  flipHint.style.cssText = 'font-size:11px;color:var(--nm-fg-subtle);margin-top:6px';
  flipHint.textContent = state.fcFlipped ? '' : 'Click to reveal answer';

  cardEl.appendChild(sideLbl);
  cardEl.appendChild(typeBadge);
  cardEl.appendChild(cardText);
  cardEl.appendChild(flipHint);
  cardEl.addEventListener('click', () => {
    state.fcFlipped = !state.fcFlipped;
    host.innerHTML = '';
    _renderFlashcardsTab(host);
  });
  host.appendChild(cardEl);

  if (state.fcFlipped) {
    // Rating buttons
    const ratingRow = document.createElement('div');
    ratingRow.style.cssText = 'display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:6px;margin-bottom:12px';
    const ratings: Array<[CardRating, string, string]> = [
      ['again', 'Again', '#fee2e2'],
      ['good', 'Good', '#e0f2fe'],
      ['easy', 'Easy', '#dcfce7'],
      ['mastered', '⭐ Done', '#fef3c7']
    ];
    ratings.forEach(([rating, label, bg]) => {
      const rb = document.createElement('button');
      rb.style.cssText = `padding:8px 4px;border-radius:8px;border:1.5px solid var(--nm-border);background:${bg};font-size:12px;font-weight:700;cursor:pointer;font-family:inherit;transition:filter 120ms`;
      rb.textContent = label;
      rb.addEventListener('mouseenter', () => { rb.style.filter = 'brightness(0.95)'; });
      rb.addEventListener('mouseleave', () => { rb.style.filter = 'none'; });
      rb.addEventListener('click', () => _rateCard(card, rating, host));
      ratingRow.appendChild(rb);
    });
    host.appendChild(ratingRow);
  }

  const exitBtn = _btn('✕ Exit study', 'ghost');
  exitBtn.style.cssText += ';width:100%;font-size:12px';
  exitBtn.addEventListener('click', () => { state.fcStudying = false; state.fcFlipped = false; host.innerHTML = ''; _renderFlashcardsTab(host); });
  host.appendChild(exitBtn);
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
    // Session complete toast
    const done = document.createElement('div');
    done.style.cssText = 'text-align:center;padding:20px 0';
    done.innerHTML = '<div style="font-size:36px;margin-bottom:8px">🎉</div><div style="font-size:15px;font-weight:700;color:var(--nm-fg-strong)">Session complete!</div><div style="font-size:13px;color:var(--nm-fg-muted);margin-top:4px">Great work reviewing these cards.</div>';
    host.appendChild(done);
    const backBtn = _btn('← Back to cards', 'ghost');
    backBtn.style.cssText += ';width:100%;margin-top:14px';
    backBtn.addEventListener('click', () => { host.innerHTML = ''; _renderFlashcardsTab(host); });
    host.appendChild(backBtn);
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

async function _saveNote(sectionIndex: number, val: string): Promise<void> {
  state.notes[sectionIndex] = val;
  if (state.docId && isConnected()) {
    const sec = state.sections[sectionIndex];
    await upsertSectionNote(state.docId, sectionIndex, val, sec?.title).catch(() => null);
  }
}

function _progressRing(size: number, pct: number, color: string): SVGSVGElement {
  const r = (size - 4) / 2;
  const circ = 2 * Math.PI * r;
  const dashOffset = circ - (pct / 100) * circ;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', String(size));
  svg.setAttribute('height', String(size));
  svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
  const bg = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  bg.setAttribute('cx', String(size / 2));
  bg.setAttribute('cy', String(size / 2));
  bg.setAttribute('r', String(r));
  bg.setAttribute('fill', 'none');
  bg.setAttribute('stroke', '#e5e5e5');
  bg.setAttribute('stroke-width', '3');
  const fg = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
  fg.setAttribute('cx', String(size / 2));
  fg.setAttribute('cy', String(size / 2));
  fg.setAttribute('r', String(r));
  fg.setAttribute('fill', 'none');
  fg.setAttribute('stroke', color);
  fg.setAttribute('stroke-width', '3');
  fg.setAttribute('stroke-dasharray', String(circ));
  fg.setAttribute('stroke-dashoffset', String(dashOffset));
  fg.setAttribute('stroke-linecap', 'round');
  fg.setAttribute('transform', `rotate(-90 ${size / 2} ${size / 2})`);
  svg.appendChild(bg);
  svg.appendChild(fg);
  return svg;
}

function _label(text: string): HTMLElement {
  const el = document.createElement('div');
  el.style.cssText = 'font-size:13px;font-weight:700;color:var(--nm-fg-strong);margin-bottom:10px';
  el.textContent = text;
  return el;
}

function _btn(label: string, variant: 'primary' | 'accent' | 'ghost'): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = label;
  const styles: Record<string, string> = {
    primary: 'background:var(--nm-fg-strong);color:#fff;border:none',
    accent: 'background:var(--nm-primary);color:#fff;border:none',
    ghost: 'background:#fff;color:var(--nm-fg-muted);border:1px solid var(--nm-border)'
  };
  b.style.cssText = `padding:8px 16px;border-radius:9px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit;transition:filter 120ms;${styles[variant]}`;
  b.addEventListener('mouseenter', () => { b.style.filter = 'brightness(0.92)'; });
  b.addEventListener('mouseleave', () => { b.style.filter = 'none'; });
  return b;
}

function _navBtn(label: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = label;
  b.style.cssText = 'width:28px;height:28px;border:1px solid var(--nm-border);border-radius:6px;background:#fff;cursor:pointer;font-size:16px;display:flex;align-items:center;justify-content:center;color:var(--nm-fg)';
  return b;
}

function _cardTypeBg(type: string): string {
  const m: Record<string, string> = { term_definition: '#dbeafe', concept_example: '#dcfce7', fill_blank: '#fef3c7', key_claim: '#f3e8ff', relationship: '#ffe4e6' };
  return m[type] ?? '#f4f4f5';
}
function _cardTypeColor(type: string): string {
  const m: Record<string, string> = { term_definition: '#1d4ed8', concept_example: '#166534', fill_blank: '#92400e', key_claim: '#7e22ce', relationship: '#9f1239' };
  return m[type] ?? '#52525b';
}

// ── Keyboard shortcuts ─────────────────────────────────────────

function _installKeyboard(): void {
  const handler = (e: KeyboardEvent) => {
    const tag = (document.activeElement?.tagName || '').toLowerCase();
    if (['input', 'textarea', 'select'].includes(tag)) return;
    if (!state.doc) return;
    if (e.key === 'n' || e.key === 'N' || e.key === 'ArrowRight') {
      e.preventDefault();
      const sec = state.sections[state.currentSection];
      if (sec && state.currentPage < sec.pages.length - 1) state.currentPage++;
      else if (state.currentSection < state.sections.length - 1) { state.currentSection++; state.currentPage = 0; }
      _render();
    } else if (e.key === 'p' || e.key === 'P' || e.key === 'ArrowLeft') {
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
  overlay.style.cssText = 'position:fixed;inset:0;z-index:2000;background:rgba(0,0,0,0.45);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(3px)';
  const box = document.createElement('div');
  box.style.cssText = 'background:#fff;border-radius:16px;padding:28px 32px;max-width:380px;width:90%;box-shadow:0 20px 60px rgba(0,0,0,0.2)';
  box.innerHTML = `<div style="font-size:17px;font-weight:800;color:var(--nm-fg-strong);margin-bottom:16px">⌨️ Keyboard shortcuts</div>
${[['N / →', 'Next page'], ['P / ←', 'Previous page'], ['U', 'Mark section understood'], ['Q', 'Open quiz tab'], ['F', 'Open flashcards tab'], ['Space / Enter', 'Flip flashcard'], ['1 / 2 / 3', 'Rate card: Again / Good / Easy'], ['?', 'Show shortcuts'], ['Esc', 'Exit fullscreen']].map(([k, v]) => `<div style="display:flex;justify-content:space-between;padding:7px 0;border-bottom:1px solid var(--nm-border);font-size:13px"><code style="background:#f4f4f5;border-radius:5px;padding:2px 7px;font-family:var(--nm-font-mono);font-size:12px">${k}</code><span style="color:var(--nm-fg-muted)">${v}</span></div>`).join('')}
<button id="close-shortcuts" style="margin-top:18px;width:100%;padding:9px;border:none;background:var(--nm-fg-strong);color:#fff;border-radius:9px;font-size:13px;font-weight:700;cursor:pointer;font-family:inherit">Close</button>`;
  overlay.appendChild(box);
  document.body.appendChild(overlay);
  overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });
  box.querySelector('#close-shortcuts')?.addEventListener('click', () => overlay.remove());
}
