import { NotebookMindApp } from './nbApp';
import {
  explainCell,
  askAboutCell,
  summarizeNotebook,
  IChatTurn
} from './gemini';
import { button, infoBox, spinner, avatar } from './uiKit';
import { makeCodeField } from './codeField';
import { renderMarkdown } from './markdown';
import { openSlides } from './slidesModal';
import { deckForPdf } from './slidesData';
import {
  demoAssignment,
  demoCellMeta,
  demoCellSlides,
  cellTitle
} from './demoData';

interface ICellResult {
  output: string;
  images: string[];
}

type DetailTab = 'ai' | 'teacher' | 'student';

// Session-scoped stores (persist while JupyterLab stays open).
const summaryCache = new Map<string, string>();
const studentNotesStore = new Map<string, string>();

export function renderExplain(host: HTMLElement, app: NotebookMindApp): void {
  const doc = app.doc;
  if (!doc) {
    app.navigate('home');
    return;
  }
  const cells = doc.cells;
  const docKey = doc.key;

  let selected = 0;
  let detailTab: DetailTab = 'ai';
  const results: ICellResult[] = cells.map(() => ({ output: '', images: [] }));
  const explanationCache = new Map<number, string>();
  const chatHistory = new Map<number, IChatTurn[]>();

  // ── Top bar ───────────────────────────────────────────────────
  const top = document.createElement('div');
  top.style.cssText = 'margin-bottom:18px';
  const back = button('← Notebooks', 'ghost');
  back.style.marginBottom = '12px';
  back.addEventListener('click', () => app.navigate('home'));
  const h = document.createElement('div');
  h.style.cssText =
    'font-size:24px;font-weight:800;letter-spacing:-0.02em;color:var(--nm-text)';
  h.textContent = doc.name;
  const sub = document.createElement('div');
  sub.style.cssText =
    'font-size:14px;color:var(--nm-text-secondary);margin-top:4px';
  sub.textContent =
    'Explain mode — click a cell to read its explanation, teacher notes and add your own comments.';
  top.appendChild(back);
  top.appendChild(h);
  top.appendChild(sub);
  host.appendChild(top);

  const stage = document.createElement('div');
  host.appendChild(stage);

  function noteKey(i: number): string {
    return `${docKey}:${i}`;
  }

  // ── Task overview (teacher-written; seeded or AI-generated) ───
  function buildTaskCard(): void {
    const card = document.createElement('div');
    card.style.cssText = [
      'background:var(--nm-accent-light);border:1px solid var(--nm-accent-border)',
      'border-radius:var(--nm-radius-lg);padding:16px 18px;margin-bottom:20px'
    ].join(';');
    const label = document.createElement('div');
    label.style.cssText =
      'font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:var(--nm-accent-hover);margin-bottom:6px';
    label.textContent = '👩‍🏫 Assignment';
    const body = document.createElement('div');
    body.style.cssText = 'font-size:14px;color:var(--nm-text);line-height:1.65';
    card.appendChild(label);
    card.appendChild(body);
    stage.appendChild(card);

    const seeded = demoAssignment(docKey);
    if (seeded) {
      body.textContent = seeded;
      return;
    }
    const cached = summaryCache.get(docKey);
    if (cached) {
      body.textContent = cached;
      return;
    }
    body.textContent = 'Generating assignment overview…';
    body.style.color = 'var(--nm-text-muted)';
    void summarizeNotebook(cells)
      .then(text => {
        summaryCache.set(docKey, text);
        body.textContent = text;
        body.style.color = 'var(--nm-text)';
      })
      .catch(() => {
        body.textContent =
          'Work through each cell and make sure you understand what it produces.';
        body.style.color = 'var(--nm-text)';
      });
  }

  // ── Split layout ──────────────────────────────────────────────
  let rightCol!: HTMLElement;
  const cellEls: HTMLElement[] = [];

  function highlight(): void {
    cellEls.forEach((el, i) => {
      const on = i === selected;
      el.style.borderColor = on ? 'var(--nm-accent)' : 'var(--nm-border)';
      el.style.boxShadow = on ? 'var(--nm-shadow-md)' : 'var(--nm-shadow-xs)';
    });
  }

  function buildSplit(): void {
    stage.innerHTML = '';
    buildTaskCard();

    const split = document.createElement('div');
    split.style.cssText =
      'display:flex;gap:20px;align-items:flex-start;flex-wrap:wrap';
    const leftCol = document.createElement('div');
    leftCol.style.cssText = 'flex:1 1 380px;min-width:300px';
    rightCol = document.createElement('div');
    rightCol.style.cssText =
      'flex:1 1 360px;min-width:300px;position:sticky;top:0';
    split.appendChild(leftCol);
    split.appendChild(rightCol);
    stage.appendChild(split);

    cellEls.length = 0;
    cells.forEach((code, i) => {
      leftCol.appendChild(makeCellCard(i, code));
    });

    highlight();
    renderDetail();
  }

  function makeCellCard(i: number, code: string): HTMLElement {
    const card = document.createElement('div');
    card.style.cssText = [
      'background:#fff;border:1px solid var(--nm-border);border-radius:var(--nm-radius-lg)',
      'padding:14px;margin-bottom:12px;cursor:pointer;transition:all 0.15s;box-shadow:var(--nm-shadow-xs)'
    ].join(';');
    card.addEventListener('click', () => {
      selected = i;
      highlight();
      renderDetail();
    });

    const headRow = document.createElement('div');
    headRow.style.cssText =
      'display:flex;justify-content:space-between;align-items:center;gap:10px;margin-bottom:10px';

    const title = document.createElement('div');
    title.style.cssText =
      'font-size:14px;font-weight:700;color:var(--nm-text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis';
    title.textContent = cellTitle(docKey, code, i);

    const rightGroup = document.createElement('div');
    rightGroup.style.cssText =
      'display:flex;align-items:center;gap:8px;flex-shrink:0';
    const tag = document.createElement('span');
    tag.style.cssText =
      'font-family:var(--nm-font-mono);font-size:11px;color:var(--nm-text-faint)';
    tag.textContent = `In [${i + 1}]`;
    rightGroup.appendChild(tag);

    headRow.appendChild(title);
    headRow.appendChild(rightGroup);
    card.appendChild(headRow);

    const cv = makeCodeField(code, { readOnly: true });
    card.appendChild(cv.dom);

    const outText = results[i].output.trim();
    if (outText) {
      const out = document.createElement('pre');
      out.style.cssText = [
        'margin:10px 0 0;font-family:var(--nm-font-mono);font-size:11.5px;line-height:1.5',
        'white-space:pre-wrap;color:var(--nm-text-secondary);max-height:160px;overflow:auto'
      ].join(';');
      out.textContent = outText;
      card.appendChild(out);
    }

    // Chart: render the figure directly under the code/output.
    if (results[i].images.length > 0) {
      const chartLabel = document.createElement('div');
      chartLabel.style.cssText =
        'font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:var(--nm-text-muted);margin:12px 0 6px';
      chartLabel.textContent = '📈 Chart output';
      card.appendChild(chartLabel);
      results[i].images.forEach(src => {
        const img = document.createElement('img');
        img.src = src;
        img.style.cssText =
          'max-width:100%;border:1px solid var(--nm-border);border-radius:var(--nm-radius);margin-top:4px;display:block';
        card.appendChild(img);
      });
    }

    cellEls.push(card);
    return card;
  }

  // ── Detail panel with tabs ────────────────────────────────────
  function renderDetail(): void {
    rightCol.innerHTML = '';
    const i = selected;

    const panel = document.createElement('div');
    panel.style.cssText = [
      'background:#fff;border:1px solid var(--nm-border);border-radius:var(--nm-radius-lg)',
      'padding:18px;box-shadow:var(--nm-shadow-sm);max-height:calc(100vh - 120px);overflow:auto'
    ].join(';');

    const title = document.createElement('div');
    title.style.cssText =
      'font-size:17px;font-weight:800;color:var(--nm-text);margin-bottom:14px;line-height:1.3';
    title.textContent = cellTitle(docKey, cells[i], i);
    panel.appendChild(title);

    // Tabs
    const tabs: { id: DetailTab; label: string }[] = [
      { id: 'ai', label: '🤖 AI' },
      { id: 'teacher', label: '👩‍🏫 Teacher' },
      { id: 'student', label: '💬 Students' }
    ];
    const tabBar = document.createElement('div');
    tabBar.style.cssText =
      'display:flex;gap:6px;margin-bottom:16px;border-bottom:1px solid var(--nm-border)';
    const content = document.createElement('div');

    tabs.forEach(t => {
      const b = document.createElement('button');
      b.textContent = t.label;
      const on = detailTab === t.id;
      b.style.cssText = [
        'flex:1;padding:9px 4px;border:none;background:transparent;cursor:pointer',
        'font-size:13px;font-weight:600;font-family:var(--nm-font)',
        `color:${on ? 'var(--nm-accent)' : 'var(--nm-text-secondary)'}`,
        `border-bottom:2px solid ${on ? 'var(--nm-accent)' : 'transparent'};margin-bottom:-1px`
      ].join(';');
      b.addEventListener('click', () => {
        detailTab = t.id;
        renderDetail();
      });
      tabBar.appendChild(b);
    });

    if (detailTab === 'ai') {
      renderAiTab(content, i);
    } else if (detailTab === 'teacher') {
      renderTeacherTab(content, i);
    } else {
      renderStudentTab(content, i);
    }

    panel.appendChild(tabBar);
    panel.appendChild(content);
    rightCol.appendChild(panel);
  }

  function renderAiTab(host: HTMLElement, i: number): void {
    const expArea = document.createElement('div');
    expArea.style.marginBottom = '16px';
    host.appendChild(expArea);

    const meta = demoCellMeta(docKey, i);
    if (meta?.ai) {
      expArea.appendChild(renderMarkdown(meta.ai));
    } else {
      const cached = explanationCache.get(i);
      if (cached) {
        expArea.appendChild(renderMarkdown(cached));
      } else {
        expArea.appendChild(spinner('Generating explanation…'));
        void explainCell(cells[i], 'intermediate')
          .then(text => {
            explanationCache.set(i, text);
            if (selected === i && detailTab === 'ai') {
              expArea.innerHTML = '';
              expArea.appendChild(renderMarkdown(text));
            }
          })
          .catch(() => {
            expArea.innerHTML = '';
            expArea.appendChild(
              infoBox('Could not generate an explanation. Check your AI key.', 'error')
            );
          });
      }
    }

    host.appendChild(sectionLabel('Ask about this cell'));
    host.appendChild(buildChat(i));
  }

  function renderTeacherTab(host: HTMLElement, i: number): void {
    const meta = demoCellMeta(docKey, i);
    if (meta?.teacher) {
      const wrap = document.createElement('div');
      wrap.style.cssText = [
        'border-left:3px solid var(--nm-warn);background:rgba(234,179,8,0.08)',
        'border-radius:0 var(--nm-radius) var(--nm-radius) 0;padding:13px 16px'
      ].join(';');
      wrap.appendChild(renderMarkdown(meta.teacher));
      host.appendChild(wrap);
    } else {
      host.appendChild(
        infoBox(
          'No teacher explanation for this cell yet — teacher authoring is coming soon.',
          'info'
        )
      );
    }

    // Teacher-linked lecture slides — open in a scrollable popup at the right slide.
    const slides = demoCellSlides(docKey, i);
    const deck = slides ? deckForPdf(slides.pdf) : undefined;
    if (slides && deck) {
      const matLabel = sectionLabel('📄 Lecture material');
      matLabel.style.marginTop = '14px';
      host.appendChild(matLabel);

      const open = button(`📄 ${slides.label}`, 'secondary');
      open.style.width = '100%';
      open.addEventListener('click', () => openSlides(deck, slides.page - 1));
      host.appendChild(open);
    }
  }

  function renderStudentTab(host: HTMLElement, i: number): void {
    const meta = demoCellMeta(docKey, i);

    // Seeded classmate comments (read-only) with an initials avatar.
    (meta?.students ?? []).forEach(c => {
      const row = document.createElement('div');
      row.style.cssText =
        'display:flex;gap:10px;align-items:flex-start;background:var(--nm-bg-subtle);border:1px solid var(--nm-border);border-radius:var(--nm-radius);padding:10px 12px;margin-bottom:8px';
      row.appendChild(avatar(c.author));
      const col = document.createElement('div');
      col.style.minWidth = '0';
      const who = document.createElement('div');
      who.style.cssText =
        'font-size:11px;font-weight:700;color:var(--nm-text);margin-bottom:3px';
      who.textContent = c.author;
      const txt = document.createElement('div');
      txt.style.cssText = 'font-size:13px;color:var(--nm-text);line-height:1.55';
      txt.textContent = c.text;
      col.appendChild(who);
      col.appendChild(txt);
      row.appendChild(col);
      host.appendChild(row);
    });

    // The learner's own editable note.
    const lbl = sectionLabel('Your note');
    lbl.style.marginTop = (meta?.students?.length ?? 0) ? '12px' : '0';
    host.appendChild(lbl);

    const ta = document.createElement('textarea');
    ta.rows = 3;
    ta.value = studentNotesStore.get(noteKey(i)) ?? '';
    ta.placeholder =
      'What clicked for you here, or what you misread at first…';
    ta.style.cssText = [
      'width:100%;box-sizing:border-box;resize:vertical;font-family:var(--nm-font);font-size:13px',
      'padding:9px 11px;border:1px solid var(--nm-border);border-radius:var(--nm-radius);outline:none;color:var(--nm-text)'
    ].join(';');
    host.appendChild(ta);

    const save = button('Save note', 'secondary');
    save.style.marginTop = '8px';
    save.addEventListener('click', () => {
      const v = ta.value.trim();
      if (v) {
        studentNotesStore.set(noteKey(i), v);
      } else {
        studentNotesStore.delete(noteKey(i));
      }
      save.textContent = 'Saved ✓';
      setTimeout(() => {
        save.textContent = 'Save note';
      }, 1200);
    });
    host.appendChild(save);
  }

  function sectionLabel(text: string): HTMLElement {
    const el = document.createElement('div');
    el.style.cssText =
      'font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:0.6px;color:var(--nm-text-muted);margin:4px 0 8px';
    el.textContent = text;
    return el;
  }

  // ── Per-cell chat (input height matches the send button) ──────
  function buildChat(i: number): HTMLElement {
    const wrap = document.createElement('div');

    const log = document.createElement('div');
    log.style.cssText =
      'display:flex;flex-direction:column;gap:8px;max-height:240px;overflow-y:auto;margin-bottom:10px';

    const history = chatHistory.get(i) ?? [];
    if (history.length === 0) {
      const hint = document.createElement('div');
      hint.style.cssText =
        'font-size:12.5px;color:var(--nm-text-faint);font-style:italic';
      hint.textContent =
        'e.g. "Why .clip(0,100)?" or "What would change if I removed this line?"';
      log.appendChild(hint);
    } else {
      history.forEach(t => log.appendChild(bubble(t.role, t.text)));
    }

    const inputRow = document.createElement('div');
    inputRow.style.cssText = 'display:flex;gap:8px;align-items:stretch';
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Ask a question…';
    input.style.cssText = [
      'flex:1;box-sizing:border-box;height:40px;font-family:var(--nm-font);font-size:13px',
      'padding:0 12px;border:1px solid var(--nm-border);border-radius:var(--nm-radius);outline:none;color:var(--nm-text)'
    ].join(';');
    input.addEventListener('focus', () => {
      input.style.borderColor = 'var(--nm-accent)';
    });
    input.addEventListener('blur', () => {
      input.style.borderColor = 'var(--nm-border)';
    });

    const send = button('Ask', 'accent');
    send.style.height = '40px';
    send.style.padding = '0 16px';
    send.addEventListener('click', () => void submit());
    input.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        void submit();
      }
    });

    async function submit(): Promise<void> {
      const q = input.value.trim();
      if (!q) {
        return;
      }
      input.value = '';
      const hist = chatHistory.get(i) ?? [];
      if (hist.length === 0) {
        log.innerHTML = '';
      }
      hist.push({ role: 'user', text: q });
      log.appendChild(bubble('user', q));
      const thinking = bubble('assistant', '…');
      log.appendChild(thinking);
      log.scrollTop = log.scrollHeight;
      send.disabled = true;
      try {
        const answer = await askAboutCell(
          cells[i],
          q,
          hist.slice(0, -1),
          results[i].output
        );
        thinking.textContent = answer;
        hist.push({ role: 'assistant', text: answer });
        chatHistory.set(i, hist);
      } catch {
        thinking.textContent = 'Sorry — something went wrong. Try again.';
      } finally {
        send.disabled = false;
        log.scrollTop = log.scrollHeight;
      }
    }

    inputRow.appendChild(input);
    inputRow.appendChild(send);
    wrap.appendChild(log);
    wrap.appendChild(inputRow);
    return wrap;
  }

  function bubble(role: 'user' | 'assistant', text: string): HTMLElement {
    const b = document.createElement('div');
    const isUser = role === 'user';
    b.style.cssText = [
      'font-size:13px;line-height:1.6;padding:9px 12px;border-radius:var(--nm-radius);max-width:90%;white-space:pre-wrap',
      isUser
        ? 'align-self:flex-end;background:var(--nm-accent);color:#fff'
        : 'align-self:flex-start;background:var(--nm-bg-subtle);color:var(--nm-text);border:1px solid var(--nm-border)'
    ].join(';');
    b.textContent = text;
    return b;
  }

  // ── Preparation: run all cells to capture output + figures ────
  async function prepare(): Promise<void> {
    stage.innerHTML = '';
    const prep = spinner('Starting Python kernel…');
    stage.appendChild(prep);

    let ok = false;
    try {
      await app.runner.ready();
      ok = true;
    } catch {
      ok = false;
    }

    if (ok) {
      try {
        await app.runner.restart();
        await app.runner.run('%matplotlib inline');
      } catch {
        // best effort
      }
      for (let i = 0; i < cells.length; i++) {
        prep.textContent = `Running cells… (${i + 1}/${cells.length})`;
        try {
          const r = await app.runner.run(cells[i]);
          results[i] = { output: r.output, images: r.images };
        } catch {
          results[i] = { output: '', images: [] };
        }
      }
    } else {
      const warn = infoBox(
        '⚠️ No Python kernel available — showing code and explanations without live output or charts.',
        'warn'
      );
      warn.style.marginBottom = '16px';
      host.insertBefore(warn, stage);
    }

    buildSplit();
  }

  void prepare();
}
