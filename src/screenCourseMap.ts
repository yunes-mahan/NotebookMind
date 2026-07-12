import { NotebookMindApp } from './nbApp';
import { ICourseNotebook } from './courseData';
import { activeData } from './courseStore';
import { loadNotebook } from './nbSource';
import { explainConnection } from './gemini';
import { backLink, statusIcon, maxWidth } from './uiKit';

// Session-local: which connectors are expanded / loading.
const openConn = new Map<number, string>();

/** Course map — prototype dot-grid flow, nodes by dependency depth. */
export function renderCourseMap(host: HTMLElement, app: NotebookMindApp): void {
  const COURSE = activeData();
  // Full-area dot grid (fluid; no fixed margins).
  const screen = document.createElement('div');
  screen.style.cssText = [
    'margin:-32px -28px;padding:24px 32px 80px;min-height:calc(100% + 64px);box-sizing:border-box',
    'background-image:radial-gradient(circle, rgba(20,22,32,0.10) 1.4px, transparent 1.5px)',
    'background-size:22px 22px;background-position:18px 20px'
  ].join(';');
  host.appendChild(screen);
  const root = maxWidth(screen, 1100);
  root.style.cssText += ';display:flex;flex-direction:column;gap:20px';

  // Header
  const head = document.createElement('div');
  head.style.cssText = 'display:flex;flex-direction:column;gap:8px';
  head.appendChild(backLink('Back to Course', () => app.navigate('home')));
  const h1 = document.createElement('h1');
  h1.style.cssText =
    'margin:0;font-size:22px;font-weight:600;letter-spacing:-0.018em;color:var(--text-primary)';
  h1.textContent = 'Course map';
  const sub = document.createElement('span');
  sub.style.cssText = 'font-size:13px;color:var(--text-tertiary)';
  sub.textContent = 'How each notebook builds on the ones before it.';
  head.appendChild(h1);
  head.appendChild(sub);
  root.appendChild(head);

  // ── Layout nodes by dependency depth ──────────────────────────
  const memo = new Map<string, number>();
  function level(id: string): number {
    if (memo.has(id)) return memo.get(id) as number;
    const nb = COURSE.notebooks[id];
    const lvl = !nb || nb.deps.length === 0 ? 0 : 1 + Math.max(...nb.deps.map(level));
    memo.set(id, lvl);
    return lvl;
  }

  const byLevel = new Map<number, ICourseNotebook[]>();
  let maxLevel = 0;
  Object.values(COURSE.notebooks).forEach(nb => {
    const lvl = level(nb.id);
    maxLevel = Math.max(maxLevel, lvl);
    let arr = byLevel.get(lvl);
    if (!arr) {
      arr = [];
      byLevel.set(lvl, arr);
    }
    arr.push(nb);
  });

  const canvas = document.createElement('div');
  canvas.style.cssText = 'display:flex;flex-direction:column;align-items:stretch';
  root.appendChild(canvas);

  if (Object.keys(COURSE.notebooks).length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText =
      'display:flex;flex-direction:column;align-items:center;gap:10px;padding:36px 24px;background:var(--bg-panel);border:1px dashed var(--border-strong);border-radius:10px;text-align:center';
    empty.innerHTML =
      '<span style="font-size:12.5px;color:var(--text-tertiary);line-height:1.55;max-width:380px">No notebooks in this course yet — the map appears once content is published.</span>';
    canvas.appendChild(empty);
    return;
  }

  for (let lvl = 0; lvl <= maxLevel; lvl++) {
    const nodes = byLevel.get(lvl) ?? [];
    if (nodes.length === 0) continue;
    if (lvl > 0) {
      canvas.appendChild(
        connector(lvl - 1, byLevel.get(lvl - 1) ?? [], nodes)
      );
    }
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;gap:16px;justify-content:center';
    nodes.forEach(nb => row.appendChild(nodeCard(nb)));
    canvas.appendChild(row);
  }

  function nodeCard(nb: ICourseNotebook): HTMLElement {
    const st = nb.status;
    const clickable = st === 'available' && !!nb.path;
    const node = document.createElement('div');
    node.style.cssText = [
      'flex:1;max-width:340px;min-width:0;display:flex;flex-direction:column;gap:6px;padding:13px 16px',
      'border-radius:10px;background:var(--surface-card);transition:border-color 0.12s ease-out',
      `border:1px solid ${st === 'available' ? 'rgba(94,106,210,0.45)' : 'var(--border-default)'}`,
      st === 'locked' ? 'opacity:0.55' : clickable ? 'cursor:pointer' : ''
    ].join(';');

    const top = document.createElement('div');
    top.style.cssText = 'display:flex;align-items:center;gap:9px';
    top.appendChild(
      statusIcon(st === 'done' ? 'done' : st === 'available' ? 'started' : 'backlog', 15)
    );
    const title = document.createElement('span');
    title.style.cssText = `font-size:13px;font-weight:600;letter-spacing:-0.012em;color:${st === 'locked' ? 'var(--text-tertiary)' : 'var(--text-primary)'}`;
    title.textContent = nb.title;
    top.appendChild(title);
    node.appendChild(top);

    const meta = document.createElement('span');
    meta.style.cssText =
      'font-size:11px;color:var(--text-quaternary);font-weight:500';
    meta.textContent = `Week ${nb.week} · ${st === 'done' ? 'Done' : st === 'available' ? 'Available' : 'Locked'}`;
    node.appendChild(meta);

    const desc = document.createElement('span');
    desc.style.cssText =
      'font-size:11.5px;color:var(--text-tertiary);line-height:1.45';
    desc.textContent = nb.blurb;
    node.appendChild(desc);

    if (clickable) {
      node.addEventListener('mouseenter', () => {
        node.style.borderColor = 'var(--border-strong)';
      });
      node.addEventListener('mouseleave', () => {
        node.style.borderColor = 'rgba(94,106,210,0.45)';
      });
      node.addEventListener('click', async () => {
        try {
          const doc = await loadNotebook(
            app.services.contents,
            nb.path as string,
            nb.title
          );
          if (doc.cells.length === 0) return;
          app.doc = doc;
          app.explainAllowed = nb.week < COURSE.currentWeek;
          app.navigate('session');
        } catch {
          // ignore
        }
      });
    }
    return node;
  }

  function connector(
    li: number,
    fromNodes: ICourseNotebook[],
    toNodes: ICourseNotebook[]
  ): HTMLElement {
    const wrap = document.createElement('div');
    wrap.style.cssText =
      'display:flex;flex-direction:column;align-items:center;padding:6px 0';

    const line1 = document.createElement('div');
    line1.style.cssText = 'width:1.5px;height:14px;background:var(--border-strong)';
    wrap.appendChild(line1);

    const mid = document.createElement('div');
    mid.style.cssText =
      'display:flex;flex-direction:column;align-items:center;width:100%';
    wrap.appendChild(mid);

    const fromLabel = fromNodes.map(n => n.topic).join(' & ');
    const toLabel = toNodes.map(n => n.topic).join(' & ');

    const paint = (): void => {
      mid.innerHTML = '';
      const stateVal = openConn.get(li);
      if (stateVal === 'loading') {
        const p = document.createElement('span');
        p.style.cssText =
          'font-size:11.5px;color:var(--text-quaternary);padding:5px 12px;animation:nm-pulse 1.2s ease-in-out infinite';
        p.textContent = 'Explaining the connection…';
        mid.appendChild(p);
        return;
      }
      if (stateVal && stateVal !== 'loading') {
        const box = document.createElement('div');
        box.style.cssText =
          'max-width:560px;margin:2px 0;padding:13px 16px;background:var(--accent-subtle-bg);border:1px solid rgba(94,106,210,0.35);border-radius:9px;display:flex;flex-direction:column;gap:5px;animation:nm-rise 0.25s ease-out both';
        const boxHead = document.createElement('div');
        boxHead.style.cssText = 'display:flex;align-items:center;gap:8px';
        boxHead.innerHTML = `<span style="font-size:11px;font-weight:600;color:var(--accent-text);text-transform:uppercase;letter-spacing:0.06em">${fromLabel} → ${toLabel}</span><span style="flex:1"></span>`;
        const close = document.createElement('span');
        close.textContent = '✕';
        close.style.cssText =
          'font-size:12px;color:var(--text-quaternary);cursor:pointer;line-height:1';
        close.addEventListener('mouseenter', () => (close.style.color = 'var(--text-primary)'));
        close.addEventListener('mouseleave', () => (close.style.color = 'var(--text-quaternary)'));
        close.addEventListener('click', () => {
          openConn.delete(li);
          paint();
        });
        boxHead.appendChild(close);
        const p = document.createElement('p');
        p.style.cssText =
          'margin:0;font-size:12.5px;line-height:1.6;color:var(--text-secondary)';
        p.textContent = stateVal;
        box.appendChild(boxHead);
        box.appendChild(p);
        mid.appendChild(box);
        return;
      }
      // Closed: pill button
      const pill = document.createElement('span');
      pill.style.cssText =
        'display:inline-flex;align-items:center;gap:6px;font-size:11.5px;font-weight:500;color:var(--text-tertiary);border:1px solid var(--border-default);border-radius:999px;padding:4px 12px;cursor:pointer;background:var(--bg-panel);transition:color 0.1s ease-out, border-color 0.1s ease-out';
      pill.innerHTML =
        '<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"></circle><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"></path><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>Explain this connection';
      pill.addEventListener('mouseenter', () => {
        pill.style.color = 'var(--accent-text)';
        pill.style.borderColor = 'rgba(94,106,210,0.5)';
      });
      pill.addEventListener('mouseleave', () => {
        pill.style.color = 'var(--text-tertiary)';
        pill.style.borderColor = 'var(--border-default)';
      });
      pill.addEventListener('click', async () => {
        openConn.set(li, 'loading');
        paint();
        try {
          const text = await explainConnection(fromLabel, toLabel, COURSE.subject);
          openConn.set(li, text);
        } catch {
          openConn.delete(li);
        }
        paint();
      });
      mid.appendChild(pill);
    };
    paint();

    const line2 = document.createElement('div');
    line2.style.cssText = 'width:1.5px;height:14px;background:var(--border-strong)';
    wrap.appendChild(line2);
    const chev = document.createElement('span');
    chev.innerHTML =
      '<svg width="10" height="6" viewBox="0 0 10 6" style="display:block"><path d="M1 0 L5 5 L9 0" stroke="var(--border-strong)" stroke-width="1.5" fill="none"></path></svg>';
    wrap.appendChild(chev);

    return wrap;
  }
}
