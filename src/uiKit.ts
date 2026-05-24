export function button(
  label: string,
  variant: 'primary' | 'ghost' | 'secondary' | 'accent' = 'primary'
): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.textContent = label;
  const base =
    'padding:9px 15px;border-radius:var(--nm-radius-md);font-size:14px;font-weight:500;' +
    'cursor:pointer;transition:all 160ms var(--nm-ease);font-family:var(--nm-font-sans);line-height:1.2;border:1px solid transparent;';
  const hover = (bg: string, border?: string) => {
    btn.addEventListener('mouseenter', () => {
      if (!btn.disabled) {
        btn.style.background = bg;
        if (border) {
          btn.style.borderColor = border;
        }
      }
    });
  };
  const leave = (bg: string, border?: string) => {
    btn.addEventListener('mouseleave', () => {
      if (!btn.disabled) {
        btn.style.background = bg;
        if (border) {
          btn.style.borderColor = border;
        }
      }
    });
  };

  if (variant === 'primary') {
    // Near-black primary (design system).
    btn.style.cssText = base + 'background:var(--nm-btn-primary);color:#fff';
    hover('var(--nm-btn-primary-hover)');
    leave('var(--nm-btn-primary)');
  } else if (variant === 'accent') {
    btn.style.cssText = base + 'background:var(--nm-accent);color:#fff';
    hover('var(--nm-accent-hover)');
    leave('var(--nm-accent)');
  } else if (variant === 'secondary') {
    btn.style.cssText =
      base +
      'background:var(--nm-secondary);color:var(--nm-secondary-fg);border-color:var(--nm-secondary-hover)';
    hover('var(--nm-secondary-hover)', 'var(--nm-secondary-hover)');
    leave('var(--nm-secondary)', 'var(--nm-secondary-hover)');
  } else {
    btn.style.cssText =
      base + 'background:transparent;color:var(--nm-fg-strong)';
    hover('var(--nm-bg-section)');
    leave('transparent');
  }
  return btn;
}

export function codeView(code: string): HTMLPreElement {
  const pre = document.createElement('pre');
  pre.style.cssText = [
    'background:var(--nm-code-bg);color:var(--nm-code-text);padding:16px 18px',
    'border-radius:var(--nm-radius-lg);border:1px solid var(--nm-code-border)',
    'font-family:var(--nm-font-mono);font-size:13px;line-height:1.6',
    'overflow-x:auto;white-space:pre-wrap;margin:0'
  ].join(';');
  pre.textContent = code;
  return pre;
}

export function codeEditor(initial: string): HTMLTextAreaElement {
  const ta = document.createElement('textarea');
  ta.value = initial;
  ta.spellcheck = false;
  ta.wrap = 'off';
  ta.rows = Math.max(4, initial.split('\n').length + 1);
  ta.style.cssText = [
    'width:100%;box-sizing:border-box;background:var(--nm-code-bg);color:var(--nm-code-text)',
    'padding:16px 18px;border-radius:var(--nm-radius-lg);border:1px solid var(--nm-code-border)',
    'font-family:var(--nm-font-mono);font-size:13px;line-height:1.6',
    'resize:vertical;outline:none;tab-size:4'
  ].join(';');
  ta.addEventListener('focus', () => {
    ta.style.borderColor = 'var(--nm-accent)';
    ta.style.boxShadow = '0 0 0 3px var(--nm-accent-light)';
  });
  ta.addEventListener('blur', () => {
    ta.style.borderColor = 'var(--nm-code-border)';
    ta.style.boxShadow = 'none';
  });
  // Insert spaces on Tab instead of moving focus.
  ta.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const start = ta.selectionStart;
      const end = ta.selectionEnd;
      ta.value = ta.value.slice(0, start) + '    ' + ta.value.slice(end);
      ta.selectionStart = ta.selectionEnd = start + 4;
    }
  });
  return ta;
}

export function heading(text: string, sub?: string): HTMLElement {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'margin-bottom:24px';
  const h = document.createElement('div');
  h.style.cssText =
    'font-size:26px;font-weight:800;color:var(--nm-text);letter-spacing:-0.02em;line-height:1.15';
  h.textContent = text;
  wrap.appendChild(h);
  if (sub) {
    const s = document.createElement('div');
    s.style.cssText =
      'font-size:15px;color:var(--nm-text-secondary);margin-top:7px;line-height:1.5';
    s.textContent = sub;
    wrap.appendChild(s);
  }
  return wrap;
}

export function infoBox(
  html: string,
  kind: 'info' | 'success' | 'error' | 'warn' = 'info'
): HTMLElement {
  const palette = {
    info: ['var(--nm-accent-light)', 'var(--nm-accent-border)', 'var(--nm-accent-hover)'],
    success: ['var(--nm-success-bg)', '#a6f0c6', 'var(--nm-success-text)'],
    error: ['var(--nm-error-bg)', '#fecdc9', 'var(--nm-error-text)'],
    warn: ['var(--nm-warn-bg)', '#fde29b', 'var(--nm-warn-text)']
  }[kind];
  const box = document.createElement('div');
  box.style.cssText = [
    `background:${palette[0]};border:1px solid ${palette[1]};color:${palette[2]}`,
    'border-radius:var(--nm-radius);padding:12px 15px;font-size:13px;line-height:1.6'
  ].join(';');
  box.innerHTML = html;
  return box;
}

export function spinner(text: string): HTMLElement {
  const el = document.createElement('div');
  el.style.cssText =
    'text-align:center;padding:40px 16px;color:var(--nm-text-muted);font-size:14px';
  el.textContent = text;
  return el;
}

const AVATAR_COLORS = [
  '#4B5563',
  '#C6435D',
  '#C9633A',
  '#B27B1F',
  '#5F8B27',
  '#1F857D',
  '#6B4FCF',
  '#B83B8C'
];

export function avatar(name: string, size = 28): HTMLElement {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  const color = AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
  const el = document.createElement('div');
  el.style.cssText = [
    `width:${size}px;height:${size}px;border-radius:50%;flex-shrink:0`,
    `background:${color};color:#fff;font-weight:700;font-size:${Math.round(size * 0.42)}px`,
    'display:flex;align-items:center;justify-content:center;font-family:var(--nm-font)'
  ].join(';');
  el.textContent = (name.trim()[0] ?? '?').toUpperCase();
  return el;
}

export function maxWidth(host: HTMLElement): HTMLElement {
  const inner = document.createElement('div');
  inner.style.cssText = 'max-width:760px;margin:0 auto';
  host.appendChild(inner);
  return inner;
}
