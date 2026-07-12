import { NotebookMindApp } from './nbApp';
import { INbDoc } from './nbSource';
import { renderLearn } from './screenLearn';
import { renderExplain } from './screenExplain';
import { demoAssignment } from './demoData';
import { summarizeNotebook } from './gemini';
import { backLink, segmented, maxWidth } from './uiKit';

type Mode = 'learn' | 'explain';

// Cache AI summaries per notebook so mode switches don't refetch.
const summaryCache = new Map<string, string>();

/**
 * Unified study session for a notebook (prototype layout). Defaults to Learn;
 * Explain is offered as a mode switch for review weeks (app.explainAllowed).
 */
export function renderSession(host: HTMLElement, app: NotebookMindApp): void {
  const doc = app.doc;
  if (!doc) {
    app.navigate('home');
    return;
  }

  // Initialise Learn run-state once (was done by the old mode-select screen).
  app.xp.reset();
  app.challenges = new Array(doc.cells.length).fill(null);
  app.expectedOutputs = [];

  let mode: Mode = 'learn';

  const root = maxWidth(host, 1240);
  root.style.cssText +=
    ';display:flex;flex-direction:column;gap:16px;align-items:center;padding-bottom:64px';

  // ── Header block (centered 780px column) ──────────────────────
  const head = document.createElement('div');
  head.style.cssText =
    'max-width:780px;width:100%;box-sizing:border-box;display:flex;flex-direction:column;gap:10px';

  head.appendChild(backLink('Back to Course', () => app.navigate('home')));

  const titleRow = document.createElement('div');
  titleRow.style.cssText =
    'display:flex;align-items:center;gap:12px;flex-wrap:wrap';
  const h1 = document.createElement('h1');
  h1.style.cssText =
    'margin:0;font-size:20px;font-weight:600;letter-spacing:-0.018em;flex:1;min-width:200px;color:var(--text-primary)';
  h1.textContent = doc.name;
  titleRow.appendChild(h1);
  const count = document.createElement('span');
  count.style.cssText = 'font-size:12px;color:var(--text-quaternary)';
  count.textContent = `${doc.cells.length} cells`;
  titleRow.appendChild(count);
  if (app.explainAllowed) {
    titleRow.appendChild(
      segmented(
        [
          { id: 'learn', label: 'Learn' },
          { id: 'explain', label: 'Explain' }
        ],
        mode,
        id => {
          if (id !== mode) {
            mode = id as Mode;
            renderBody();
          }
        }
      )
    );
  }
  head.appendChild(titleRow);
  head.appendChild(assignmentCard(doc));
  root.appendChild(head);

  const body = document.createElement('div');
  body.style.cssText = 'width:100%;display:flex;flex-direction:column;gap:16px';
  root.appendChild(body);

  function renderBody(): void {
    body.innerHTML = '';
    if (mode === 'explain' && app.explainAllowed) {
      renderExplain(body, app);
    } else {
      renderLearn(body, app);
    }
  }

  renderBody();

  /** Clickable assignment brief — collapsed to 2 lines, prototype style. */
  function assignmentCard(nb: INbDoc): HTMLElement {
    const wrap = document.createElement('div');
    wrap.style.cssText =
      'background:var(--bg-panel);border:1px solid var(--border-default);border-radius:8px;padding:11px 14px;cursor:pointer;display:none;transition:border-color var(--dur-fast) var(--ease-out)';
    wrap.addEventListener('mouseenter', () => {
      wrap.style.borderColor = 'var(--border-strong)';
    });
    wrap.addEventListener('mouseleave', () => {
      wrap.style.borderColor = 'var(--border-default)';
    });

    const headRow = document.createElement('div');
    headRow.style.cssText =
      'display:flex;align-items:center;gap:8px;margin-bottom:4px';
    headRow.innerHTML =
      '<span style="font-size:10.5px;font-weight:600;letter-spacing:0.07em;text-transform:uppercase;color:var(--accent-text)">Assignment</span>' +
      '<span style="flex:1"></span>';
    const toggleLbl = document.createElement('span');
    toggleLbl.style.cssText = 'font-size:11px;color:var(--text-quaternary)';
    toggleLbl.textContent = 'Expand';
    headRow.appendChild(toggleLbl);

    const text = document.createElement('p');
    text.style.cssText =
      'margin:0;font-size:12.5px;line-height:1.6;color:var(--text-secondary);display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden';

    let open = false;
    wrap.addEventListener('click', () => {
      open = !open;
      text.style.webkitLineClamp = open ? 'unset' : '2';
      toggleLbl.textContent = open ? 'Collapse' : 'Expand';
    });

    wrap.appendChild(headRow);
    wrap.appendChild(text);

    const fill = (t: string): void => {
      text.textContent = t;
      wrap.style.display = '';
    };
    const seeded = demoAssignment(nb.key);
    const cached = summaryCache.get(nb.key);
    if (seeded) {
      fill(seeded);
    } else if (cached) {
      fill(cached);
    } else {
      void summarizeNotebook(nb.cells)
        .then(t => {
          summaryCache.set(nb.key, t);
          fill(t);
        })
        .catch(() => undefined);
    }
    return wrap;
  }
}
