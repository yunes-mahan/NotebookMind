import { IDeck, ISlide } from './slidesData';

const GREEN = '#1a8a4a';

export function openSlides(deck: IDeck, startIndex = 0): void {
  const overlay = document.createElement('div');
  overlay.style.cssText = [
    'position:fixed;inset:0;z-index:1100;background:rgba(14,14,12,0.62)',
    'backdrop-filter:blur(4px);display:flex;flex-direction:column;align-items:center',
    'padding:18px 16px;box-sizing:border-box;font-family:var(--nm-font-sans)'
  ].join(';');

  // Header bar
  const bar = document.createElement('div');
  bar.style.cssText =
    'width:100%;max-width:940px;display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px;flex-shrink:0';
  const title = document.createElement('div');
  title.style.cssText = 'color:#fff;font-size:15px;font-weight:600';
  title.textContent = `📄 ${deck.title}`;
  const hint = document.createElement('div');
  hint.style.cssText =
    'display:flex;align-items:center;gap:12px;color:rgba(255,255,255,0.75);font-size:12px';
  const esc = document.createElement('span');
  esc.textContent = `${deck.slides.length} slides · Esc to close`;
  const close = document.createElement('button');
  close.textContent = '✕';
  close.style.cssText = [
    'width:30px;height:30px;border-radius:8px;border:1px solid rgba(255,255,255,0.3)',
    'background:rgba(255,255,255,0.12);color:#fff;cursor:pointer;font-size:14px;line-height:1'
  ].join(';');
  hint.appendChild(esc);
  hint.appendChild(close);
  bar.appendChild(title);
  bar.appendChild(hint);
  overlay.appendChild(bar);

  // Scrollable deck
  const scroller = document.createElement('div');
  scroller.style.cssText =
    'width:100%;max-width:940px;flex:1;overflow-y:auto;display:flex;flex-direction:column;gap:18px;padding-bottom:8px';
  const slideEls: HTMLElement[] = [];
  deck.slides.forEach((s, i) => {
    const el = renderSlide(s, i + 1, deck.slides.length);
    slideEls.push(el);
    scroller.appendChild(el);
  });
  overlay.appendChild(scroller);

  // Close handlers
  function dispose(): void {
    overlay.remove();
    document.removeEventListener('keydown', onKey);
  }
  function onKey(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      dispose();
    }
  }
  overlay.addEventListener('click', e => {
    if (e.target === overlay) {
      dispose();
    }
  });
  close.addEventListener('click', dispose);
  document.addEventListener('keydown', onKey);

  document.body.appendChild(overlay);

  const start = slideEls[Math.max(0, Math.min(startIndex, slideEls.length - 1))];
  if (start) {
    start.scrollIntoView({ block: 'start' });
  }
}

function slideShell(): HTMLElement {
  const el = document.createElement('div');
  el.style.cssText = [
    'width:100%;aspect-ratio:16/9;border-radius:12px;overflow:hidden;flex-shrink:0',
    'box-shadow:0 16px 40px rgba(0,0,0,0.35);box-sizing:border-box;position:relative'
  ].join(';');
  return el;
}

function pageNum(el: HTMLElement, n: number, total: number): void {
  const p = document.createElement('div');
  p.style.cssText =
    'position:absolute;bottom:14px;right:18px;font-size:12px;color:#9a9a96;font-family:var(--nm-font-mono)';
  p.textContent = `${n} / ${total}`;
  el.appendChild(p);
}

function renderSlide(s: ISlide, n: number, total: number): HTMLElement {
  const el = slideShell();

  if (s.kind === 'title') {
    el.style.background = GREEN;
    const inner = document.createElement('div');
    inner.style.cssText =
      'position:absolute;inset:0;display:flex;flex-direction:column;justify-content:flex-end;padding:7% 7% 9%';
    if (s.eyebrow) {
      const eb = document.createElement('div');
      eb.style.cssText =
        'color:rgba(255,255,255,0.92);font-size:clamp(14px,2.2vw,22px);font-weight:700;margin-bottom:6px';
      eb.textContent = s.eyebrow;
      inner.appendChild(eb);
    }
    const t = document.createElement('div');
    t.style.cssText =
      'color:#fff;font-size:clamp(24px,5vw,52px);font-weight:800;line-height:1.05;letter-spacing:-0.02em';
    t.textContent = s.title ?? '';
    inner.appendChild(t);
    if (s.presenter) {
      const pr = document.createElement('div');
      pr.style.cssText =
        'color:rgba(255,255,255,0.92);font-size:clamp(12px,1.6vw,17px);margin-top:14px';
      pr.textContent = s.presenter;
      inner.appendChild(pr);
    }
    el.appendChild(inner);
    return el;
  }

  // White content slides
  el.style.background = '#ffffff';
  el.style.border = '1px solid #e7e5e0';
  const inner = document.createElement('div');

  if (s.kind === 'bullets') {
    inner.style.cssText = 'position:absolute;inset:0;padding:7% 8%';
    const t = document.createElement('div');
    t.style.cssText =
      'color:#0a0a0a;font-size:clamp(22px,4vw,40px);font-weight:800;letter-spacing:-0.02em;margin-bottom:6%';
    t.textContent = s.title ?? '';
    inner.appendChild(t);
    (s.bullets ?? []).forEach(b => {
      const row = document.createElement('div');
      row.style.cssText =
        'display:flex;align-items:flex-start;gap:14px;margin-bottom:3.2%';
      const sq = document.createElement('span');
      sq.style.cssText = `width:clamp(8px,1vw,12px);height:clamp(8px,1vw,12px);background:${GREEN};flex-shrink:0;margin-top:0.55em`;
      const txt = document.createElement('span');
      txt.style.cssText =
        'color:#18181b;font-size:clamp(15px,2.4vw,26px);line-height:1.3';
      txt.textContent = b;
      row.appendChild(sq);
      row.appendChild(txt);
      inner.appendChild(row);
    });
  } else {
    // statement
    inner.style.cssText =
      'position:absolute;inset:0;padding:8% 9%;display:flex;flex-direction:column;justify-content:center';
    const t = document.createElement('div');
    t.style.cssText =
      'color:#0a0a0a;font-size:clamp(22px,4vw,40px);font-weight:800;letter-spacing:-0.02em;text-align:center';
    const full = s.title ?? '';
    if (s.titleHi && full.includes(s.titleHi)) {
      const [pre, post] = full.split(s.titleHi);
      t.append(document.createTextNode(pre));
      const hi = document.createElement('span');
      hi.style.color = GREEN;
      hi.textContent = s.titleHi;
      t.appendChild(hi);
      t.append(document.createTextNode(post));
    } else {
      t.textContent = full;
    }
    inner.appendChild(t);
    if (s.text) {
      const body = document.createElement('div');
      body.style.cssText =
        'color:#18181b;font-size:clamp(14px,2.2vw,24px);line-height:1.45;text-align:center;margin-top:4%;max-width:80%;align-self:center';
      body.textContent = s.text;
      inner.appendChild(body);
    }
  }

  el.appendChild(inner);
  pageNum(el, n, total);
  return el;
}
