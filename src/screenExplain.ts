import { NotebookMindApp } from './nbApp';
import { explainCell, askAboutCell, IChatTurn } from './gemini';
import { button, infoBox, spinner, avatar, tabBar } from './uiKit';
import { renderMarkdown } from './markdown';
import { openSlides, renderSlide } from './slidesModal';
import { deckForPdf } from './slidesData';
import { demoCellMeta, demoCellSlides, cellTitle } from './demoData';

interface ICellResult {
  output: string;
  images: string[];
}

type DetailTab = 'ai' | 'teacher' | 'student';

const CAPS =
  'font-size:11px;color:var(--text-quaternary);text-transform:uppercase;letter-spacing:0.06em;font-weight:600';

// Session-scoped stores (persist while JupyterLab stays open).
const studentNotesStore = new Map<string, string>();
const sideNotesStore = new Map<string, string[]>();

/**
 * Explain mode — prototype layout. One card per cell (code · output band ·
 * insight tabs), all three insight sources share one panel shell, and on wide
 * screens sticky margin-note columns flank each card.
 */
export function renderExplain(host: HTMLElement, app: NotebookMindApp): void {
  const doc = app.doc;
  if (!doc) {
    app.navigate('home');
    return;
  }
  const cells = doc.cells;
  const docKey = doc.key;

  const results: ICellResult[] = cells.map(() => ({ output: '', images: [] }));
  const explanationCache = new Map<number, string>();
  const chatHistory = new Map<number, IChatTurn[]>();
  const tabState = new Map<number, DetailTab>();

  const stage = document.createElement('div');
  host.appendChild(stage);

  function noteKey(i: number): string {
    return `${docKey}:${i}`;
  }

  // ── Build ─────────────────────────────────────────────────────
  function build(): void {
    stage.innerHTML = '';
    const col = document.createElement('div');
    col.style.cssText =
      'width:100%;display:flex;flex-direction:column;gap:16px';
    stage.appendChild(col);
    const wide = window.innerWidth >= 1410;
    cells.forEach((code, i) => col.appendChild(makeCellRow(i, code, wide)));
  }

  /** Grid row: optional left margin-notes · card · optional right margin-notes. */
  function makeCellRow(i: number, code: string, wide: boolean): HTMLElement {
    const row = document.createElement('div');
    row.style.cssText = wide
      ? 'display:grid;grid-template-columns:160px minmax(0,780px) 160px;gap:12px;justify-content:center;align-items:start'
      : 'display:grid;grid-template-columns:minmax(0,780px);gap:0;justify-content:center;align-items:start';
    if (wide) row.appendChild(marginColumn(i, 'L'));
    row.appendChild(makeCellCard(i, code));
    if (wide) row.appendChild(marginColumn(i, 'R'));
    return row;
  }

  // ── Sticky margin notes (prototype) ───────────────────────────
  function marginColumn(i: number, side: 'L' | 'R'): HTMLElement {
    const key = `${noteKey(i)}-${side}`;
    const col = document.createElement('div');
    col.style.cssText = [
      'display:flex;flex-direction:column;gap:8px;position:sticky;top:16px;align-self:stretch;cursor:cell',
      side === 'L' ? 'align-items:flex-end;padding-right:2px' : 'align-items:flex-start;padding-left:2px'
    ].join(';');

    const paint = (): void => {
      col.innerHTML = '';
      const notes = sideNotesStore.get(key) ?? [];
      notes.forEach((text, ni) => {
        const note = document.createElement('div');
        note.style.cssText =
          'width:152px;max-width:38vw;box-sizing:border-box;display:flex;flex-direction:column;gap:5px;padding:9px 10px;background:var(--yellow-bg);border:1px solid rgba(178,125,32,0.28);border-radius:8px;cursor:auto';
        note.addEventListener('click', e => e.stopPropagation());
        const head = document.createElement('div');
        head.style.cssText = 'display:flex;align-items:center;gap:6px';
        head.innerHTML =
          '<span style="font-size:9.5px;font-weight:600;letter-spacing:0.07em;text-transform:uppercase;color:var(--yellow-500)">Note</span><span style="flex:1"></span>';
        const del = document.createElement('span');
        del.textContent = '✕';
        del.style.cssText =
          'cursor:pointer;font-size:12px;color:var(--text-quaternary);line-height:1';
        del.addEventListener('mouseenter', () => (del.style.color = 'var(--red-400)'));
        del.addEventListener('mouseleave', () => (del.style.color = 'var(--text-quaternary)'));
        del.addEventListener('click', e => {
          e.stopPropagation();
          const arr = (sideNotesStore.get(key) ?? []).filter((_, j) => j !== ni);
          sideNotesStore.set(key, arr);
          paint();
        });
        head.appendChild(del);
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.placeholder = 'Write a note…';
        ta.style.cssText =
          'width:100%;box-sizing:border-box;resize:vertical;min-height:52px;background:transparent;color:var(--text-primary);border:none;padding:0;font-family:var(--font-sans);font-size:12px;line-height:1.55;outline:none';
        ta.addEventListener('input', () => {
          const arr = (sideNotesStore.get(key) ?? []).slice();
          arr[ni] = ta.value;
          sideNotesStore.set(key, arr);
        });
        note.appendChild(head);
        note.appendChild(ta);
        col.appendChild(note);
      });

      const hint = document.createElement('span');
      hint.style.cssText =
        'display:inline-flex;align-items:center;gap:4px;font-size:10.5px;font-weight:500;color:var(--yellow-500);border:1px dashed rgba(178,125,32,0.5);border-radius:999px;padding:3px 9px;white-space:nowrap;pointer-events:none;transition:opacity 0.12s ease-out;opacity:' +
        (notes.length > 0 ? '0' : '0.55');
      hint.innerHTML =
        '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>Note';
      col.appendChild(hint);
    };

    col.addEventListener('click', () => {
      const arr = (sideNotesStore.get(key) ?? []).slice();
      arr.push('');
      sideNotesStore.set(key, arr);
      paint();
      const areas = col.querySelectorAll('textarea');
      (areas[areas.length - 1] as HTMLTextAreaElement | undefined)?.focus();
    });

    paint();
    return col;
  }

  // ── Cell card ─────────────────────────────────────────────────
  function makeCellCard(i: number, code: string): HTMLElement {
    const card = document.createElement('div');
    card.style.cssText =
      'background:var(--surface-card);border:1px solid var(--border-default);border-radius:10px;overflow:hidden';

    // Header: 01 + title
    const headRow = document.createElement('div');
    headRow.style.cssText =
      'display:flex;align-items:center;gap:10px;padding:11px 16px;border-bottom:1px solid var(--border-subtle)';
    headRow.innerHTML =
      `<span style="font-size:11px;font-weight:600;color:var(--text-quaternary);font-family:var(--font-mono)">${String(i + 1).padStart(2, '0')}</span>` +
      `<span style="font-size:13.5px;font-weight:600;letter-spacing:-0.012em;color:var(--text-primary)">${cellTitle(docKey, code, i)}</span>`;
    card.appendChild(headRow);

    // Code (flush)
    const pre = document.createElement('pre');
    pre.style.cssText =
      'margin:0;padding:12px 16px;font-family:var(--font-mono);font-size:12px;line-height:1.6;color:var(--text-secondary);background:var(--bg-base);overflow-x:auto;white-space:pre';
    pre.textContent = code;
    card.appendChild(pre);

    // Output band
    const band = document.createElement('div');
    band.style.cssText =
      'padding:12px 16px;border-top:1px solid var(--border-subtle);border-bottom:1px solid var(--border-subtle);background:var(--bg-base)';
    const bandLbl = document.createElement('span');
    bandLbl.style.cssText = `${CAPS};font-size:10px;letter-spacing:0.07em;display:flex;align-items:center;gap:6px;margin-bottom:8px`;
    bandLbl.innerHTML =
      '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"></polyline><line x1="12" y1="19" x2="20" y2="19"></line></svg>Output';
    band.appendChild(bandLbl);
    const outBox = document.createElement('div');
    outBox.style.cssText =
      'padding:11px 13px;background:var(--bg-panel);border:1px solid var(--border-default);border-radius:7px';
    const outText = results[i].output.trim();
    if (outText) {
      const out = document.createElement('pre');
      out.style.cssText =
        'margin:0;font-family:var(--font-mono);font-size:12px;line-height:1.6;color:var(--text-secondary);white-space:pre-wrap;max-height:180px;overflow:auto';
      out.textContent = outText;
      outBox.appendChild(out);
    }
    results[i].images.forEach(src => {
      const img = document.createElement('img');
      img.src = src;
      img.style.cssText =
        'max-width:100%;border-radius:5px;display:block' +
        (outText ? ';margin-top:8px' : '');
      outBox.appendChild(img);
    });
    if (!outText && results[i].images.length === 0) {
      const none = document.createElement('span');
      none.style.cssText =
        'font-size:12px;color:var(--text-quaternary);font-style:italic';
      none.textContent = 'no printed output';
      outBox.appendChild(none);
    }
    band.appendChild(outBox);
    card.appendChild(band);

    // ── Insight source switch + panel ───────────────────────────
    const tabsRow = document.createElement('div');
    tabsRow.style.cssText = 'display:flex;gap:2px;padding:10px 16px 0';
    const body = document.createElement('div');
    body.style.cssText =
      'margin:10px 16px 16px;padding:14px;background:var(--bg-panel);border:1px solid var(--border-subtle);border-radius:8px;display:flex;flex-direction:column;gap:12px';

    tabsRow.appendChild(
      tabBar(
        [
          { id: 'ai', label: 'AI explanation' },
          { id: 'teacher', label: 'Teacher notes' },
          { id: 'student', label: 'Student comments' }
        ],
        tabState.get(i) ?? 'ai',
        id => {
          tabState.set(i, id as DetailTab);
          renderTab(body, i);
        }
      )
    );
    card.appendChild(tabsRow);
    card.appendChild(body);

    renderTab(body, i);
    return card;
  }

  function renderTab(body: HTMLElement, i: number): void {
    body.innerHTML = '';
    const tab = tabState.get(i) ?? 'ai';
    if (tab === 'ai') {
      renderAiTab(body, i);
    } else if (tab === 'teacher') {
      renderTeacherTab(body, i);
    } else {
      renderStudentTab(body, i);
    }
  }

  // ── AI tab: explanation + matching slide + chat ───────────────
  function renderAiTab(body: HTMLElement, i: number): void {
    const textWrap = document.createElement('div');
    textWrap.style.cssText =
      'display:flex;flex-direction:column;gap:8px;font-size:13px;line-height:1.7;color:var(--text-secondary)';
    body.appendChild(textWrap);

    const meta = demoCellMeta(docKey, i);
    if (meta?.ai) {
      textWrap.appendChild(renderMarkdown(meta.ai));
    } else {
      const cached = explanationCache.get(i);
      if (cached) {
        textWrap.appendChild(renderMarkdown(cached));
      } else {
        textWrap.appendChild(spinner('Generating explanation…'));
        void explainCell(cells[i], 'intermediate')
          .then(text => {
            explanationCache.set(i, text);
            if ((tabState.get(i) ?? 'ai') === 'ai') {
              textWrap.innerHTML = '';
              textWrap.appendChild(renderMarkdown(text));
            }
          })
          .catch(() => {
            textWrap.innerHTML = '';
            textWrap.appendChild(
              infoBox('Could not generate an explanation. Check your AI key.', 'error')
            );
          });
      }
    }

    body.appendChild(buildSlideEmbed(i));
    body.appendChild(buildChat(i));
  }

  // ── Teacher tab ───────────────────────────────────────────────
  function renderTeacherTab(body: HTMLElement, i: number): void {
    const meta = demoCellMeta(docKey, i);
    if (meta?.teacher) {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:10px;align-items:flex-start';
      row.appendChild(avatar('Teacher', 22));
      const col = document.createElement('div');
      col.style.cssText = 'display:flex;flex-direction:column;gap:3px;min-width:0';
      const name = document.createElement('span');
      name.style.cssText =
        'font-size:12px;font-weight:600;color:var(--text-primary)';
      name.textContent = 'Your teacher';
      const text = document.createElement('div');
      text.style.cssText =
        'font-size:13px;line-height:1.65;color:var(--text-secondary)';
      text.appendChild(renderMarkdown(meta.teacher));
      col.appendChild(name);
      col.appendChild(text);
      row.appendChild(col);
      body.appendChild(row);
    } else {
      const empty = document.createElement('div');
      empty.style.cssText =
        'display:flex;flex-direction:column;align-items:center;gap:8px;padding:18px;text-align:center';
      empty.innerHTML =
        '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="var(--text-quaternary)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"></path></svg>' +
        '<span style="font-size:12.5px;color:var(--text-tertiary)">No teacher note for this cell yet.</span>';
      const req = button('Request a note', 'secondary');
      req.style.height = 'var(--control-sm)';
      req.style.fontSize = '12px';
      const confirm = document.createElement('span');
      confirm.style.cssText =
        'font-size:12px;color:var(--accent-text);display:none';
      req.addEventListener('click', () => {
        document.dispatchEvent(
          new CustomEvent('notebookmind:material-request', {
            detail: { docKey, cellIndex: i, type: 'missing_info' }
          })
        );
        confirm.textContent =
          'Flagged — the teacher will see that this cell needs more material.';
        confirm.style.display = '';
      });
      empty.appendChild(req);
      empty.appendChild(confirm);
      body.appendChild(empty);
    }
  }

  // ── Students tab ──────────────────────────────────────────────
  function renderStudentTab(body: HTMLElement, i: number): void {
    const meta = demoCellMeta(docKey, i);
    const comments = meta?.students ?? [];
    if (comments.length === 0) {
      const none = document.createElement('span');
      none.style.cssText =
        'font-size:12.5px;color:var(--text-tertiary);text-align:center;padding:8px';
      none.textContent =
        'No classmate comments on this cell yet — yours could be the first.';
      body.appendChild(none);
    }
    comments.forEach(c => {
      const row = document.createElement('div');
      row.style.cssText = 'display:flex;gap:10px;align-items:flex-start';
      row.appendChild(avatar(c.author, 22));
      const col = document.createElement('div');
      col.style.cssText = 'display:flex;flex-direction:column;gap:3px;min-width:0';
      col.innerHTML =
        `<span style="font-size:12px;font-weight:600;color:var(--text-primary)">${c.author}</span>` +
        `<p style="margin:0;font-size:13px;line-height:1.6;color:var(--text-secondary)">${c.text}</p>`;
      row.appendChild(col);
      body.appendChild(row);
    });

    const noteWrap = document.createElement('div');
    noteWrap.style.cssText =
      'display:flex;flex-direction:column;gap:6px;border-top:1px solid var(--border-subtle);padding-top:12px';
    const lbl = document.createElement('span');
    lbl.style.cssText = CAPS;
    lbl.textContent = 'Your note';
    const ta = document.createElement('textarea');
    ta.rows = 2;
    ta.value = studentNotesStore.get(noteKey(i)) ?? '';
    ta.placeholder = 'Share what helped you understand this cell…';
    ta.style.cssText =
      'width:100%;box-sizing:border-box;resize:vertical;background:var(--bg-base);color:var(--text-primary);border:1px solid var(--border-strong);border-radius:7px;padding:9px 12px;font-family:var(--font-sans);font-size:13px;line-height:1.5;outline:none;transition:border-color var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out)';
    ta.addEventListener('focus', () => {
      ta.style.borderColor = 'var(--accent)';
      ta.style.boxShadow = '0 0 0 3px var(--brand-glow)';
    });
    ta.addEventListener('blur', () => {
      ta.style.borderColor = 'var(--border-strong)';
      ta.style.boxShadow = 'none';
    });
    // Auto-saves like the prototype.
    ta.addEventListener('input', () => {
      const v = ta.value.trim();
      if (v) {
        studentNotesStore.set(noteKey(i), v);
      } else {
        studentNotesStore.delete(noteKey(i));
      }
    });
    noteWrap.appendChild(lbl);
    noteWrap.appendChild(ta);
    body.appendChild(noteWrap);
  }

  // ── Matching slide (prototype box) ────────────────────────────
  function buildSlideEmbed(i: number): HTMLElement {
    const slides = demoCellSlides(docKey, i);
    const deck = slides ? deckForPdf(slides.pdf) : undefined;

    const box = document.createElement('div');
    box.style.cssText =
      'display:flex;gap:12px;align-items:stretch;padding:10px;background:var(--bg-base);border:1px solid var(--border-subtle);border-radius:7px';

    if (slides && deck) {
      const idx = Math.max(0, Math.min(slides.page - 1, deck.slides.length - 1));

      // Miniature: real slide rendered at 3× and scaled down.
      const frame = document.createElement('div');
      frame.style.cssText =
        'flex:0 0 148px;aspect-ratio:16/10;border-radius:5px;background:var(--surface-card);border:1px solid var(--border-default);position:relative;overflow:hidden';
      const holder = document.createElement('div');
      holder.style.cssText =
        'position:absolute;top:0;left:0;width:300%;transform:scale(0.3333);transform-origin:top left';
      holder.appendChild(renderSlide(deck.slides[idx], idx + 1, deck.slides.length));
      frame.appendChild(holder);
      box.appendChild(frame);

      const col = document.createElement('div');
      col.style.cssText =
        'display:flex;flex-direction:column;gap:6px;justify-content:center;min-width:0';
      const lbl = document.createElement('span');
      lbl.style.cssText = CAPS;
      lbl.textContent = 'Matching slide';
      const ref = document.createElement('span');
      ref.style.cssText = 'font-size:12.5px;color:var(--text-secondary)';
      ref.textContent = `${slides.label} · slide ${idx + 1} of ${deck.slides.length}`;
      const open = document.createElement('span');
      open.style.cssText =
        'font-size:12px;color:var(--accent-text);cursor:pointer;font-weight:500';
      open.textContent = 'Open the full deck →';
      open.addEventListener('mouseenter', () => {
        open.style.textDecoration = 'underline';
      });
      open.addEventListener('mouseleave', () => {
        open.style.textDecoration = 'none';
      });
      open.addEventListener('click', () => openSlides(deck, idx));
      col.appendChild(lbl);
      col.appendChild(ref);
      col.appendChild(open);
      box.appendChild(col);
      return box;
    }

    // No slide linked → request row
    const col = document.createElement('div');
    col.style.cssText =
      'display:flex;flex-direction:column;gap:6px;justify-content:center;min-width:0;flex:1';
    const lbl = document.createElement('span');
    lbl.style.cssText = CAPS;
    lbl.textContent = 'Matching slide';
    const none = document.createElement('span');
    none.style.cssText = 'font-size:12.5px;color:var(--text-tertiary)';
    none.textContent = 'No lecture slide is linked to this cell yet.';
    const req = document.createElement('span');
    req.style.cssText =
      'font-size:12px;color:var(--accent-text);cursor:pointer;font-weight:500';
    req.textContent = 'Request slides from your teacher →';
    req.addEventListener('click', () => {
      document.dispatchEvent(
        new CustomEvent('notebookmind:material-request', {
          detail: { docKey, cellIndex: i, type: 'request_slides' }
        })
      );
      req.textContent = 'Request sent ✓';
      req.style.cursor = 'default';
    });
    col.appendChild(lbl);
    col.appendChild(none);
    col.appendChild(req);
    box.appendChild(col);
    return box;
  }

  // ── Per-cell chat (prototype bubbles) ─────────────────────────
  function buildChat(i: number): HTMLElement {
    const wrap = document.createElement('div');
    wrap.style.cssText =
      'display:flex;flex-direction:column;gap:8px;border-top:1px solid var(--border-subtle);padding-top:12px';
    const lbl = document.createElement('span');
    lbl.style.cssText = CAPS;
    lbl.textContent = 'Ask about this cell';
    wrap.appendChild(lbl);

    const log = document.createElement('div');
    log.style.cssText =
      'display:flex;flex-direction:column;gap:8px;max-height:260px;overflow-y:auto';
    const history = chatHistory.get(i) ?? [];
    history.forEach(t => log.appendChild(bubble(t.role, t.text)));
    wrap.appendChild(log);

    const inputRow = document.createElement('div');
    inputRow.style.cssText = 'display:flex;gap:8px;align-items:stretch';
    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = 'Why does this work? What if…?';
    input.style.cssText =
      'flex:1;height:38px;box-sizing:border-box;background:var(--bg-base);color:var(--text-primary);border:1px solid var(--border-strong);border-radius:7px;padding:0 12px;font-size:13px;font-family:var(--font-sans);outline:none;transition:border-color var(--dur-fast) var(--ease-out), box-shadow var(--dur-fast) var(--ease-out)';
    input.addEventListener('focus', () => {
      input.style.borderColor = 'var(--accent)';
      input.style.boxShadow = '0 0 0 3px var(--brand-glow)';
    });
    input.addEventListener('blur', () => {
      input.style.borderColor = 'var(--border-strong)';
      input.style.boxShadow = 'none';
    });

    const send = button('Ask', 'secondary');
    send.style.height = '38px';
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
      hist.push({ role: 'user', text: q });
      log.appendChild(bubble('user', q));
      const thinking = document.createElement('span');
      thinking.style.cssText =
        'font-size:12px;color:var(--text-quaternary);animation:nm-pulse 1.2s ease-in-out infinite';
      thinking.textContent = 'Thinking…';
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
        thinking.remove();
        log.appendChild(bubble('assistant', answer));
        hist.push({ role: 'assistant', text: answer });
        chatHistory.set(i, hist);
      } catch {
        thinking.remove();
        log.appendChild(bubble('assistant', 'Sorry — something went wrong. Try again.'));
      } finally {
        send.disabled = false;
        log.scrollTop = log.scrollHeight;
      }
    }

    inputRow.appendChild(input);
    inputRow.appendChild(send);
    wrap.appendChild(inputRow);
    return wrap;
  }

  function bubble(role: 'user' | 'assistant', text: string): HTMLElement {
    const row = document.createElement('div');
    row.style.cssText =
      'display:flex;' +
      (role === 'user' ? 'justify-content:flex-end' : 'justify-content:flex-start');
    const b = document.createElement('div');
    b.style.cssText = [
      'max-width:82%;padding:8px 12px;border-radius:10px;font-size:12.5px;line-height:1.55;white-space:pre-wrap',
      role === 'user'
        ? 'background:var(--accent-subtle-bg);color:var(--text-primary);border:1px solid rgba(94,106,210,0.3)'
        : 'background:var(--bg-base);color:var(--text-secondary);border:1px solid var(--border-subtle)'
    ].join(';');
    b.textContent = text;
    row.appendChild(b);
    return row;
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
        'No Python kernel available — showing code and explanations without live output or charts.',
        'warn'
      );
      warn.style.cssText += ';max-width:780px;margin:0 auto 16px';
      host.insertBefore(warn, stage);
    }

    build();
  }

  void prepare();
}
