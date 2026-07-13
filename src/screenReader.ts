import { IPageData, IExtractResult, extractPdfFull } from './pdfExtract';
import { isAiReady, askAboutCell } from './gemini';
import { isConnected } from './supabase';
import {
  upsertDocument, getSectionNotes, addPoints,
  getDocumentFlashcards, upsertFlashcardsForSection, updateFlashcard,
  updateDocumentSections, IFlashcard
} from './supabaseDB';
import { pointsEngine } from './points';
import { spinner, backArrow } from './uiKit';
import { ISlide } from './slidesData';

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

// ── Local (no-AI) quiz & flashcard generation ─────────────────
// When no API key is set, we still make the study tools usable by deriving
// simple questions and cards from the section text (clearly "demo" quality).

const STOPWORDS = new Set(
  ('the a an and or of to in on for with is are was were be been being this that these those it its as at by from into your you we our their they them he she his her which who what when where why how not no can will would should could may might also more most some any each per via using used use uses'.split(
    ' '
  ))
);

function _sentences(text: string): string[] {
  return (text || '')
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length >= 24 && s.length <= 200);
}

function _keywords(text: string): string[] {
  const words = (text || '').match(/\b[A-Za-z][A-Za-z-]{3,}\b/g) || [];
  const freq = new Map<string, number>();
  for (const w of words) {
    const lw = w.toLowerCase();
    if (STOPWORDS.has(lw)) continue;
    freq.set(w, (freq.get(w) || 0) + 1);
  }
  return [...freq.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(e => e[0])
    .filter((v, i, arr) => arr.indexOf(v) === i)
    .slice(0, 8);
}

function _negate(s: string): string {
  const repls: [RegExp, string][] = [
    [/\bis\b/, 'is not'],
    [/\bare\b/, 'are not'],
    [/\bcan\b/, 'cannot'],
    [/\bwill\b/, 'will not'],
    [/\balways\b/, 'never']
  ];
  for (const [re, rep] of repls) {
    if (re.test(s)) return s.replace(re, rep);
  }
  return `It is incorrect that ${s.charAt(0).toLowerCase()}${s.slice(1)}`;
}

function _fillBlank(sentences: string[], kws: string[]): IQuizQuestion | null {
  for (const s of sentences) {
    const kw = kws.find(k => new RegExp(`\\b${k}\\b`).test(s));
    if (kw) {
      return {
        type: 'fill_blank',
        question: s.replace(new RegExp(`\\b${kw}\\b`), '_____'),
        options: [],
        correct_answer: kw,
        explanation: `The missing word is “${kw}”.`
      };
    }
  }
  return null;
}

function localQuiz(title: string, text: string): IQuizQuestion[] {
  const ss = _sentences(text);
  const kws = _keywords(text);
  const out: IQuizQuestion[] = [];

  if (ss[0]) {
    out.push({
      type: 'true_false',
      question: `True or false: ${ss[0]}`,
      options: ['True', 'False'],
      correct_answer: 'True',
      explanation: 'This restates a point made in the section.'
    });
  }
  const fb = _fillBlank(ss, kws);
  if (fb) out.push(fb);
  if (ss[1]) {
    out.push({
      type: 'true_false',
      question: `True or false: ${_negate(ss[1])}`,
      options: ['True', 'False'],
      correct_answer: 'False',
      explanation: `The section actually states: “${ss[1]}”`
    });
  }
  const fb2 = _fillBlank(ss.slice(2), kws);
  if (fb2) out.push(fb2);
  out.push({
    type: 'open_answer',
    question: `In your own words, summarise the main idea of “${title}”.`,
    options: [],
    correct_answer: ss.slice(0, 2).join(' ') || 'Summarise the key points of this section.',
    explanation: 'Compare your answer with the section’s main points.'
  });

  // Pad to 5 with keyword prompts if the text was sparse.
  let ki = 0;
  while (out.length < 5 && ki < kws.length) {
    out.push({
      type: 'open_answer',
      question: `What role does “${kws[ki]}” play in this section?`,
      options: [],
      correct_answer: `Explain how ${kws[ki]} relates to the section’s topic.`,
      explanation: 'A model answer would connect this term to the section’s main idea.'
    });
    ki++;
  }
  return out.slice(0, 5);
}

function localFlashcards(
  title: string,
  text: string
): Array<{ front: string; back: string; card_type: string }> {
  const ss = _sentences(text);
  const kws = _keywords(text);
  const cards: Array<{ front: string; back: string; card_type: string }> = [];
  for (const kw of kws) {
    const s = ss.find(x => new RegExp(`\\b${kw}\\b`).test(x));
    if (s) {
      cards.push({ front: kw, back: s, card_type: 'term_definition' });
    }
    if (cards.length >= 4) break;
  }
  if (ss[0]) {
    cards.push({
      front: `Key idea of “${title}”?`,
      back: ss[0],
      card_type: 'key_claim'
    });
  }
  // Fallback if the section had almost no usable text.
  if (cards.length === 0) {
    cards.push({
      front: title || 'This section',
      back: (text || 'Review this section in the reader.').slice(0, 160),
      card_type: 'term_definition'
    });
  }
  return cards.slice(0, 5);
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

  // Header: inline back arrow + 18px title, study buttons on the right.
  const header = document.createElement('div');
  header.style.cssText =
    'display:flex;align-items:center;gap:12px;padding:14px 24px 12px;flex-shrink:0';

  const headCol = document.createElement('div');
  headCol.style.cssText =
    'display:flex;align-items:center;gap:8px;flex:1;min-width:0';
  if (onExit) {
    headCol.appendChild(backArrow(() => onExit(false), 'Back to Slides & Papers'));
  }
  const titleEl = document.createElement('h1');
  titleEl.style.cssText =
    'margin:0;font-size:18px;font-weight:600;letter-spacing:-0.016em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;color:var(--text-primary)';
  titleEl.textContent = state.docTitle || 'Slides & Papers';
  headCol.appendChild(titleEl);
  header.appendChild(headCol);

  if (state.doc) {
    const quizBtn = _btn('Take quiz', 'primary');
    quizBtn.innerHTML =
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>Take quiz';
    quizBtn.addEventListener('click', () => _openStudy('quiz'));
    const fcBtn = _btn('Flashcards', 'secondary');
    fcBtn.innerHTML =
      '<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="16" height="12" rx="2"></rect><path d="M22 4v12"></path></svg>Flashcards';
    fcBtn.addEventListener('click', () => _openStudy('flashcards'));
    header.appendChild(quizBtn);
    header.appendChild(fcBtn);
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
    'flex:1;display:grid;grid-template-columns:minmax(160px,240px) 1fr;gap:0;min-height:0;border-top:1px solid var(--border-subtle);overflow:hidden';

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

  // Slide card — structured deck slide, PDF image, or plain text (in order).
  let slide: HTMLElement;
  if (page?.deckSlide) {
    slide = renderDeckSlide(page.deckSlide);
  } else if (page?.imageBase64) {
    slide = document.createElement('div');
    slide.style.cssText =
      'background:var(--surface-card);border:1px solid var(--border-default);border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.06);overflow:hidden';
    const img = document.createElement('img');
    img.src = `data:image/jpeg;base64,${page.imageBase64}`;
    img.style.cssText = 'display:block;width:100%;height:auto';
    slide.appendChild(img);
  } else {
    slide = document.createElement('div');
    slide.style.cssText =
      'background:var(--surface-card);border:1px solid var(--border-default);border-radius:12px;box-shadow:0 4px 20px rgba(0,0,0,0.06);padding:34px 40px;display:flex;flex-direction:column;gap:18px;min-height:0';
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

  content.appendChild(sidebar);
  content.appendChild(center);
}

// ── Rich lecture-slide renderer ────────────────────────────────
function renderDeckSlide(s: ISlide): HTMLElement {
  const card = document.createElement('div');
  card.style.cssText = [
    'position:relative;background:var(--surface-card);border:1px solid var(--border-default);border-radius:16px',
    'box-shadow:0 6px 28px rgba(0,0,0,0.07);padding:44px 52px;display:flex;flex-direction:column;gap:20px',
    'min-height:440px;overflow:hidden;animation:nm-rise 0.2s var(--ease-out) both'
  ].join(';');
  const accent = document.createElement('div');
  accent.style.cssText =
    'position:absolute;top:0;left:0;right:0;height:4px;background:linear-gradient(90deg,var(--brand-500),var(--brand-400))';
  card.appendChild(accent);

  const eyebrow = (t: string): HTMLElement => {
    const e = document.createElement('div');
    e.style.cssText =
      'font-size:11.5px;font-weight:700;color:var(--accent-text);text-transform:uppercase;letter-spacing:0.12em';
    e.textContent = t;
    return e;
  };
  const titleEl = (big = false): HTMLElement => {
    const h = document.createElement('div');
    h.style.cssText = `font-size:${big ? '40px' : '28px'};font-weight:700;letter-spacing:-0.02em;line-height:1.12;color:var(--text-primary)`;
    if (s.titleHi && s.title?.includes(s.titleHi)) {
      h.innerHTML = s.title.replace(
        s.titleHi,
        `<span style="color:var(--accent-text)">${s.titleHi}</span>`
      );
    } else {
      h.textContent = s.title ?? '';
    }
    return h;
  };
  const subEl = (): HTMLElement => {
    const p = document.createElement('div');
    p.style.cssText =
      'font-size:15px;color:var(--text-secondary);line-height:1.6;max-width:780px';
    p.textContent = s.subtitle ?? '';
    return p;
  };
  const codeBlock = (code: string, caption?: string): HTMLElement => {
    const wrap = document.createElement('div');
    wrap.style.cssText = 'display:flex;flex-direction:column;gap:6px';
    if (caption) {
      const c = document.createElement('div');
      c.style.cssText =
        'font-size:11px;font-weight:600;color:var(--text-quaternary);text-transform:uppercase;letter-spacing:0.06em';
      c.textContent = caption;
      wrap.appendChild(c);
    }
    const pre = document.createElement('pre');
    pre.style.cssText =
      'margin:0;background:#0f1117;color:#d6def0;border-radius:10px;padding:16px 18px;font-family:var(--font-mono);font-size:13px;line-height:1.65;overflow-x:auto;white-space:pre;box-shadow:inset 0 0 0 1px rgba(255,255,255,0.05)';
    pre.textContent = code;
    wrap.appendChild(pre);
    return wrap;
  };
  const stepCard = (st: NonNullable<ISlide['steps']>[number], withCode: boolean): HTMLElement => {
    const d = document.createElement('div');
    d.style.cssText =
      'background:var(--bg-panel);border:1px solid var(--border-default);border-radius:12px;padding:16px 18px;display:flex;flex-direction:column;gap:7px';
    const top = document.createElement('div');
    top.style.cssText = 'display:flex;align-items:center;gap:10px';
    const num = document.createElement('span');
    num.style.cssText =
      'flex:0 0 auto;width:26px;height:26px;border-radius:7px;background:var(--accent-subtle-bg);color:var(--accent-text);font-family:var(--font-mono);font-weight:700;font-size:12px;display:flex;align-items:center;justify-content:center';
    num.textContent = st.n;
    const tt = document.createElement('span');
    tt.style.cssText = 'font-size:14.5px;font-weight:600;color:var(--text-primary)';
    tt.textContent = st.title;
    top.appendChild(num);
    top.appendChild(tt);
    d.appendChild(top);
    if (withCode && st.code) {
      const c = document.createElement('code');
      c.style.cssText =
        'font-family:var(--font-mono);font-size:11.5px;color:var(--accent-text);background:var(--accent-subtle-bg);border-radius:5px;padding:2px 7px;align-self:flex-start';
      c.textContent = st.code;
      d.appendChild(c);
    }
    const tx = document.createElement('div');
    tx.style.cssText = 'font-size:12.5px;color:var(--text-tertiary);line-height:1.5';
    tx.textContent = st.text;
    d.appendChild(tx);
    return d;
  };

  if (s.eyebrow) card.appendChild(eyebrow(s.eyebrow));

  switch (s.kind) {
    case 'title': {
      card.style.justifyContent = 'center';
      card.style.gap = '16px';
      card.style.minHeight = '460px';
      card.appendChild(titleEl(true));
      if (s.subtitle) card.appendChild(subEl());
      if (s.tags?.length) {
        const row = document.createElement('div');
        row.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-top:6px';
        s.tags.forEach(t => {
          const chip = document.createElement('span');
          chip.style.cssText =
            'font-size:12.5px;font-weight:500;color:var(--accent-text);background:var(--accent-subtle-bg);border-radius:999px;padding:5px 13px';
          chip.textContent = t;
          row.appendChild(chip);
        });
        card.appendChild(row);
      }
      if (s.presenter) {
        const p = document.createElement('div');
        p.style.cssText =
          'margin-top:14px;font-size:12.5px;color:var(--text-quaternary);border-top:1px solid var(--border-subtle);padding-top:14px';
        p.textContent = s.presenter;
        card.appendChild(p);
      }
      break;
    }
    case 'overview': {
      card.appendChild(titleEl());
      if (s.subtitle) card.appendChild(subEl());
      const grid = document.createElement('div');
      grid.style.cssText =
        'display:grid;grid-template-columns:minmax(0,0.9fr) minmax(0,1.4fr);gap:18px;align-items:stretch;margin-top:4px';
      if (s.stat) {
        const st = document.createElement('div');
        st.style.cssText =
          'background:linear-gradient(135deg,var(--accent),var(--accent-hover));color:#fff;border-radius:14px;padding:22px;display:flex;flex-direction:column;justify-content:center;gap:8px';
        st.innerHTML = `<span style="font-size:46px;font-weight:700;letter-spacing:-0.03em;line-height:1">${s.stat.value}</span><span style="font-size:13px;line-height:1.5;opacity:0.92">${s.stat.label}</span>`;
        grid.appendChild(st);
      }
      const steps = document.createElement('div');
      steps.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:10px';
      (s.steps ?? []).forEach(x => steps.appendChild(stepCard(x, false)));
      grid.appendChild(steps);
      card.appendChild(grid);
      break;
    }
    case 'code': {
      card.appendChild(titleEl());
      if (s.subtitle) card.appendChild(subEl());
      if (s.bullets?.length) {
        const ul = document.createElement('div');
        ul.style.cssText = 'display:flex;flex-direction:column;gap:7px';
        s.bullets.forEach(b => {
          const li = document.createElement('div');
          li.style.cssText =
            'display:flex;gap:10px;align-items:flex-start;font-size:13.5px;color:var(--text-secondary);line-height:1.5';
          li.innerHTML = `<span style="flex:0 0 auto;color:var(--green-500);margin-top:1px"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"></polyline></svg></span><span>${b}</span>`;
          ul.appendChild(li);
        });
        card.appendChild(ul);
      }
      if (s.code) card.appendChild(codeBlock(s.code, s.codeCaption));
      if (s.text) {
        const t = document.createElement('div');
        t.style.cssText =
          'font-size:13.5px;color:var(--text-tertiary);line-height:1.6;border-left:3px solid var(--accent);padding-left:12px';
        t.textContent = s.text;
        card.appendChild(t);
      }
      break;
    }
    case 'steps':
    case 'exercise': {
      card.appendChild(titleEl());
      if (s.subtitle) card.appendChild(subEl());
      const n = s.steps?.length ?? 1;
      const cols = n >= 4 ? 2 : n;
      const grid = document.createElement('div');
      grid.style.cssText = `display:grid;grid-template-columns:repeat(${cols},1fr);gap:12px;margin-top:4px`;
      (s.steps ?? []).forEach(x => grid.appendChild(stepCard(x, s.kind === 'steps')));
      card.appendChild(grid);
      if (s.footer) {
        const f = document.createElement('div');
        f.style.cssText =
          'margin-top:6px;font-size:12.5px;color:var(--text-quaternary);background:var(--bg-base);border:1px solid var(--border-subtle);border-radius:8px;padding:10px 14px';
        f.textContent = s.footer;
        card.appendChild(f);
      }
      break;
    }
    case 'stat': {
      card.appendChild(titleEl());
      if (s.code) card.appendChild(codeBlock(s.code, s.codeCaption));
      if (s.stat) {
        const st = document.createElement('div');
        st.style.cssText =
          'display:flex;align-items:center;gap:20px;background:var(--accent-subtle-bg);border:1px solid rgba(94,106,210,0.25);border-radius:14px;padding:22px 24px;margin-top:4px';
        st.innerHTML = `<span style="flex:0 0 auto;font-size:52px;font-weight:700;letter-spacing:-0.03em;color:var(--accent-text);line-height:1">${s.stat.value}</span><span style="font-size:14px;color:var(--text-secondary);line-height:1.55">${s.stat.label}</span>`;
        card.appendChild(st);
      }
      break;
    }
    case 'compare': {
      card.appendChild(titleEl());
      if (s.subtitle) card.appendChild(subEl());
      const grid = document.createElement('div');
      grid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-top:4px';
      const col = (label: string, color: string, bg: string, bd: string, t: string, tx: string): HTMLElement => {
        const d = document.createElement('div');
        d.style.cssText = `background:${bg};border:1px solid ${bd};border-radius:14px;padding:20px;display:flex;flex-direction:column;gap:8px`;
        d.innerHTML = `<span style="font-size:11px;font-weight:700;letter-spacing:0.1em;color:${color}">${label}</span><span style="font-size:16px;font-weight:600;color:var(--text-primary)">${t}</span><span style="font-size:13px;color:var(--text-tertiary);line-height:1.55">${tx}</span>`;
        return d;
      };
      if (s.compare) {
        grid.appendChild(col('AVOID', 'var(--red-500)', 'var(--red-bg)', 'rgba(192,52,52,0.25)', s.compare.avoid.title, s.compare.avoid.text));
        grid.appendChild(col('PREFER', 'var(--green-500)', 'var(--green-bg)', 'rgba(23,138,84,0.28)', s.compare.prefer.title, s.compare.prefer.text));
      }
      card.appendChild(grid);
      break;
    }
    case 'statement': {
      card.style.justifyContent = 'center';
      card.style.gap = '18px';
      card.style.minHeight = '420px';
      card.appendChild(titleEl(true));
      if (s.text) {
        const t = document.createElement('div');
        t.style.cssText = 'font-size:19px;color:var(--text-secondary);line-height:1.6;max-width:720px';
        t.textContent = s.text;
        card.appendChild(t);
      }
      break;
    }
    default: {
      card.appendChild(titleEl());
      if (s.subtitle) card.appendChild(subEl());
      if (s.bullets?.length) {
        const ul = document.createElement('div');
        ul.style.cssText = 'display:flex;flex-direction:column;gap:12px;margin-top:6px';
        s.bullets.forEach(b => {
          const li = document.createElement('div');
          li.style.cssText =
            'display:flex;gap:12px;align-items:flex-start;font-size:16px;color:var(--text-secondary);line-height:1.5';
          li.innerHTML = `<span style="flex:0 0 auto;width:7px;height:7px;border-radius:50%;background:var(--accent);margin-top:9px"></span><span>${b}</span>`;
          ul.appendChild(li);
        });
        card.appendChild(ul);
      }
    }
  }
  return card;
}

// ── Study modal (quiz / flashcards) ────────────────────────────
// Quiz and flashcards run in a focused modal so the slide can use the
// full width. The tab content renderers below draw into `_studyBody`.
let _studyBody: HTMLElement | null = null;
let _studyFooter: HTMLElement | null = null;

function clearStudyFooter(): void {
  if (_studyFooter) {
    _studyFooter.innerHTML = '';
    _studyFooter.style.display = 'none';
  }
}

function _openStudy(tab: IReaderState['activeTab']): void {
  state.activeTab = tab;
  // Reset any half-finished quiz so opening always starts clean.
  if (tab === 'quiz' && state.quizDone) {
    state.quizQuestions = null;
    state.quizAnswers = [];
    state.quizIdx = 0;
    state.quizDone = false;
  }
  state.fcStudying = false;
  state.fcFlipped = false;

  const overlay = document.createElement('div');
  overlay.className = 'nm-study-overlay';
  overlay.style.cssText =
    'position:fixed;inset:0;z-index:1400;background:var(--surface-overlay);display:flex;align-items:center;justify-content:center;padding:24px;box-sizing:border-box;font-family:var(--font-sans)';

  const card = document.createElement('div');
  card.style.cssText = [
    'width:940px;max-width:100%;min-height:min(560px, calc(100vh - 48px));max-height:calc(100vh - 48px);background:var(--bg-elevated)',
    'border:1px solid var(--border-strong);border-radius:14px;display:flex;flex-direction:column;overflow:hidden',
    'box-shadow:0 24px 64px rgba(0,0,0,0.22);animation:nm-rise 0.2s cubic-bezier(0.16,1,0.3,1) both'
  ].join(';');

  const sec = state.sections[state.currentSection];
  const head = document.createElement('div');
  head.style.cssText =
    'display:flex;align-items:center;gap:10px;padding:14px 16px;border-bottom:1px solid var(--border-subtle);flex-shrink:0';
  const tabWrap = document.createElement('div');
  tabWrap.style.cssText =
    'display:flex;gap:2px;background:var(--bg-base);border:1px solid var(--border-subtle);border-radius:8px;padding:3px';
  const mkTab = (id: IReaderState['activeTab'], label: string): HTMLElement => {
    const b = document.createElement('span');
    b.textContent = label;
    const on = state.activeTab === id;
    b.style.cssText =
      'padding:5px 14px;border-radius:5px;font-size:12.5px;font-weight:500;cursor:pointer;white-space:nowrap;' +
      (on
        ? 'background:var(--bg-panel);color:var(--text-primary);box-shadow:0 1px 2px rgba(0,0,0,0.14), 0 0 0 1px var(--border-default)'
        : 'color:var(--text-tertiary)');
    b.addEventListener('click', () => {
      state.activeTab = id;
      state.fcStudying = false;
      renderStudyBody();
    });
    return b;
  };
  tabWrap.appendChild(mkTab('quiz', 'Quiz'));
  tabWrap.appendChild(mkTab('flashcards', 'Flashcards'));
  head.appendChild(tabWrap);
  const secLbl = document.createElement('span');
  secLbl.style.cssText =
    'flex:1;min-width:0;font-size:12px;color:var(--text-tertiary);white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
  secLbl.textContent = sec?.title ?? '';
  head.appendChild(secLbl);
  const close = document.createElement('span');
  close.style.cssText =
    'flex:0 0 auto;cursor:pointer;color:var(--text-tertiary);display:inline-flex;padding:4px;border-radius:6px;transition:background-color var(--dur-fast) var(--ease-out),color var(--dur-fast) var(--ease-out)';
  close.innerHTML =
    '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>';
  close.addEventListener('mouseenter', () => {
    close.style.background = 'rgba(0,0,0,0.05)';
    close.style.color = 'var(--text-primary)';
  });
  close.addEventListener('mouseleave', () => {
    close.style.background = 'transparent';
    close.style.color = 'var(--text-tertiary)';
  });
  head.appendChild(close);
  card.appendChild(head);

  // Scroll area holds a centered, fixed-width column so the content sits
  // in the middle of the big modal instead of hugging a corner.
  const body = document.createElement('div');
  body.style.cssText =
    'flex:1;overflow-y:auto;min-height:0;padding:28px 24px;display:flex;justify-content:center;align-items:center';
  const inner = document.createElement('div');
  inner.style.cssText =
    'width:100%;max-width:600px;display:flex;flex-direction:column;gap:16px';
  body.appendChild(inner);
  card.appendChild(body);
  _studyBody = inner;

  // Footer action bar (bottom-right) — the quiz's Next button lives here.
  const footer = document.createElement('div');
  footer.style.cssText =
    'flex-shrink:0;display:none;justify-content:flex-end;align-items:center;gap:10px;padding:14px 22px;border-top:1px solid var(--border-subtle)';
  card.appendChild(footer);
  _studyFooter = footer;

  const dispose = (): void => {
    _studyBody = null;
    _studyFooter = null;
    overlay.remove();
    _render(); // refresh understood counts etc.
  };
  close.addEventListener('click', dispose);
  overlay.addEventListener('mousedown', e => {
    if (e.target === overlay) dispose();
  });

  function renderStudyBody(): void {
    // repaint the tab pills
    tabWrap.innerHTML = '';
    tabWrap.appendChild(mkTab('quiz', 'Quiz'));
    tabWrap.appendChild(mkTab('flashcards', 'Flashcards'));
    clearStudyFooter();
    if (!_studyBody) return;
    _studyBody.innerHTML = '';
    if (state.activeTab === 'quiz') _renderQuizTab(_studyBody);
    else _renderFlashcardsTab(_studyBody);
  }
  (overlay as any)._renderStudyBody = renderStudyBody;
  (overlay as any)._dispose = dispose;

  renderStudyBody();
  overlay.appendChild(card);
  document.body.appendChild(overlay);
}

// ── Quiz tab ───────────────────────────────────────────────────

function _renderQuizTab(host: HTMLElement): void {
  const sec = state.sections[state.currentSection];
  clearStudyFooter();

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

  const genBtn = _btn(isAiReady() ? 'Generate quiz' : 'Generate demo quiz', 'primary');
  genBtn.disabled = !sec?.text;
  idle.appendChild(genBtn);
  genBtn.addEventListener('click', async () => {
    state.quizLoading = true;
    state.quizQuestions = null;
    state.quizAnswers = [];
    state.quizIdx = 0;
    state.quizDone = false;
    host.innerHTML = '';
    host.appendChild(spinner(isAiReady() ? 'Generating quiz…' : 'Building demo quiz…'));
    try {
      if (isAiReady()) {
        const text = sec.text.substring(0, 2000);
        const prompt = `Generate exactly 5 quiz questions about this text. Return ONLY a valid JSON array with one question of each type: multiple_choice, true_false, fill_blank, matching, open_answer.
Format: [{"type":"multiple_choice","question":"...","options":["A","B","C","D"],"correct_answer":"A","explanation":"..."},{"type":"true_false","question":"...","options":["True","False"],"correct_answer":"True","explanation":"..."},{"type":"fill_blank","question":"The ___ is ...","options":[],"correct_answer":"single word","explanation":"..."},{"type":"matching","question":"Match the terms","options":["Term1: Def1","Term2: Def2","Term3: Def3"],"correct_answer":["Def1","Def2","Def3"],"explanation":"..."},{"type":"open_answer","question":"Explain in your own words...","options":[],"correct_answer":"model answer here","explanation":"..."}]`;
        const raw = await askAboutCell(text, prompt, []);
        const match = raw.match(/\[[\s\S]*\]/);
        if (!match) throw new Error('No JSON array in response');
        const questions = JSON.parse(match[0]) as IQuizQuestion[];
        state.quizQuestions = questions.slice(0, 5);
      } else {
        state.quizQuestions = localQuiz(sec.title, sec.text);
      }
      state.quizLoading = false;
      if (isConnected()) {
        await addPoints(2, 'reader_quiz_start', state.docTitle).catch(() => null);
        pointsEngine.addPoints(2, 'reader_quiz_start');
      }
    } catch {
      // AI failed — fall back to the built-in demo quiz so the tool still works.
      state.quizQuestions = localQuiz(sec.title, sec.text);
      state.quizLoading = false;
    }
    host.innerHTML = '';
    _renderQuizTab(host);
  });

  if (!isAiReady()) {
    const warn = document.createElement('span');
    warn.style.cssText = 'font-size:11.5px;color:var(--text-quaternary)';
    warn.textContent = 'Demo mode — questions are generated from the section text.';
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

  clearStudyFooter();

  const wrap = document.createElement('div');
  wrap.style.cssText =
    'display:flex;flex-direction:column;gap:12px;animation:nm-rise 0.22s var(--ease-out) both';

  const meta = document.createElement('div');
  meta.style.cssText = 'display:flex;align-items:center;gap:8px';
  meta.innerHTML =
    `<span style="font-size:12px;color:var(--text-quaternary);font-family:var(--font-mono)">Question ${state.quizIdx + 1} / ${total}</span>` +
    '<span style="flex:1"></span>' +
    `<span style="font-size:11px;font-weight:600;color:var(--accent-text);text-transform:uppercase;letter-spacing:0.05em">${typeLabel[q.type] || q.type}</span>`;
  wrap.appendChild(meta);

  const qEl = document.createElement('div');
  qEl.style.cssText =
    'font-size:15px;font-weight:500;color:var(--text-primary);line-height:1.5';
  qEl.textContent = q.question;
  wrap.appendChild(qEl);

  // Options + feedback live in the content column; the Next button goes to
  // the modal footer (bottom-right) so it never clings to the top.
  const optionsHost = document.createElement('div');
  wrap.appendChild(optionsHost);
  const feedback = document.createElement('div');
  wrap.appendChild(feedback);

  let answered = false;
  const doSubmit = (answer: string | string[]): void => {
    if (answered) return;
    answered = true;

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

    feedback.style.cssText = `padding:10px 12px;border-radius:8px;font-size:13px;line-height:1.55;animation:nm-rise 0.2s var(--ease-out) both;${
      correct
        ? 'background:var(--green-bg);color:var(--green-400);border:1px solid rgba(23,138,84,0.35)'
        : 'background:var(--red-bg);color:var(--red-400);border:1px solid rgba(192,52,52,0.32)'
    }`;
    feedback.textContent = `${correct ? 'Correct!' : 'Not quite.'} ${q.explanation}`;

    const last = state.quizIdx >= qs.length - 1;
    const nextBtn = _btn(last ? 'See score' : 'Next question', 'primary');
    nextBtn.style.height = 'var(--control-md)';
    nextBtn.style.padding = '0 20px';
    nextBtn.addEventListener('click', async () => {
      if (!last) {
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
        clearStudyFooter();
        host.innerHTML = '';
        _renderQuizReport(host);
      }
    });
    if (_studyFooter) {
      _studyFooter.innerHTML = '';
      _studyFooter.appendChild(nextBtn);
      _studyFooter.style.display = 'flex';
    } else {
      wrap.appendChild(nextBtn);
    }
    setTimeout(() => nextBtn.focus(), 30);
  };

  _renderAnswerOptions(optionsHost, q, doSubmit);
  host.appendChild(wrap);
}

function _renderAnswerOptions(host: HTMLElement, q: IQuizQuestion, onSubmit: (a: string | string[]) => void): void {
  // Remove existing answer area
  const existing = host.querySelector('.answer-area');
  if (existing) existing.remove();

  const area = document.createElement('div');
  area.className = 'answer-area';

  const OPT_BASE =
    'padding:13px 16px;border-radius:9px;font-size:13.5px;line-height:1.45;cursor:pointer;background:var(--bg-base);transition:border-color var(--dur-fast) var(--ease-out),background-color var(--dur-fast) var(--ease-out);border:1px solid var(--border-default);color:var(--text-primary)';

  if (q.type === 'multiple_choice' || q.type === 'true_false') {
    const opts = q.type === 'true_false' ? ['True', 'False'] : q.options;
    if (q.type === 'true_false') area.style.cssText = 'display:flex;gap:8px';
    opts.forEach(opt => {
      const btn = document.createElement('div');
      btn.textContent = opt;
      btn.style.cssText =
        OPT_BASE +
        (q.type === 'true_false'
          ? ';flex:1;text-align:center;font-weight:500'
          : ';margin-bottom:8px');
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
  clearStudyFooter();
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
    const genBtn = _btn(isAiReady() ? 'Generate cards' : 'Generate demo cards', 'primary');
    genBtn.addEventListener('click', () => _generateFlashcards(host));
    empty.appendChild(genBtn);
    if (!isAiReady()) {
      const w = document.createElement('span');
      w.style.cssText = 'font-size:11.5px;color:var(--text-quaternary)';
      w.textContent = 'Demo mode — cards are generated from the section text.';
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
  regenBtn.addEventListener('click', () => _generateFlashcards(host));
  btnRow.appendChild(studyBtn);
  btnRow.appendChild(regenBtn);
  host.appendChild(btnRow);
}

function _renderStudyMode(host: HTMLElement): void {
  const card = state.fcStudyCards[state.fcIdx];
  const total = state.fcStudyCards.length;

  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;flex-direction:column;gap:18px';

  const progress = document.createElement('span');
  progress.style.cssText =
    'font-size:11.5px;color:var(--text-quaternary);font-family:var(--font-mono);text-align:center';
  progress.textContent = `Card ${state.fcIdx + 1} / ${total}`;
  wrap.appendChild(progress);

  const cardEl = document.createElement('div');
  cardEl.style.cssText = [
    'min-height:240px;background:var(--surface-card);border:1px solid var(--border-strong);border-radius:12px',
    'display:flex;flex-direction:column;align-items:center;justify-content:center;gap:12px;padding:28px',
    'cursor:pointer;text-align:center;box-shadow:0 4px 16px rgba(0,0,0,0.07);transition:border-color var(--dur-fast) var(--ease-out)',
    'animation:nm-rise 0.2s var(--ease-out) both'
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
      'display:grid;grid-template-columns:1fr 1fr 1fr 1fr;gap:10px;margin-top:2px';
    const ratings: Array<[CardRating, string, string]> = [
      ['again', 'Again', 'var(--red-400)'],
      ['good', 'Good', 'var(--text-secondary)'],
      ['easy', 'Easy', 'var(--brand-300)'],
      ['mastered', 'Mastered', 'var(--green-400)']
    ];
    ratings.forEach(([rating, label, color]) => {
      const rb = document.createElement('div');
      rb.style.cssText = `text-align:center;padding:13px 0;border-radius:10px;font-size:13.5px;font-weight:600;cursor:pointer;border:1px solid var(--border-strong);color:${color};transition:background-color var(--dur-fast) var(--ease-out),border-color var(--dur-fast) var(--ease-out)`;
      rb.textContent = label;
      rb.addEventListener('mouseenter', () => {
        rb.style.background = 'var(--alpha-6)';
        rb.style.borderColor = color;
      });
      rb.addEventListener('mouseleave', () => {
        rb.style.background = 'transparent';
        rb.style.borderColor = 'var(--border-strong)';
      });
      rb.addEventListener('click', () => _rateCard(card, rating, host));
      ratingRow.appendChild(rb);
    });
    wrap.appendChild(ratingRow);
  } else {
    // Placeholder keeps the card vertically centered before flipping.
    const hint = document.createElement('div');
    hint.style.cssText =
      'text-align:center;font-size:12px;color:var(--text-quaternary)';
    hint.textContent = 'Flip the card, then rate how well you knew it.';
    wrap.appendChild(hint);
  }

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
  if (!sec) return;
  state.fcGenerating = true;
  host.innerHTML = '';
  host.appendChild(spinner(isAiReady() ? 'Generating flashcards…' : 'Building demo cards…'));

  const startIdx = Math.max(0, state.currentSection - 1);
  const endIdx = Math.min(state.sections.length - 1, state.currentSection + 1);
  const ctx = state.sections.slice(startIdx, endIdx + 1).map(s => s.text).join('\n').substring(0, 2000);

  const cardTypes = ['term_definition', 'concept_example', 'fill_blank', 'key_claim', 'relationship'];
  const prompt = `Create 5 flashcards from this content. Return ONLY a JSON array:
[{"front":"term or question","back":"definition or answer","card_type":"${cardTypes.join('|')}"},...]
Use a different card_type for each card. Cover key concepts, definitions, and relationships.`;

  try {
    let cards: Array<{ front: string; back: string; card_type: string }>;
    if (isAiReady()) {
      const raw = await askAboutCell(ctx, prompt, []);
      const match = raw.match(/\[[\s\S]*\]/);
      if (!match) throw new Error('No JSON array');
      cards = JSON.parse(match[0]) as Array<{ front: string; back: string; card_type: string }>;
    } else {
      cards = localFlashcards(sec.title, ctx);
    }

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
    // AI failed — fall back to built-in demo cards so the tool still works.
    const now = new Date().toISOString();
    const local = localFlashcards(sec.title, ctx).map((c, i) => ({
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

    const studyOverlay = document.querySelector('.nm-study-overlay') as
      | (HTMLElement & { _renderStudyBody?: () => void; _dispose?: () => void })
      | null;

    // ── Study modal open: keys drive the quiz / flashcards ──
    if (studyOverlay) {
      if (e.key === 'Escape') {
        e.preventDefault();
        studyOverlay._dispose?.();
        return;
      }
      if (state.activeTab === 'flashcards' && state.fcStudying) {
        if (state.fcFlipped) {
          const c = state.fcStudyCards[state.fcIdx];
          if (c && e.key === '1') { void _rateCard(c, 'again', _studyBody ?? document.body); }
          else if (c && e.key === '2') { void _rateCard(c, 'good', _studyBody ?? document.body); }
          else if (c && e.key === '3') { void _rateCard(c, 'easy', _studyBody ?? document.body); }
        } else if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault();
          state.fcFlipped = true;
          studyOverlay._renderStudyBody?.();
        }
      }
      return;
    }

    // ── Reader (no modal): navigate slides ──
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
      _openStudy('quiz');
    } else if (e.key === 'f' || e.key === 'F') {
      e.preventDefault();
      _openStudy('flashcards');
    } else if (e.key === '?') {
      e.preventDefault();
      showReaderShortcuts();
    } else if (e.key === 'Escape') {
      state.isFullscreen = false;
      if (_onToggle) _onToggle(false);
      _render();
    }
  };
  document.removeEventListener('keydown', _kbHandler as EventListener);
  _kbHandler = handler;
  document.addEventListener('keydown', handler);
}

let _kbHandler: ((e: KeyboardEvent) => void) | null = null;

export function showReaderShortcuts(): void {
  const overlay = document.createElement('div');
  overlay.style.cssText =
    'position:fixed;inset:0;z-index:2000;background:var(--surface-overlay);display:flex;align-items:center;justify-content:center';
  const box = document.createElement('div');
  box.style.cssText =
    'width:320px;background:var(--bg-elevated);border:1px solid var(--border-strong);border-radius:12px;padding:22px;display:flex;flex-direction:column;gap:12px;box-shadow:0 16px 48px rgba(0,0,0,0.14);animation:nm-rise 0.15s ease-out both';
  const rows = [
    ['← →', 'Previous / next page'],
    ['U', "Toggle 'understood' for this section"],
    ['Q', 'Open quiz'],
    ['F', 'Open flashcards'],
    ['Space', 'Flip flashcard (in study)'],
    ['1 / 2 / 3', 'Rate card: Again / Good / Easy'],
    ['Esc', 'Close study / back to library']
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
