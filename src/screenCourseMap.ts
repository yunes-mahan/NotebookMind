import { NotebookMindApp } from './nbApp';
import { COURSE, STATUS_META, ICourseNotebook } from './courseData';
import { explainConnection } from './gemini';
import { button, infoBox, maxWidth } from './uiKit';

export function renderCourseMap(host: HTMLElement, app: NotebookMindApp): void {
  // Full-bleed dotted "flow editor" canvas covering the whole screen.
  const screen = document.createElement('div');
  screen.style.cssText = [
    'margin:-28px -22px;padding:28px 22px;min-height:calc(100vh - 110px);box-sizing:border-box',
    'background-color:var(--nm-bg)',
    'background-image:radial-gradient(var(--nm-border-strong) 1px, transparent 1px)',
    'background-size:18px 18px'
  ].join(';');
  host.appendChild(screen);
  const root = maxWidth(screen);

  const back = button('← Back', 'ghost');
  back.style.marginBottom = '12px';
  back.addEventListener('click', () => app.navigate('home'));
  root.appendChild(back);

  const h = document.createElement('div');
  h.style.cssText =
    'font-size:24px;font-weight:700;letter-spacing:-0.02em;color:var(--nm-fg-strong)';
  h.textContent = 'Course map';
  const sub = document.createElement('div');
  sub.style.cssText =
    'font-size:14px;color:var(--nm-fg-muted);margin:5px 0 18px;line-height:1.6';
  sub.textContent = `How the topics in ${COURSE.subject} build on each other — branches and all. Tap a connector to have the AI explain a link.`;
  root.appendChild(h);
  root.appendChild(sub);

  // The flow sits directly on the dotted screen background.
  const canvas = document.createElement('div');
  canvas.style.cssText =
    'display:flex;flex-direction:column;align-items:stretch';
  root.appendChild(canvas);

  // ── Layout nodes by dependency depth (so branches sit side by side) ──
  const memo = new Map<string, number>();
  function level(id: string): number {
    if (memo.has(id)) {
      return memo.get(id) as number;
    }
    const nb = COURSE.notebooks[id];
    const lvl = !nb || nb.deps.length === 0
      ? 0
      : 1 + Math.max(...nb.deps.map(level));
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

  for (let lvl = 0; lvl <= maxLevel; lvl++) {
    const nodes = byLevel.get(lvl) ?? [];
    if (nodes.length === 0) {
      continue;
    }
    if (lvl > 0) {
      canvas.appendChild(connector(byLevel.get(lvl - 1) ?? [], nodes));
    }
    const row = document.createElement('div');
    row.style.cssText =
      'display:flex;gap:14px;justify-content:center;flex-wrap:wrap';
    nodes.forEach(nb => row.appendChild(nodeCard(nb)));
    canvas.appendChild(row);
  }

  function nodeCard(nb: ICourseNotebook): HTMLElement {
    const meta = STATUS_META[nb.status];
    const card = document.createElement('div');
    card.style.cssText = [
      'flex:1 1 240px;max-width:340px;display:flex;gap:12px;align-items:flex-start',
      'background:var(--nm-bg-elev-1)',
      `border:1px solid ${nb.status === 'available' ? 'var(--nm-accent-border)' : 'var(--nm-border)'}`,
      'border-radius:var(--nm-radius-lg);padding:14px 15px;box-shadow:var(--nm-shadow-sm)',
      nb.status === 'locked' ? 'opacity:0.6' : ''
    ].join(';');

    const badge = document.createElement('div');
    badge.style.cssText = [
      'width:32px;height:32px;border-radius:8px;flex-shrink:0;display:flex',
      'align-items:center;justify-content:center;font-size:14px;font-weight:700',
      `background:${meta.color}1A;color:${meta.color}`
    ].join(';');
    badge.textContent = meta.icon;

    const body = document.createElement('div');
    body.style.cssText = 'flex:1;min-width:0';
    const titleRow = document.createElement('div');
    titleRow.style.cssText =
      'display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:3px';
    const title = document.createElement('div');
    title.style.cssText = 'font-size:14px;font-weight:600;color:var(--nm-fg-strong)';
    title.textContent = nb.title;
    const tag = document.createElement('span');
    tag.style.cssText = [
      `background:${meta.color}1A;color:${meta.color}`,
      'padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700;font-family:var(--nm-font-mono);text-transform:uppercase;letter-spacing:0.04em'
    ].join(';');
    tag.textContent = `W${nb.week} · ${meta.label}`;
    titleRow.appendChild(title);
    titleRow.appendChild(tag);

    const blurb = document.createElement('div');
    blurb.style.cssText =
      'font-size:12.5px;color:var(--nm-fg-muted);line-height:1.5';
    blurb.textContent = nb.blurb;

    body.appendChild(titleRow);
    body.appendChild(blurb);
    card.appendChild(badge);
    card.appendChild(body);
    return card;
  }

  function connector(
    fromNodes: ICourseNotebook[],
    toNodes: ICourseNotebook[]
  ): HTMLElement {
    const wrap = document.createElement('div');
    wrap.style.cssText =
      'display:flex;flex-direction:column;align-items:center;padding:8px 0';

    const line = document.createElement('div');
    line.style.cssText = 'width:2px;height:16px;background:var(--nm-border-strong)';

    const btn = document.createElement('button');
    btn.style.cssText = [
      'display:inline-flex;align-items:center;gap:6px;cursor:pointer',
      'background:var(--nm-bg-elev-1);color:var(--nm-accent);border:1px solid var(--nm-accent-border)',
      'border-radius:var(--nm-radius-pill);padding:5px 13px;font-size:12px;font-weight:600;font-family:var(--nm-font-sans)',
      'box-shadow:var(--nm-shadow-sm)'
    ].join(';');
    btn.textContent = '✨ Explain this connection';

    const arrow = document.createElement('div');
    arrow.style.cssText =
      'color:var(--nm-fg-subtle);font-size:16px;line-height:1;margin-top:4px';
    arrow.textContent = '↓';

    const out = document.createElement('div');
    out.style.cssText = 'width:100%;max-width:600px;margin-top:8px';

    const fromLabel = fromNodes.map(n => n.topic).join(' & ');
    const toLabel = toNodes.map(n => n.topic).join(' & ');

    btn.addEventListener('click', async () => {
      btn.textContent = '✨ Thinking…';
      btn.disabled = true;
      try {
        const text = await explainConnection(fromLabel, toLabel, COURSE.subject);
        const card = document.createElement('div');
        card.style.cssText = [
          'background:var(--nm-bg-elev-1);border:1px solid var(--nm-border)',
          'border-left:3px solid var(--nm-accent);border-radius:0 var(--nm-radius-lg) var(--nm-radius-lg) 0',
          'padding:13px 16px;box-shadow:var(--nm-shadow-sm)'
        ].join(';');
        const head = document.createElement('div');
        head.style.cssText =
          'font-family:var(--nm-font-mono);font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:0.04em;color:var(--nm-fg-muted);margin-bottom:5px';
        head.textContent = `${fromLabel} → ${toLabel}`;
        const p = document.createElement('div');
        p.style.cssText = 'font-size:13.5px;color:var(--nm-fg);line-height:1.65';
        p.textContent = text;
        card.appendChild(head);
        card.appendChild(p);
        out.innerHTML = '';
        out.appendChild(card);
        btn.style.display = 'none';
        arrow.style.display = 'none';
      } catch {
        out.appendChild(infoBox('Could not load an explanation.', 'error'));
        btn.textContent = '✨ Explain this connection';
        btn.disabled = false;
      }
    });

    wrap.appendChild(line);
    wrap.appendChild(btn);
    wrap.appendChild(arrow);
    wrap.appendChild(out);
    return wrap;
  }
}
