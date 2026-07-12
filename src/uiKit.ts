/* ─────────────────────────────────────────────────────────────────────────
   Shared UI primitives — ported 1:1 from the Claude Design handoff
   (Linear design system, light theme). One implementation per primitive;
   every screen composes these so the whole app reads as one language.
   ───────────────────────────────────────────────────────────────────────── */

export function button(
  label: string,
  variant: 'primary' | 'ghost' | 'secondary' | 'accent' = 'primary'
): HTMLButtonElement {
  const btn = document.createElement('button');
  btn.textContent = label;
  const base = [
    'display:inline-flex;align-items:center;justify-content:center;gap:6px',
    'height:var(--control-md);padding:0 12px;box-sizing:border-box',
    'font-family:var(--font-sans);font-size:13px;font-weight:500;line-height:1',
    'letter-spacing:-0.01em;border-radius:var(--radius-control)',
    'border:1px solid transparent;cursor:pointer;user-select:none;white-space:nowrap',
    'transition:background-color var(--dur-fast) var(--ease-out),border-color var(--dur-fast) var(--ease-out),color var(--dur-fast) var(--ease-out),box-shadow var(--dur-fast) var(--ease-out)'
  ].join(';');

  const hover = (patch: Partial<CSSStyleDeclaration>, revert: Partial<CSSStyleDeclaration>) => {
    btn.addEventListener('mouseenter', () => {
      if (!btn.disabled) Object.assign(btn.style, patch);
    });
    btn.addEventListener('mouseleave', () => {
      if (!btn.disabled) Object.assign(btn.style, revert);
    });
  };

  if (variant === 'primary' || variant === 'accent') {
    btn.style.cssText =
      base +
      ';background:var(--accent);color:var(--text-onbrand);box-shadow:var(--shadow-brand)';
    hover({ background: 'var(--accent-hover)' }, { background: 'var(--accent)' });
  } else if (variant === 'secondary') {
    btn.style.cssText =
      base +
      ';background:var(--alpha-6);color:var(--text-primary);border-color:var(--border-default)';
    hover(
      { background: 'var(--alpha-10)', borderColor: 'var(--border-strong)' },
      { background: 'var(--alpha-6)', borderColor: 'var(--border-default)' }
    );
  } else {
    btn.style.cssText = base + ';background:transparent;color:var(--text-secondary)';
    hover(
      { background: 'var(--alpha-6)', color: 'var(--text-primary)' },
      { background: 'transparent', color: 'var(--text-secondary)' }
    );
  }
  return btn;
}

export function codeView(code: string): HTMLPreElement {
  const pre = document.createElement('pre');
  pre.style.cssText = [
    'margin:0;padding:12px 16px;background:var(--bg-base)',
    'border:1px solid var(--border-subtle);border-radius:7px',
    'font-family:var(--font-mono);font-size:12px;line-height:1.6;color:var(--text-secondary)',
    'overflow-x:auto;white-space:pre-wrap'
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
    'width:100%;box-sizing:border-box;background:var(--bg-base);color:var(--text-primary)',
    'padding:11px 13px;border-radius:7px;border:1px solid var(--border-strong)',
    'font-family:var(--font-mono);font-size:12.5px;line-height:1.7',
    'resize:vertical;outline:none;tab-size:4'
  ].join(';');
  ta.addEventListener('focus', () => {
    ta.style.borderColor = 'var(--accent)';
    ta.style.boxShadow = '0 0 0 3px var(--brand-glow)';
  });
  ta.addEventListener('blur', () => {
    ta.style.borderColor = 'var(--border-strong)';
    ta.style.boxShadow = 'none';
  });
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
  wrap.style.cssText = 'margin-bottom:20px;display:flex;flex-direction:column;gap:6px';
  const h = document.createElement('div');
  h.style.cssText =
    'font-size:22px;font-weight:600;color:var(--text-primary);letter-spacing:-0.018em;line-height:1.2';
  h.textContent = text;
  wrap.appendChild(h);
  if (sub) {
    const s = document.createElement('div');
    s.style.cssText = 'font-size:13px;color:var(--text-tertiary);line-height:1.5';
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
    info: ['var(--accent-subtle-bg)', 'rgba(94,106,210,0.35)', 'var(--text-secondary)'],
    success: ['var(--green-bg)', 'rgba(23,138,84,0.30)', 'var(--text-secondary)'],
    error: ['var(--red-bg)', 'rgba(192,52,52,0.32)', 'var(--red-400)'],
    warn: ['var(--yellow-bg)', 'rgba(178,125,32,0.30)', 'var(--text-secondary)']
  }[kind];
  const box = document.createElement('div');
  box.style.cssText = [
    `background:${palette[0]};border:1px solid ${palette[1]};color:${palette[2]}`,
    'border-radius:8px;padding:10px 12px;font-size:13px;line-height:1.55'
  ].join(';');
  box.innerHTML = html;
  return box;
}

export function spinner(text: string): HTMLElement {
  const el = document.createElement('div');
  el.style.cssText =
    'text-align:center;padding:30px 12px;color:var(--text-tertiary);font-size:12.5px;animation:nm-pulse 1.2s ease-in-out infinite';
  el.textContent = text;
  return el;
}

/* Avatar — DS hash palette + two-letter initials. */
const AVATAR_PALETTE = [
  '#5E6AD2',
  '#4CB782',
  '#F2994A',
  '#EB5757',
  '#4EA7FC',
  '#B37FEB',
  '#F2C94C',
  '#26A69A'
];

export function avatar(name: string, size = 28): HTMLElement {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash * 31 + name.charCodeAt(i)) | 0;
  }
  const color = AVATAR_PALETTE[Math.abs(hash) % AVATAR_PALETTE.length];
  const parts = name.trim().split(/\s+/);
  const initials =
    ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
  const el = document.createElement('div');
  el.style.cssText = [
    `width:${size}px;height:${size}px;border-radius:9999px;flex-shrink:0`,
    `background:${color};color:#fff;font-weight:600;font-size:${Math.round(size * 0.36)}px`,
    'display:flex;align-items:center;justify-content:center;font-family:var(--font-sans);user-select:none'
  ].join(';');
  el.textContent = initials;
  el.title = name;
  return el;
}

export function maxWidth(host: HTMLElement, width = 760): HTMLElement {
  const inner = document.createElement('div');
  inner.style.cssText = `max-width:${width}px;margin:0 auto`;
  host.appendChild(inner);
  return inner;
}

/** Card surface: border-default, radius 10, white. */
export function card(opts: { interactive?: boolean; pad?: string } = {}): HTMLElement {
  const el = document.createElement('div');
  el.style.cssText = [
    'background:var(--surface-card);border:1px solid var(--border-default)',
    'border-radius:10px',
    `padding:${opts.pad ?? '18px 20px'}`
  ].join(';');
  if (opts.interactive) {
    el.style.transition =
      'border-color var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-out)';
    el.style.cursor = 'pointer';
    el.addEventListener('mouseenter', () => {
      el.style.borderColor = 'var(--border-strong)';
      el.style.transform = 'translateY(-1px)';
    });
    el.addEventListener('mouseleave', () => {
      el.style.borderColor = 'var(--border-default)';
      el.style.transform = 'translateY(0)';
    });
  }
  return el;
}

const BACK_ARROW_SVG =
  '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>';

/** Plain back link ("← Back to Course") — prototype style. */
export function backLink(label: string, onClick: () => void): HTMLElement {
  const el = document.createElement('span');
  el.style.cssText =
    'display:inline-flex;align-items:center;gap:5px;font-size:12.5px;color:var(--text-tertiary);cursor:pointer;align-self:flex-start;transition:color var(--dur-fast) var(--ease-out)';
  el.innerHTML = `${BACK_ARROW_SVG}<span>${label}</span>`;
  el.addEventListener('mouseenter', () => {
    el.style.color = 'var(--text-primary)';
  });
  el.addEventListener('mouseleave', () => {
    el.style.color = 'var(--text-tertiary)';
  });
  el.addEventListener('click', onClick);
  return el;
}

/** Page-level header: optional back link, 22px title, subtitle + right actions. */
export function pageHeader(
  title: string,
  opts: {
    subtitle?: string;
    actions?: HTMLElement[];
    back?: () => void;
    backLabel?: string;
  } = {}
): HTMLElement {
  const outer = document.createElement('div');
  outer.style.cssText =
    'margin-bottom:20px;display:flex;flex-direction:column;gap:8px';

  if (opts.back) {
    outer.appendChild(
      backLink(`Back to ${opts.backLabel ?? 'Course'}`, opts.back)
    );
  }

  const wrap = document.createElement('div');
  wrap.style.cssText =
    'display:flex;align-items:flex-end;justify-content:space-between;gap:16px';
  const left = document.createElement('div');
  left.style.cssText = 'min-width:0;display:flex;flex-direction:column;gap:6px';
  const h = document.createElement('h1');
  h.style.cssText =
    'margin:0;font-size:22px;font-weight:600;letter-spacing:-0.018em;line-height:1.2;color:var(--text-primary)';
  h.textContent = title;
  left.appendChild(h);
  if (opts.subtitle) {
    const s = document.createElement('div');
    s.style.cssText = 'font-size:13px;color:var(--text-tertiary);line-height:1.5';
    s.textContent = opts.subtitle;
    left.appendChild(s);
  }
  wrap.appendChild(left);
  if (opts.actions?.length) {
    const right = document.createElement('div');
    right.style.cssText = 'display:flex;gap:8px;flex-shrink:0;align-items:center';
    opts.actions.forEach(a => right.appendChild(a));
    wrap.appendChild(right);
  }
  outer.appendChild(wrap);
  return outer;
}

/** Section label — 13px/600 secondary (prototype "Your uploads" style). */
export function sectionHeader(text: string, action?: HTMLElement): HTMLElement {
  const row = document.createElement('div');
  row.style.cssText =
    'display:flex;align-items:center;justify-content:space-between;gap:12px;margin:24px 0 10px';
  const lbl = document.createElement('div');
  lbl.style.cssText = 'font-size:13px;font-weight:600;color:var(--text-secondary)';
  lbl.textContent = text;
  row.appendChild(lbl);
  if (action) row.appendChild(action);
  return row;
}

/** Segmented control — prototype mode-switch recipe (active = white + ring). */
export function segmented(
  items: { id: string; label: string }[],
  active: string,
  onChange: (id: string) => void
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.style.cssText = [
    'display:inline-flex;gap:2px;background:var(--bg-base)',
    'border:1px solid var(--border-subtle);border-radius:8px;padding:3px'
  ].join(';');
  const btns: Record<string, HTMLButtonElement> = {};
  const paint = (id: string) => {
    Object.entries(btns).forEach(([k, b]) => {
      const on = k === id;
      b.style.background = on ? 'var(--bg-panel)' : 'transparent';
      b.style.color = on ? 'var(--text-primary)' : 'var(--text-tertiary)';
      b.style.boxShadow = on
        ? '0 1px 2px rgba(0,0,0,0.14), 0 0 0 1px var(--border-default)'
        : 'none';
    });
  };
  items.forEach(it => {
    const b = document.createElement('button');
    b.textContent = it.label;
    b.style.cssText = [
      'border:none;border-radius:5px;padding:5px 14px;cursor:pointer',
      'font-family:var(--font-sans);font-size:12.5px;font-weight:500;line-height:1.4;white-space:nowrap',
      'transition:background-color var(--dur-fast) var(--ease-out)'
    ].join(';');
    b.addEventListener('click', () => {
      paint(it.id);
      onChange(it.id);
    });
    btns[it.id] = b;
    wrap.appendChild(b);
  });
  paint(active);
  return wrap;
}

/** Pill tab strip (Explain insight tabs / reader tabs — accent-subtle active). */
export function tabBar(
  items: { id: string; label: string }[],
  active: string,
  onChange: (id: string) => void
): HTMLElement {
  const wrap = document.createElement('div');
  wrap.style.cssText = 'display:flex;gap:2px';
  const btns: Record<string, HTMLButtonElement> = {};
  const paint = (id: string) => {
    Object.entries(btns).forEach(([k, b]) => {
      const on = k === id;
      b.style.background = on ? 'var(--accent-subtle-bg)' : 'transparent';
      b.style.color = on ? 'var(--accent-text)' : 'var(--text-tertiary)';
    });
  };
  items.forEach(it => {
    const b = document.createElement('button');
    b.textContent = it.label;
    b.style.cssText = [
      'padding:5px 12px;border:none;border-radius:6px;cursor:pointer;white-space:nowrap',
      'font-family:var(--font-sans);font-size:12px;font-weight:500;line-height:1.4',
      'transition:background-color var(--dur-fast) var(--ease-out)'
    ].join(';');
    b.addEventListener('mouseenter', () => {
      if (b.style.background === 'transparent') b.style.color = 'var(--text-primary)';
    });
    b.addEventListener('mouseleave', () => {
      paint(activeId);
    });
    b.addEventListener('click', () => {
      activeId = it.id;
      paint(it.id);
      onChange(it.id);
    });
    btns[it.id] = b;
    wrap.appendChild(b);
  });
  let activeId = active;
  paint(active);
  return wrap;
}

/** Metric tile: mono value + uppercase micro label (prototype stat tiles). */
export function statCard(value: string, label: string): HTMLElement {
  const el = card({ pad: '16px 18px' });
  el.style.cssText += ';display:flex;flex-direction:column;gap:4px;min-width:0';
  const v = document.createElement('div');
  v.style.cssText =
    'font-size:24px;font-weight:600;font-family:var(--font-mono);letter-spacing:-0.02em;color:var(--text-primary);line-height:1.1';
  v.textContent = value;
  const l = document.createElement('div');
  l.style.cssText =
    'font-size:11.5px;color:var(--text-quaternary);text-transform:uppercase;letter-spacing:0.06em;font-weight:500';
  l.textContent = label;
  el.appendChild(v);
  el.appendChild(l);
  return el;
}

/** Badge (Linear): 20px pill, optional leading dot. */
export function tag(
  text: string,
  tone: 'neutral' | 'accent' | 'success' | 'warning' | 'danger' = 'neutral',
  dot = false
): HTMLElement {
  const tones: Record<string, [string, string, string]> = {
    neutral: ['var(--alpha-8)', 'var(--text-secondary)', 'var(--border-default)'],
    accent: ['var(--accent-subtle-bg)', 'var(--accent-text)', 'transparent'],
    success: ['var(--green-bg)', 'var(--green-500)', 'transparent'],
    warning: ['var(--yellow-bg)', 'var(--yellow-500)', 'transparent'],
    danger: ['var(--red-bg)', 'var(--red-500)', 'transparent']
  };
  const [bg, fg, bd] = tones[tone];
  const el = document.createElement('span');
  el.style.cssText = [
    `display:inline-flex;align-items:center;gap:6px;background:${bg};color:${fg}`,
    `border:1px solid ${bd};height:20px;box-sizing:border-box;padding:0 8px`,
    'border-radius:9999px;font-size:12px;font-weight:500;line-height:1;letter-spacing:-0.01em;white-space:nowrap'
  ].join(';');
  if (dot) {
    const d = document.createElement('span');
    d.style.cssText =
      'width:6px;height:6px;border-radius:50%;background:currentColor;flex-shrink:0';
    el.appendChild(d);
  }
  const t = document.createElement('span');
  t.textContent = text;
  el.appendChild(t);
  return el;
}

/* ── Linear StatusIcon (backlog dashed · started pie · done check) ── */
export type NbStatusIcon = 'done' | 'started' | 'backlog';

export function statusIcon(status: NbStatusIcon, size = 15): HTMLElement {
  const colors: Record<NbStatusIcon, string> = {
    backlog: 'var(--status-backlog)',
    started: 'var(--status-started)',
    done: 'var(--status-done)'
  };
  const c = colors[status];
  const span = document.createElement('span');
  span.style.cssText = `display:inline-flex;flex-shrink:0;width:${size}px;height:${size}px`;
  if (status === 'backlog') {
    span.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6.5" fill="none" stroke="${c}" stroke-width="1.5" stroke-dasharray="1.6 2.2"></circle></svg>`;
  } else if (status === 'done') {
    span.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 16 16"><circle cx="8" cy="8" r="7" fill="${c}"></circle><path d="M4.6 8.2 6.9 10.5 11.4 5.8" fill="none" stroke="#fff" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"></path></svg>`;
  } else {
    const r = 3.5;
    const dash = 2 * Math.PI * r;
    span.innerHTML = `<svg width="${size}" height="${size}" viewBox="0 0 16 16"><circle cx="8" cy="8" r="6.5" fill="none" stroke="${c}" stroke-width="1.5"></circle><circle cx="8" cy="8" r="${r}" fill="none" stroke="${c}" stroke-width="7" stroke-dasharray="${dash * 0.5} ${dash}" transform="rotate(-90 8 8)"></circle></svg>`;
  }
  return span;
}

/** ProgressRing — circular completion indicator. */
export function progressRing(
  value: number,
  size = 56,
  thickness = 5,
  color = 'var(--accent)'
): HTMLElement {
  const v = Math.max(0, Math.min(100, value));
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  const half = size / 2;
  const span = document.createElement('span');
  span.style.cssText = `display:inline-flex;flex-shrink:0;width:${size}px;height:${size}px`;
  span.innerHTML =
    `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">` +
    `<circle cx="${half}" cy="${half}" r="${r}" fill="none" stroke="var(--alpha-14)" stroke-width="${thickness}"></circle>` +
    `<circle cx="${half}" cy="${half}" r="${r}" fill="none" stroke="${color}" stroke-width="${thickness}" stroke-dasharray="${(c * v) / 100} ${c}" stroke-linecap="round" transform="rotate(-90 ${half} ${half})"></circle>` +
    `</svg>`;
  return span;
}

/** Small celebration chip (top-right): "+12 XP · first try!" */
export function celebrate(msg: string): void {
  const existing = document.getElementById('nm-celebrate-chip');
  if (existing) existing.remove();
  const chip = document.createElement('div');
  chip.id = 'nm-celebrate-chip';
  chip.style.cssText = [
    'position:fixed;top:60px;right:24px;z-index:3000;padding:8px 14px;border-radius:9999px',
    'background:var(--surface-card);border:1px solid rgba(94,106,210,0.5);color:var(--accent-text)',
    'font-size:13px;font-weight:600;font-family:var(--font-sans)',
    'box-shadow:0 4px 16px rgba(0,0,0,0.10), 0 0 12px var(--brand-glow)',
    'animation:nm-pop 1.4s var(--ease-out) both;pointer-events:none'
  ].join(';');
  chip.textContent = msg;
  document.body.appendChild(chip);
  setTimeout(() => chip.remove(), 1500);
}
