const COLORS = ['var(--nm-primary)', '#515839', '#DEE5B9', '#B27B1F', '#6B4FCF', '#C6435D'];

function ensureStyle(): void {
  if (document.querySelector('#nm-burst-style')) {
    return;
  }
  const style = document.createElement('style');
  style.id = 'nm-burst-style';
  style.textContent =
    '@keyframes nmBurst{' +
    '0%{transform:translate3d(0,0,0) scale(1) rotate(0deg);opacity:1}' +
    '100%{transform:translate3d(var(--nm-dx,0),var(--nm-dy,0),0) scale(0.3) rotate(220deg);opacity:0}}';
  document.head.appendChild(style);
}

/** Small celebratory particle burst that emanates from an element (e.g. a button). */
export function burstFrom(el: HTMLElement): void {
  ensureStyle();

  const rect = el.getBoundingClientRect();
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;

  const container = document.createElement('div');
  container.style.cssText =
    'position:fixed;inset:0;pointer-events:none;z-index:11000;overflow:hidden';

  const count = 22;
  for (let i = 0; i < count; i++) {
    const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.5;
    const dist = 60 + Math.random() * 90;
    const dx = Math.cos(angle) * dist;
    const dy = Math.sin(angle) * dist - 30; // slight upward bias
    const size = 6 + Math.random() * 6;
    const color = COLORS[Math.floor(Math.random() * COLORS.length)];
    const dur = 0.6 + Math.random() * 0.5;

    const p = document.createElement('div');
    p.style.cssText = [
      'position:fixed',
      `left:${cx}px`,
      `top:${cy}px`,
      `width:${size}px`,
      `height:${size * 0.6}px`,
      `background:${color}`,
      'border-radius:1px',
      `--nm-dx:${dx.toFixed(0)}px`,
      `--nm-dy:${dy.toFixed(0)}px`,
      `animation:nmBurst ${dur.toFixed(2)}s ease-out forwards`
    ].join(';');
    container.appendChild(p);
  }

  document.body.appendChild(container);
  setTimeout(() => container.remove(), 1300);
}
